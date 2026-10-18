import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { computeStatus, localDateStr, localDateTimeToUtc } from "./logic.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MEDICINE_APPROACHING_MINUTES = 20;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function fmtTime(iso, timezone) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function nextMedicineSlot(config, now) {
  const { medicine_times_local, timezone } = config;
  let nextSlot = null;
  for (const dayOffset of [0, 1]) {
    const dayStr = localDateStr(addDays(now, dayOffset), timezone);
    for (const t of medicine_times_local) {
      const slot = localDateTimeToUtc(dayStr, t, timezone);
      if (slot.getTime() > now.getTime()) {
        if (!nextSlot || slot.getTime() < nextSlot.getTime()) nextSlot = slot;
      }
    }
  }
  return nextSlot;
}

function buildCandidates(status, config, now) {
  const candidates = [];

  if (status.feed.overdue) {
    candidates.push({ category: "feed", level: "overdue", episodeKey: status.feed.lastEventTime, title: "Feed overdue", body: `Was due ${fmtTime(status.feed.dueAt, config.timezone)}` });
  } else if (status.feed.state === "due-soon") {
    candidates.push({ category: "feed", level: "due_soon", episodeKey: status.feed.dueAt, title: "Feed due soon", body: `Due around ${fmtTime(status.feed.dueAt, config.timezone)}` });
  }

  if (status.diaper.overdue) {
    candidates.push({ category: "diaper", level: "overdue", episodeKey: status.diaper.lastEventTime, title: "Diaper overdue", body: `Was due ${fmtTime(status.diaper.dueAt, config.timezone)}` });
  } else if (status.diaper.state === "due-soon") {
    candidates.push({ category: "diaper", level: "due_soon", episodeKey: status.diaper.dueAt, title: "Diaper due soon", body: `Due around ${fmtTime(status.diaper.dueAt, config.timezone)}` });
  }

  if (status.nap.state === "due-soon" && status.nap.dueAt) {
    candidates.push({ category: "nap", level: "due_soon", episodeKey: status.nap.dueAt, title: "Nap due soon", body: `Due around ${fmtTime(status.nap.dueAt, config.timezone)}` });
  }

  if (status.sleep.overdue) {
    candidates.push({ category: "sleep", level: "overdue", episodeKey: status.sleep.lastEventTime ?? status.sleep.dueAt, title: "Bedtime overdue", body: `Was due ${fmtTime(status.sleep.dueAt, config.timezone)}` });
  } else if (status.sleep.state === "due-soon") {
    candidates.push({ category: "sleep", level: "due_soon", episodeKey: status.sleep.dueAt, title: "Bedtime coming up", body: `Due around ${fmtTime(status.sleep.dueAt, config.timezone)}` });
  }

  if (status.medicine.overdue) {
    candidates.push({ category: "medicine", level: "overdue", episodeKey: status.medicine.lastScheduledSlot, title: "Medicine overdue", body: `Was due ${fmtTime(status.medicine.lastScheduledSlot, config.timezone)}` });
  } else {
    const nextSlot = nextMedicineSlot(config, now);
    if (nextSlot && (nextSlot.getTime() - now.getTime()) / 60000 <= MEDICINE_APPROACHING_MINUTES) {
      candidates.push({ category: "medicine", level: "due_soon", episodeKey: nextSlot.toISOString(), title: "Medicine coming up", body: `Due around ${fmtTime(nextSlot.toISOString(), config.timezone)}` });
    }
  }

  return candidates;
}

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const providedSecret = req.headers.get("x-cron-secret");
    const { data: expectedSecret, error: secretErr } = await admin.rpc("app_get_secret", { secret_name: "cron_shared_secret" });
    if (secretErr) throw secretErr;
    if (!providedSecret || !expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    let reqBody = {};
    try { reqBody = await req.json(); } catch (_e) { reqBody = {}; }

    const { data: config, error: configErr } = await admin.from("baby_config").select("*").eq("id", 1).single();
    if (configErr) throw configErr;

    // Manual smoke-test path: sends one real push to every registered
    // device immediately, bypassing overdue/due-soon detection and the
    // episode dedupe entirely. Still gated by the same cron secret check
    // above, so it's not an open endpoint -- just a way to confirm a
    // subscription is actually wired up without waiting for something to
    // really become overdue.
    if (reqBody && reqBody.test === true) {
      const { data: vapidPrivateTest, error: vapidErrTest } = await admin.rpc("app_get_secret", { secret_name: "vapid_private_key" });
      if (vapidErrTest) throw vapidErrTest;
      const vapidPublicTest = config.vapid_public_key;
      if (!vapidPublicTest || !vapidPrivateTest) {
        return new Response(JSON.stringify({ error: "vapid keys not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      webpush.setVapidDetails("mailto:dominic.arlequin@gmail.com", vapidPublicTest, vapidPrivateTest);

      const { data: subs, error: subsErrTest } = await admin.from("push_subscriptions").select("*");
      if (subsErrTest) throw subsErrTest;

      const payload = JSON.stringify({ title: "Test alert", body: "Phone alerts are working.", category: "test", tag: "test-push" });
      const results = [];
      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          results.push({ endpoint: sub.endpoint.slice(-12), ok: true });
        } catch (err) {
          results.push({ endpoint: sub.endpoint.slice(-12), ok: false, error: (err && err.message) || String(err), statusCode: err && err.statusCode });
        }
      }
      return new Response(JSON.stringify({ test: true, subscriptions: (subs ?? []).length, results }), { headers: { "Content-Type": "application/json" } });
    }

    const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: eventsErr } = await admin.from("baby_events").select("*").gte("event_time", sinceIso);
    if (eventsErr) throw eventsErr;

    const now = new Date();
    const status = computeStatus(events ?? [], config, now);
    const candidates = buildCandidates(status, config, now);

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ candidates: [], sent: [] }), { headers: { "Content-Type": "application/json" } });
    }

    const { data: existingNotifs } = await admin.from("overdue_notifications").select("*");
    const existingByKey = Object.fromEntries((existingNotifs ?? []).map((n) => [`${n.category}:${n.level}`, n]));

    const toNotify = candidates.filter((c) => {
      const existing = existingByKey[`${c.category}:${c.level}`];
      return !existing || existing.episode_key !== c.episodeKey;
    });

    if (toNotify.length === 0) {
      return new Response(JSON.stringify({ candidates: candidates.map((c) => `${c.category}:${c.level}`), sent: [] }), { headers: { "Content-Type": "application/json" } });
    }

    const { data: vapidPrivate, error: vapidErr } = await admin.rpc("app_get_secret", { secret_name: "vapid_private_key" });
    if (vapidErr) throw vapidErr;
    const vapidPublic = config.vapid_public_key;
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: "vapid keys not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    webpush.setVapidDetails("mailto:dominic.arlequin@gmail.com", vapidPublic, vapidPrivate);

    const { data: subscriptions, error: subsErr } = await admin.from("push_subscriptions").select("*");
    if (subsErr) throw subsErr;

    const sent = [];
    const staleEndpoints = [];

    for (const candidate of toNotify) {
      const payload = JSON.stringify({ title: candidate.title, body: candidate.body, category: candidate.category, tag: `${candidate.category}-${candidate.level}` });

      for (const sub of subscriptions ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err) {
          const statusCode = err && err.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.push(sub.endpoint);
          } else {
            console.error(`push send failed for ${candidate.category}:${candidate.level}:`, (err && err.message) || err);
          }
        }
      }

      await admin.from("overdue_notifications").upsert(
        { category: candidate.category, level: candidate.level, episode_key: candidate.episodeKey, notified_at: now.toISOString() },
        { onConflict: "category,level" }
      );
      sent.push(`${candidate.category}:${candidate.level}`);
    }

    if (staleEndpoints.length) {
      await admin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return new Response(JSON.stringify({ candidates: candidates.map((c) => `${c.category}:${c.level}`), sent, pruned: staleEndpoints.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: (err && err.message) || String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
