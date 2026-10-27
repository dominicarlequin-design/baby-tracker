'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import { ThemeToggle } from '../../lib/theme';
import { TabBar } from '../../lib/TabBar';
import { SheetHead } from '../../lib/homeUi';
import { parentName } from '../../lib/logText';
import { useSupplies, isCounted, isLow, restockSteps, countLine, onList } from '../../lib/supplies';

// Supplies: how many diapers / wipes / cans are on hand, and a shopping
// list both parents share. Diapers count down on their own (the database
// subtracts one per diaper log); everything else is +/- here. When a
// count hits its low point the item lands on the shopping list and both
// phones get a "Running low" alert (migration 0006, notify-log).

const PLUS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>;
const MINUS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>;
const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const CROSS = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>;

function SupplyRow({ s, listed, onBump, onOpen, onAddToList }) {
  const low = isLow(s);
  return (
    <li className={`supply-row${low ? ' is-low' : ''}`}>
      <div className="supply-info">
        <button type="button" className="supply-main" onClick={onOpen} aria-label={`${s.name}: ${countLine(s)}. Edit or restock`}>
          <span className="supply-name">{s.name}</span>
          <span className="supply-sub">
            {low ? (
              <>
                <span className="supply-low-chip">Running low</span>
                {listed ? <span className="supply-onlist">On the list</span> : null}
              </>
            ) : isCounted(s) ? (
              s.track === 'diaper' ? `Counts down when you log a diaper` : `Low at ${s.low_at}`
            ) : (
              'Not counted yet'
            )}
          </span>
        </button>
        {low && !listed && (
          <button type="button" className="supply-addlist" onClick={onAddToList}>{PLUS}Add to list</button>
        )}
      </div>
      {isCounted(s) ? (
        <div className="stepper supply-stepper" role="group" aria-label={s.name}>
          <button type="button" className="stepper-btn" aria-label={`One less ${s.name}`} disabled={s.count <= 0} onClick={() => onBump(-1)}>{MINUS}</button>
          <span className="stepper-value supply-count" aria-live="polite">
            <b>{s.count}</b>
            <small>{s.unit}</small>
          </span>
          <button type="button" className="stepper-btn" aria-label={`One more ${s.name}`} onClick={() => onBump(1)}>{PLUS}</button>
        </div>
      ) : (
        <button type="button" className="supply-count-btn" onClick={onOpen}>Count</button>
      )}
    </li>
  );
}

