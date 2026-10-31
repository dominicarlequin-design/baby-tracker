// Quick log for iPhone Shortcuts (migration 0010). A Shortcut calls
//   https://<project>.supabase.co/functions/v1/quick-log?key=KEY&type=feed&oz=4
// (or sends the key in an x-quick-key header) and gets back one line of
// text to show, e.g. "Logged a feed, 4 oz · 2:04 AM".
//
// The key is checked by hashing it and looking the hash up in
// quick_log_keys; the row is logged as that key's owner, so partner alerts
// and "who logged it" work as if it came from the app.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TYPES: Record<string, string> = {
  feed: "a feed",
  diaper: "a diaper",
  nap_start: "nap start",
  nap_end: "nap end",
  sleep_start: "bedtime",
  sleep_end: "wake up",
  medicine: "medicine",
};
const DIAPER = new Set(["pee", "poop", "both"]);
const DIAPER_WORDS: Record<string, string> = { pee: "wet", poop: "dirty", both: "wet + dirty" };
// Same thing logged this recently counts as a double tap and is skipped.
const DOUBLE_TAP_SECONDS = 120;

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    let params: Record<string, string> = Object.fromEntries(url.searchParams);
    if (req.method === "POST") {
      try { params = { ...params, ...(await req.json()) }; } catch (_e) { /* query only */ }
    }
    const key = String(req.headers.get("x-quick-key") || params.key || "");
    if (key.length < 32) return text("Missing or invalid key. Make a new one in Bay Bee Tracker > Profile.", 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: owner, error: ownerErr } = await admin.from("quick_log_keys")
      .select("id, user_email").eq("key_hash", await sha256Hex(key)).maybeSingle();
    if (ownerErr) throw ownerErr;
    if (!owner || !owner.user_email) return text("This key was removed. Make a new one in Bay Bee Tracker > Profile.", 401);

    const type = String(params.type || "");
    if (!TYPES[type]) return text(`Unknown type "${type}". Use one of: ${Object.keys(TYPES).join(", ")}.`, 400);
    const row: Record<string, unknown> = { type, event_time: new Date().toISOString(), logged_by: owner.user_email };
    if (type === "feed" && params.oz != null && params.oz !== "") {
      const oz = Number(params.oz);
      if (!Number.isInteger(oz) || oz < 1 || oz > 8) return text("Ounces must be a whole number from 1 to 8.", 400);
      row.feed_ounces = oz;
    }
    if (type === "diaper" && params.detail) {
      if (!DIAPER.has(String(params.detail))) return text("Diaper detail must be pee, poop or both.", 400);
      row.diaper_detail = String(params.detail);
    }

    const { data: cfg } = await admin.from("baby_config").select("timezone").eq("id", 1).single();
    const tz = cfg?.timezone || "America/New_York";
    const clock = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

    const since = new Date(Date.now() - DOUBLE_TAP_SECONDS * 1000).toISOString();
    const { data: recent } = await admin.from("baby_events").select("id, event_time")
      .eq("type", type).gte("event_time", since).limit(1);
    if (recent && recent.length) return text(`Already logged ${TYPES[type]} at ${clock(recent[0].event_time)}. Skipped the double tap.`);

    const { error: insErr } = await admin.from("baby_events").insert(row);
    if (insErr) throw insErr;
    await admin.from("quick_log_keys").update({ last_used_at: new Date().toISOString() }).eq("id", owner.id);

    const detail = row.feed_ounces ? `, ${row.feed_ounces} oz` : row.diaper_detail ? `, ${DIAPER_WORDS[String(row.diaper_detail)]}` : "";
    return text(`Logged ${TYPES[type]}${detail} · ${clock(String(row.event_time))}`);
  } catch (err) {
    console.error(err);
    return text("Couldn't log that. Try again, or open the app.", 500);
  }
});
