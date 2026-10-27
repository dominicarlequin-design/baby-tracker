// Partner alert: when one parent logs something, push it to the other
// parent's phones ("Ysa logged a feed / 4 oz · 3:42 PM"). Also sends the
// "Running low: Diapers" alert to every phone (migration 0006).
//
// Called by the baby_events_notify_partner trigger (migration 0005) through
// pg_net, with the same x-cron-secret that guards check-overdue. Phones
// whose push subscription belongs to the person who logged are skipped, as
// are subscriptions with no owner yet (the app fills that in the next time
// that phone opens it).
//
// logText.js is a copy of lib/logText.js (npm run sync:edge).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { describeLog, parentName } from "./logText.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const provided = req.headers.get("x-cron-secret");
    const { data: expected, error: secretErr } = await admin.rpc("app_get_secret", { secret_name: "cron_shared_secret" });
    if (secretErr) throw secretErr;
    if (!provided || !expected || provided !== expected) return json({ error: "unauthorized" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch (_e) { body = {}; }

    // Low supply (from the baby_supplies_low trigger, migration 0006): tell
    // every phone, since either parent might be the one at the store.
    if (body?.supply) {
      const sup = body.supply;
      const { data: cfg, error: cfgErr } = await admin.from("baby_config").select("vapid_public_key").eq("id", 1).single();
      if (cfgErr) throw cfgErr;
      const { data: vapidPriv, error: vErr } = await admin.rpc("app_get_secret", { secret_name: "vapid_private_key" });
      if (vErr) throw vErr;
      if (!cfg.vapid_public_key || !vapidPriv) return json({ error: "vapid keys not configured" }, 500);
      webpush.setVapidDetails("mailto:dominic.arlequin@gmail.com", cfg.vapid_public_key, vapidPriv);
      const { data: all, error: allErr } = await admin.from("push_subscriptions").select("*");
      if (allErr) throw allErr;
      const left = `${sup.count} ${sup.unit || ""}`.trim();
      const payload = JSON.stringify({
        title: `Running low: ${sup.name}`,
        body: `${left} left · added to the shopping list`,
        category: "supply",
        tag: `supply-${sup.id}`,
      });
      let sentLow = 0;
      const staleLow: string[] = [];
      for (const sub of all ?? []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
          sentLow++;
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) staleLow.push(sub.endpoint);
          else console.error("supply push failed:", err?.message || err);
        }
      }
      if (staleLow.length) await admin.from("push_subscriptions").delete().in("endpoint", staleLow);
      return json({ sent: sentLow, kind: "supply" });
    }

    const record = body?.record;
    if (!record || !record.type) return json({ error: "no record" }, 400);
    const loggedBy = String(record.logged_by || "").toLowerCase();
    if (!loggedBy) return json({ skipped: "no logger" });

    const { data: config, error: configErr } = await admin.from("baby_config").select("timezone, vapid_public_key").eq("id", 1).single();
    if (configErr) throw configErr;

    const { data: subs, error: subsErr } = await admin
      .from("push_subscriptions")
      .select("*")
      .not("user_email", "is", null)
      .neq("user_email", loggedBy);
    if (subsErr) throw subsErr;
    if (!subs || subs.length === 0) return json({ sent: 0 });

    const { data: vapidPrivate, error: vapidErr } = await admin.rpc("app_get_secret", { secret_name: "vapid_private_key" });
    if (vapidErr) throw vapidErr;
    if (!config.vapid_public_key || !vapidPrivate) return json({ error: "vapid keys not configured" }, 500);
    webpush.setVapidDetails("mailto:dominic.arlequin@gmail.com", config.vapid_public_key, vapidPrivate);

    const who = parentName(loggedBy) || "Someone";
    const { action, detail } = describeLog(record);
    const time = new Intl.DateTimeFormat("en-US", {
      timeZone: config.timezone || "America/New_York", hour: "numeric", minute: "2-digit",
    }).format(new Date(record.event_time));
    const payload = JSON.stringify({
      title: `${who} ${action}`,
      body: detail ? `${detail} · ${time}` : time,
      category: "partner-log",
      tag: `log-${record.id}`,
    });

    let sent = 0;
    const stale: string[] = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(sub.endpoint);
        else console.error("partner push failed:", err?.message || err);
      }
    }
    if (stale.length) await admin.from("push_subscriptions").delete().in("endpoint", stale);

    return json({ sent, pruned: stale.length });
  } catch (err: any) {
    console.error(err);
    return json({ error: err?.message || String(err) }, 500);
  }
});
