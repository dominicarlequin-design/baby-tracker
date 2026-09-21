import webpush from 'web-push';
import { computeStatus } from '../../../lib/logic';
import { overdueSummary } from '../../../lib/homeUi';
import { decideOverdueNotifications } from '../../../lib/notifications';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

// Must run on the Node runtime (not Edge) — the web-push library signs
// pushes with Node's crypto module.
export const runtime = 'nodejs';

// Same window app/page.js fetches — comfortably covers every category's
// rolling-average sample window without scanning unbounded history.
const HISTORY_DAYS = 30;

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fails closed: an unset secret should never silently mean "anyone can
    // trigger this," it should mean "this endpoint refuses to run."
    return Response.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization') || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : new URL(request.url).searchParams.get('secret');
  if (provided !== expected) return unauthorized();

  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPrivateKey || !vapidSubject) {
    return Response.json({ error: 'VAPID_PRIVATE_KEY or VAPID_SUBJECT is not configured' }, { status: 500 });
  }

  const now = new Date();

  const [{ data: config, error: configError }, { data: events, error: eventsError }] = await Promise.all([
    supabaseAdmin.from('baby_config').select('*').eq('id', 1).single(),
    supabaseAdmin
      .from('baby_events')
      .select('*')
      .gte('event_time', new Date(now.getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000).toISOString()),
  ]);
  if (configError) return Response.json({ error: configError.message }, { status: 500 });
  if (eventsError) return Response.json({ error: eventsError.message }, { status: 500 });
  if (!config?.vapid_public_key) {
    return Response.json({ error: 'baby_config.vapid_public_key is not set' }, { status: 500 });
  }

  webpush.setVapidDetails(vapidSubject, config.vapid_public_key, vapidPrivateKey);

  const status = computeStatus(events || [], config, now);
  const overdue = overdueSummary(status, now);

  const [{ data: stateRows, error: stateError }, { data: subscriptions, error: subsError }] = await Promise.all([
    supabaseAdmin.from('notification_state').select('*'),
    supabaseAdmin.from('push_subscriptions').select('*'),
  ]);
  if (stateError) return Response.json({ error: stateError.message }, { status: 500 });
  if (subsError) return Response.json({ error: subsError.message }, { status: 500 });

  const { toNotify, toClear } = decideOverdueNotifications(overdue, stateRows, now);

  // Categories no longer overdue: clear their state so the *next* time they
  // go overdue is treated as a fresh episode, not a continuation.
  if (toClear.length) {
    await supabaseAdmin.from('notification_state').delete().in('category', toClear);
  }

  const staleEndpoints = [];
  let sent = 0;
  if (toNotify.length && subscriptions?.length) {
    for (const item of toNotify) {
      const payload = JSON.stringify({
        title: `${item.label} overdue`,
        body: item.detail,
        tag: `overdue-${item.key}`,
      });
      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
          sent += 1;
        } catch (err) {
          // 404/410 = the browser/OS has permanently invalidated this
          // subscription (uninstalled, permission revoked, etc.) — anything
          // else (a transient network error) is left alone to retry next
          // poll rather than deleting a subscription that might still work.
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error('push send failed', sub.endpoint, err?.statusCode, err?.body || err?.message);
          }
        }
      }
    }
  }

  if (staleEndpoints.length) {
    await supabaseAdmin.from('push_subscriptions').delete().in('endpoint', staleEndpoints);
  }

  if (toNotify.length) {
    await supabaseAdmin
      .from('notification_state')
      .upsert(toNotify.map(item => ({ category: item.key, last_notified_at: now.toISOString() })), { onConflict: 'category' });
  }

  return Response.json({
    overdue: overdue.map(item => item.key),
    notified: toNotify.map(item => item.key),
    pushesSent: sent,
    staleSubscriptionsRemoved: staleEndpoints.length,
  });
}
