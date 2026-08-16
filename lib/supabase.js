import { createClient } from '@supabase/supabase-js';

// Browser-safe client (anon key). RLS on baby_events allows public
// select/insert/delete, and baby_config allows public select — that's all
// this client is used for. It cannot update baby_events (no RLS policy for
// it) or write baby_config; those go through server-side API routes using
// lib/supabaseAdmin.js instead.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
