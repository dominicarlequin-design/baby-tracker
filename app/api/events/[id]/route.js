import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

// Feature 1: edit an event's time after logging. This has to go through the
// service role key server-side since RLS grants the public anon role
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

  const { event_time } = body;
  const parsed = event_time ? new Date(event_time) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: 'event_time must be a valid date' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('baby_events')
      .update({ event_time: parsed.toISOString() })
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
