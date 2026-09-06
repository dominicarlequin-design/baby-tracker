import { createClient } from '@supabase/supabase-js';

// Browser-safe client (anon key). RLS grants the public role
// select/insert/delete/update on baby_events and select/update on
// baby_config, so every page — including Settings and Recent's edit-entry
// modal — goes straight through this client rather than a service-role
// route.
//
// Lazily constructed rather than built at module scope: a page component's
// module graph can get pulled into a static-generation or page-data-
// collection pass (e.g. the auto-generated /_not-found page) that
// Next/Vercel's build runs without env vars loaded. An eager throw there
// fails the whole production build even though real requests always have
// the env vars available.
let client = null;

function getSupabase() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    return getSupabase()[prop];
  },
});
