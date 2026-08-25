import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

const VALID_TYPES = ['feed', 'diaper', 'nap_start', 'nap_end', 'medicine', 'sleep_start', 'sleep_end'];

// Edit an event's time and/or type after logging. This has to go through
// the service role key server-side since RLS grants the public anon role
// select/insert/delete on baby_events but no update policy.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { event_time, type } = body;
  const update = {};

  if (event_time !== undefined) {
    const parsed = new Date(event_time);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: 'event_time must be a valid date' }, { status: 400 });
    }
    update.event_time = parsed.toISOString();
  }

  if (type !== undefined) {
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 });
    }
    update.type = type;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('baby_events')
      .update(update)
      .eq('id', eventId)
      .select()
      .single();

    if (error) {
      const status = error.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ event: data });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Unexpected server error' }, { status: 500 });
  }
}
