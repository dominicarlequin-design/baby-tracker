import { createClient } from '@supabase/supabase-js';

// Server-only client (service role key, bypasses RLS). Never import this
// from a Client Component — the service role key must never reach the
// browser. Used by API routes for operations RLS doesn't grant to the
// public anon role: updating baby_events.event_time.
if (typeof window !== 'undefined') {
  throw new Error('lib/supabaseAdmin.js must not be imported on the client');
}

let client = null;

// Lazily constructed so importing this module never fails at build time
// (Next collects route metadata by loading modules without env vars set);
// it only throws once something actually tries to use it without the
// service role key configured.
function getSupabaseAdmin() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

export const supabaseAdmin = new Proxy({}, {
  get(_target, prop) {
    return getSupabaseAdmin()[prop];
  },
});
