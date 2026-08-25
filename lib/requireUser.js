import { createClient } from '@supabase/supabase-js';

// A route handler's own module graph gets `require()`'d during Next's
// build-time "collecting page data" step *without* env vars loaded (the
// same reason lib/supabaseAdmin.js lazily constructs its client via a
// Proxy). Importing lib/supabase.js's eagerly-constructed client here
// would throw during that step, since it reads its env vars at module
// scope — so this builds its own client lazily instead, deferred until a
// request actually calls getAuthedUser.
let client = null;

function getAuthClient() {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  client = createClient(supabaseUrl, supabaseAnonKey);
  return client;
}

// Verifies the bearer token an API route received against Supabase Auth.
// Used by routes that write with the service role key (which bypasses RLS
// entirely) so that a signed-out request can't reach them just by knowing
// the URL — the service role key's privilege makes this check the only
// gate those routes have.
export async function getAuthedUser(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data, error } = await getAuthClient().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
