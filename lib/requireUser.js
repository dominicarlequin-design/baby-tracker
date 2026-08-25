import { supabase } from './supabase';

// Verifies the bearer token an API route received against Supabase Auth.
// Used by routes that write with the service role key (which bypasses RLS
// entirely) so that a signed-out request can't reach them just by knowing
// the URL — the service role key's privilege makes this check the only
// gate those routes have.
export async function getAuthedUser(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
