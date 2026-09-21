import { createClient } from '@supabase/supabase-js';

// Server-only client (service role key — bypasses RLS). NEVER import this
// from a Client Component or anything that ships to the browser; the
// service role key must never reach client JS. This exists specifically
// for app/api/check-overdue, which needs to read every push_subscriptions
// row (not just "whatever the anon role's policy happens to expose") and
// delete ones that have gone stale (a browser unsubscribing/uninstalling
// doesn't reliably clean up its own row).
//
// Lazily constructed for the same reason as lib/supabase.js's getSupabase():
// a build-time static-generation pass can pull this module in without env
// vars loaded, and an eager throw there would fail the whole build even
// though real requests always have them.
let client = null;

function getSupabaseAdmin() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return client;
}

export const supabaseAdmin = new Proxy({}, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop];
  },
});
