'use client';

import { useEffect } from 'react';

// For bottom sheets with text fields (Journal editor, Custom log). While
// `open`: freezes the page behind the sheet, so a scroll inside the sheet
// never drags the page along, and sizes the overlay to the part of the
// screen the iOS keyboard isn't covering, so the sheet's Save button stays
// in view while typing. Everything is undone, and the page returns to the
// same scroll spot, when the sheet closes.
export function useSheetViewport(open, overlayRef) {
  useEffect(() => {
    if (!open) return undefined;
    const scrollY = window.scrollY;
    const body = document.body.style;
    const saved = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    Object.assign(body, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' });

    const vv = window.visualViewport;
    const fit = () => {
      const el = overlayRef.current;
      if (!el || !vv) return;
      el.style.top = `${vv.offsetTop}px`;
      el.style.height = `${vv.height}px`;
      el.style.bottom = 'auto';
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      Object.assign(body, saved);
      window.scrollTo(0, scrollY);
    };
  }, [open, overlayRef]);
}

// onFocus handler for a sheet body: once the keyboard has slid up, scroll
// the focused field into the visible part of the sheet.
export function keepFocusedFieldVisible(event) {
  const field = event.target;
  if (!field.matches?.('input, textarea')) return;
  setTimeout(() => field.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 320);
}
