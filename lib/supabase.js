import { createClient } from '@supabase/supabase-js';

// Browser-safe client (anon key). RLS on baby_events allows public
// select/insert/delete, and baby_config allows public select — that's all
// this client is used for. It cannot update baby_events (no RLS policy for
// it) or write baby_config; those go through server-side API routes using
// lib/supabaseAdmin.js instead.
//
// Lazily constructed (mirroring lib/supabaseAdmin.js's Proxy) rather than
// built at module scope: this module is now imported not just by page
// components but by app/AuthGate.js in the root layout and by
// lib/requireUser.js in API routes, both of which can get pulled into a
// static-generation or page-data-collection pass (e.g. the auto-generated
// /_not-found page) that Next/Vercel's build runs without env vars loaded.
// An eager throw there fails the whole production build even though real
// requests always have the env vars available.
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

// Bearer header for the privileged API routes (event edits, config saves),
// which check it via lib/requireUser.js since they write with the service
// role key and so get no protection from RLS.
export async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