// Restock / edit sheet. Everything here is a draft until Save, so a few
// taps on +20 can be undone by closing. The count is saved as a +/-
// change (adjust_supply) so a diaper logged meanwhile isn't lost.
function SupplySheet({ supply, onClose, onSave, onDelete }) {
  const isNew = !supply.id;
  const [count, setCount] = useState(isCounted(supply) ? supply.count : null);
  const [countText, setCountText] = useState(isCounted(supply) ? String(supply.count) : '');
  const [name, setName] = useState(supply.name || '');
  const [unit, setUnit] = useState(supply.unit || '');
  const [lowAt, setLowAt] = useState(supply.low_at ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setBoth = (n) => { setCount(n); setCountText(n == null ? '' : String(n)); };
  const steps = restockSteps({ low_at: lowAt });
  const added = isCounted(supply) && count != null ? count - supply.count : null;

  const save = async () => {
    if (!name.trim()) { setError('Give it a name.'); return; }
    setBusy(true);
    setError(null);
    const err = await onSave({ name: name.trim(), unit: unit.trim(), low_at: lowAt, count });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal milk-sheet supply-sheet" role="dialog" aria-label={isNew ? 'New supply' : supply.name} onClick={e => e.stopPropagation()}>
        <SheetHead title={isNew ? 'New supply' : supply.name} onClose={onClose} />

        <div className="supply-sheet-count">
          <span className="supply-sheet-num">{count ?? '–'}</span>
          <span className="supply-sheet-unit">{unit || 'on hand'}</span>
          {added ? <span className={`supply-sheet-delta${added < 0 ? ' is-minus' : ''}`}>{added > 0 ? `+${added}` : added}</span> : null}
        </div>

        <div className="form-label">Just bought some?</div>
        <div className="supply-quick">
          {steps.map(n => (
            <button key={n} type="button" className="choice" onClick={() => setBoth((count ?? 0) + n)}>+{n}</button>
          ))}
        </div>

        <label className="form-label" htmlFor="supply-count">Or type how many you have</label>
        <input
          id="supply-count"
          className="form-input"
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="0"
          value={countText}
          onChange={e => {
            setCountText(e.target.value);
            const n = parseInt(e.target.value, 10);
            setCount(Number.isFinite(n) && n >= 0 ? n : null);
          }}
        />

        <div className="supply-sheet-fields">
          <div>
            <label className="form-label" htmlFor="supply-name">Name</label>
            <input id="supply-name" className="form-input" maxLength={40} placeholder="Diapers" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label" htmlFor="supply-unit">Counted in</label>
            <input id="supply-unit" className="form-input" maxLength={20} placeholder="packs" value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>

        <div className="stepper-row">
          <div className="stepper-text">
            <div className="stepper-label">Running low at</div>
            <div className="stepper-hint">Goes on the shopping list and both phones get a heads-up</div>
          </div>
          <div className="stepper" role="group" aria-label="Running low at">
            <button type="button" className="stepper-btn" aria-label="Lower" disabled={lowAt <= 0} onClick={() => setLowAt(v => Math.max(0, v - (v > 10 ? 5 : 1)))}>{MINUS}</button>
            <span className="stepper-value">{lowAt}</span>
            <button type="button" className="stepper-btn" aria-label="Higher" disabled={lowAt >= 500} onClick={() => setLowAt(v => Math.min(500, v + (v >= 10 ? 5 : 1)))}>{PLUS}</button>
          </div>
        </div>

        {supply.track === 'diaper' && (
          <div className="form-hint supply-track-note">Takes one off every time anyone logs a diaper.</div>
        )}
        {error && <div className="form-message error">{error}</div>}

        <div className="modal-actions">
          {!isNew && (
            confirmDelete ? (
              <button type="button" className="modal-btn-delete" onClick={() => onDelete()} disabled={busy}>Delete it</button>
            ) : (
              <button type="button" className="modal-btn-cancel" onClick={() => setConfirmDelete(true)} disabled={busy}>Remove</button>
            )
          )}
          <button type="button" className="modal-btn-confirm" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuppliesPage() {
  const { supplies, setSupplies, shopping, setShopping, loading, refresh } = useSupplies({ shopping: true });
  const [editing, setEditing] = useState(null);
  const [newItem, setNewItem] = useState('');
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (error) { const t = setTimeout(() => setError(null), 4000); return () => clearTimeout(t); } }, [error]);

  const fail = (e) => { console.error(e); setError("Couldn't save that. Check your connection and try again."); refresh(); };

  const bump = async (s, delta) => {
    setSupplies(list => list.map(x => (x.id === s.id ? { ...x, count: Math.max(0, (x.count ?? 0) + delta) } : x)));
    const { error: e } = await supabase.rpc('adjust_supply', { supply_id: s.id, delta });
    if (e) fail(e);
  };

  const addToList = async (item) => {
    const text = item.trim();
    if (!text) return;
    const temp = { id: `temp-${Date.now()}`, item: text, done: false, created_at: new Date().toISOString() };
    setShopping(list => [temp, ...list]);
    const { data, error: e } = await supabase.from('baby_shopping').insert({ item: text }).select().single();
    if (e) return fail(e);
    setShopping(list => list.map(x => (x.id === temp.id ? data : x)));
  };

  const toggleItem = async (it) => {
    const done = !it.done;
    setShopping(list => list.map(x => (x.id === it.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    const { error: e } = await supabase.from('baby_shopping').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', it.id);
    if (e) fail(e);
  };

  const removeItem = async (it) => {
    setShopping(list => list.filter(x => x.id !== it.id));
    const { error: e } = await supabase.from('baby_shopping').delete().eq('id', it.id);
    if (e) fail(e);
  };

  const clearBought = async () => {
    setShopping(list => list.filter(x => !x.done));
    const { error: e } = await supabase.from('baby_shopping').delete().eq('done', true);
    if (e) fail(e);
  };

  const saveSupply = async ({ name, unit, low_at, count }) => {
    const s = editing;
    if (!s.id) {
      const { error: e } = await supabase.from('baby_supplies')
        .insert({ name, unit, low_at, count, sort: supplies.length + 1 });
      if (e) { console.error(e); return "Couldn't add it. Try again."; }
    } else {
      // Name/unit/low point first, then the count as a +/- change.
      const { error: e1 } = await supabase.from('baby_supplies').update({ name, unit, low_at }).eq('id', s.id);
      if (e1) { console.error(e1); return "Couldn't save. Try again."; }
      if (count != null && count !== s.count) {
        const res = isCounted(s)
          ? await supabase.rpc('adjust_supply', { supply_id: s.id, delta: count - s.count })
          : await supabase.from('baby_supplies').update({ count }).eq('id', s.id);
        if (res.error) { console.error(res.error); return "Couldn't save the count. Try again."; }
      }
    }
    setEditing(null);
    refresh();
    return null;
  };

  const deleteSupply = async () => {
    const s = editing;
    setEditing(null);
    setSupplies(list => list.filter(x => x.id !== s.id));
    const { error: e } = await supabase.from('baby_supplies').delete().eq('id', s.id);
    if (e) fail(e);
  };

  const toBuy = shopping.filter(x => !x.done);
  const bought = shopping.filter(x => x.done);
  const lowCount = supplies.filter(isLow).length;

  return (
    <div className="wrap supplies-page">
      <div className="header-row">
        <div>
          <Link href="/" className="header-back-link">&lsaquo; Today</Link>
          <h1>Supplies</h1>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="info-item">Loading{'…'}</div></div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <div className="section-title">On hand</div>
              {lowCount > 0 && <span className="supply-head-note">{lowCount} running low</span>}
            </div>
            {supplies.length === 0 && <div className="form-hint">Nothing here yet. Add the things you buy most.</div>}
            <ul className="supply-list">
              {supplies.map(s => (
                <SupplyRow
                  key={s.id}
                  s={s}
                  listed={onList(s, shopping)}
                  onBump={d => bump(s, d)}
                  onOpen={() => setEditing(s)}
                  onAddToList={() => addToList(s.name)}
                />
              ))}
            </ul>
            <button type="button" className="add-row-btn" onClick={() => setEditing({ name: '', unit: '', low_at: 1, count: null })}>
              {PLUS}Add supply
            </button>
          </div>

          <div className="card">
            <div className="card-head">
              <div className="section-title">Shopping list</div>
              {toBuy.length > 0 && <span className="supply-head-note is-plain">{toBuy.length} to buy</span>}
            </div>
            <form
              className="shop-add"
              onSubmit={e => { e.preventDefault(); addToList(newItem); setNewItem(''); inputRef.current?.focus(); }}
            >
              <input
                ref={inputRef}
                className="form-input"
                maxLength={60}
                placeholder="Add an item"
                aria-label="Add an item"
                value={newItem}
                onChange={e => setNewItem(e.target.value)}
              />
              <button type="submit" className="shop-add-btn" aria-label="Add to list" disabled={!newItem.trim()}>{PLUS}</button>
            </form>

            {toBuy.length === 0 && bought.length === 0 && (
              <div className="form-hint shop-empty">All stocked up. Low supplies show up here on their own.</div>
            )}
            <ul className="shop-list">
              {toBuy.map(it => (
                <li key={it.id} className="shop-item">
                  <button type="button" className="shop-check" role="checkbox" aria-checked="false" aria-label={`Bought ${it.item}`} onClick={() => toggleItem(it)} />
                  <span className="shop-text">
                    {it.item}
                    {it.added_by === 'app' ? <small>Running low</small> : parentName(it.added_by) ? <small>{parentName(it.added_by)}</small> : null}
                  </span>
                  <button type="button" className="med-remove" aria-label={`Remove ${it.item}`} onClick={() => removeItem(it)}>{CROSS}</button>
                </li>
              ))}
            </ul>

            {bought.length > 0 && (
              <>
                <div className="shop-bought-head">
                  <span>Bought</span>
                  <button type="button" className="shop-clear" onClick={clearBought}>Clear</button>
                </div>
                <ul className="shop-list is-bought">
                  {bought.map(it => (
                    <li key={it.id} className="shop-item is-done">
                      <button type="button" className="shop-check" role="checkbox" aria-checked="true" aria-label={`Not bought yet: ${it.item}`} onClick={() => toggleItem(it)}>{CHECK}</button>
                      <span className="shop-text">{it.item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </>
      )}

      {error && <div className="toast show">{error}</div>}

      {editing && (
        <SupplySheet
          key={editing.id || 'new'}
          supply={editing}
          onClose={() => setEditing(null)}
          onSave={saveSupply}
          onDelete={deleteSupply}
        />
      )}

      <TabBar active="log" />
    </div>
  );
}
