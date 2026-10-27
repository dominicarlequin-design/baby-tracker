'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { EVENTS_CHANGED } from './logText';

// Supplies (diapers, wipes, formula...) and the shared shopping list, from
// migration 0006. The database does the counting: logging a diaper takes
// one off Diapers, and dropping to the low point puts the item on the
// shopping list and pushes "Running low" to both phones.

// count is null until someone enters how many they have.
export const isCounted = (s) => s?.count !== null && s?.count !== undefined;
export const isLow = (s) => isCounted(s) && s.count <= s.low_at;

// "+10 / +20 / +50 / +100" for things bought by the box, "+1 / +2..." for
// things bought a few at a time.
export function restockSteps(s) {
  return (s?.low_at ?? 0) >= 6 ? [10, 20, 50, 100] : [1, 2, 3, 5];
}

export function countLine(s) {
  if (!isCounted(s)) return 'Not counted yet';
  return `${s.count} ${s.unit || ''}`.trim();
}

export function onList(s, shopping) {
  const name = String(s?.name || '').trim().toLowerCase();
  return (shopping || []).some(x => !x.done && x.item.trim().toLowerCase() === name);
}

// Live supplies (and, with { shopping: true }, the shopping list). Updates
// arrive over realtime from either phone; a diaper log on this phone also
// triggers a refetch, since the count changes in the database.
export function useSupplies({ shopping: withShopping = false } = {}) {
  const [supplies, setSupplies] = useState([]);
  const [shopping, setShopping] = useState([]);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    const jobs = [supabase.from('baby_supplies').select('*').order('sort').order('id')];
    if (withShopping) jobs.push(supabase.from('baby_shopping').select('*').order('created_at', { ascending: false }).order('id', { ascending: false }));
    const [supRes, shopRes] = await Promise.all(jobs);
    if (supRes.error) console.error(supRes.error);
    else setSupplies(supRes.data || []);
    if (shopRes) {
      if (shopRes.error) console.error(shopRes.error);
      else setShopping(shopRes.data || []);
    }
    setLoading(false);
  }, [withShopping]);

  const soon = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(refresh, 200);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel(`supplies-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'baby_supplies' }, soon);
    if (withShopping) channel.on('postgres_changes', { event: '*', schema: 'public', table: 'baby_shopping' }, soon);
    channel.subscribe();
    const onEvents = (e) => { if (!e.detail || e.detail.row?.type === 'diaper' || e.detail.eventType !== 'INSERT') soon(); };
    const onVisible = () => { if (document.visibilityState === 'visible') soon(); };
    window.addEventListener(EVENTS_CHANGED, onEvents);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
      window.removeEventListener(EVENTS_CHANGED, onEvents);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, soon, withShopping]);

  return { supplies, setSupplies, shopping, setShopping, loading, refresh };
}
