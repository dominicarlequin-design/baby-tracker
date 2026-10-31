'use client';

// Profile > "Quick log from your Lock Screen". Makes a private key for this
// parent (only its SHA-256 hash is stored, migration 0010) and builds the
// link an iPhone Shortcut calls (supabase/functions/quick-log).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

const ENDPOINT = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/quick-log`;

const ACTIONS = [
  { id: 'feed', label: 'Fed', params: { type: 'feed' }, oz: true },
  { id: 'wet', label: 'Diaper · wet', params: { type: 'diaper', detail: 'pee' } },
  { id: 'dirty', label: 'Diaper · dirty', params: { type: 'diaper', detail: 'poop' } },
  { id: 'both', label: 'Diaper · both', params: { type: 'diaper', detail: 'both' } },
  { id: 'nap_start', label: 'Start nap', params: { type: 'nap_start' } },
  { id: 'nap_end', label: 'End nap', params: { type: 'nap_end' } },
  { id: 'sleep_start', label: 'Bedtime', params: { type: 'sleep_start' } },
  { id: 'sleep_end', label: 'Wake up', params: { type: 'sleep_end' } },
  { id: 'medicine', label: 'Medicine', params: { type: 'medicine' } },
];

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const fmtDate = (iso) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));

export function QuickLogKeys() {
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState(null); // shown once, right after it's made
  const [action, setAction] = useState('feed');
  const [oz, setOz] = useState('4');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from('quick_log_keys').select('id,label,created_at,last_used_at').order('created_at');
    if (e) { console.error(e); return; }
    setKeys(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const key = randomKey();
      const { error: e } = await supabase.from('quick_log_keys').insert({ key_hash: await sha256Hex(key), label: 'iPhone' });
      if (e) throw e;
      setNewKey(key);
      await load();
    } catch (e) {
      console.error(e);
      setError("Couldn't make a key. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const { error: e } = await supabase.from('quick_log_keys').delete().eq('id', id);
    if (e) { console.error(e); setError("Couldn't remove it. Try again."); return; }
    await load();
  };

  const link = useMemo(() => {
    if (!newKey) return '';
    const a = ACTIONS.find(x => x.id === action);
    const q = new URLSearchParams({ key: newKey, ...a.params, ...(a.oz && oz ? { oz } : {}) });
    return `${ENDPOINT}?${q.toString()}`;
  }, [newKey, action, oz]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setError('Copy failed. Press and hold the link to copy it.');
    }
  };

  return (
    <div className="card quicklog-card">
      <div className="section-title">Quick log from your Lock Screen</div>
      <p className="form-hint quicklog-intro">
        Log a feed or diaper without opening the app, using the iPhone Shortcuts app. Each link logs one thing, as you.
      </p>

      {newKey ? (
        <>
          <label className="form-label" htmlFor="quicklog-action">What should this shortcut log?</label>
          <div className="quicklog-pickers">
            <select id="quicklog-action" className="form-input form-select" value={action} onChange={e => setAction(e.target.value)}>
              {ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {ACTIONS.find(a => a.id === action)?.oz && (
              <select aria-label="Ounces" className="form-input form-select quicklog-oz" value={oz} onChange={e => setOz(e.target.value)}>
                <option value="">No amount</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n} oz</option>)}
              </select>
            )}
          </div>
          <div className="quicklog-link" aria-label="Shortcut link">{link}</div>
          <button type="button" className="modal-btn-confirm form-save" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
          <ol className="quicklog-steps">
            <li>Open the Shortcuts app and tap +.</li>
            <li>Add the action Get Contents of URL and paste the link.</li>
            <li>Add the action Show Result, so you see what was logged.</li>
            <li>Name it (for example &ldquo;Fed 4 oz&rdquo;) and tap Done.</li>
            <li>To run it fast: add it to a Lock Screen widget, or set Settings &gt; Accessibility &gt; Touch &gt; Back Tap to run it with a double tap on the back of the phone.</li>
          </ol>
          <p className="form-hint">Repeat with a different choice above for each shortcut you want. This key is only shown now; keep the links private, since anyone with one can log for you.</p>
        </>
      ) : (
        <button type="button" className={`modal-btn-confirm form-save ${busy ? 'is-loading' : ''}`} onClick={create} disabled={busy}>
          {busy && <span className="btn-spinner" />}
          {keys.length ? 'Make a new key' : 'Set up quick log'}
        </button>
      )}

      {keys.length > 0 && (
        <div className="quicklog-keys">
          {keys.map(k => (
            <div key={k.id} className="quicklog-key">
              <span>
                Key made {fmtDate(k.created_at)}
                {k.last_used_at ? ` · last used ${fmtDate(k.last_used_at)}` : ' · not used yet'}
              </span>
              <button type="button" className="quiet-btn" onClick={() => remove(k.id)}>Remove</button>
            </div>
          ))}
          <p className="form-hint">Removing a key stops every shortcut that uses it.</p>
        </div>
      )}
      {error && <div className="form-message error">{error}</div>}
    </div>
  );
}
