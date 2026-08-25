import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';
import { getAuthedUser } from '../../../lib/requireUser';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Whitelisted, validated fields only — the settings screen is the only
// writer, and it should never be able to smuggle through an arbitrary
// column via a malformed request body.
const FIELD_VALIDATORS = {
  timezone: (v) => typeof v === 'string' && v.trim().length > 0,
  medicine_times_local: (v) => Array.isArray(v) && v.length > 0 && v.every(t => typeof t === 'string' && TIME_RE.test(t)),
  medicine_grace_minutes: (v) => Number.isFinite(v) && v >= 0,
  target_bedtime_local: (v) => typeof v === 'string' && TIME_RE.test(v),
  overdue_multiplier: (v) => Number.isFinite(v) && v > 1,
  feed_fallback_hours: (v) => Number.isFinite(v) && v > 0,
  diaper_fallback_hours: (v) => Number.isFinite(v) && v > 0,
  wake_window_fallback_hours: (v) => Number.isFinite(v) && v > 0,
};

// Edit baby_config's tunable values. Goes through the service role key
// server-side, matching app/api/events/[id]/route.js — RLS grants the
// public anon role select-only on baby_config, no update policy. The
// service role bypasses RLS entirely, so the bearer-token check below is
// this route's only access control.
export async function PATCH(request) {
  const user = await getAuthedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update = {};
  for (const [key, isValid] of Object.entries(FIELD_VALIDATORS)) {
    if (body[key] === undefined) continue;
    if (!isValid(body[key])) {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
    }
    update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('baby_config')
      .update(update)
      .eq('id', 1)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: data });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
