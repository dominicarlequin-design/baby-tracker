import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Redirects any request without a Supabase session to /login, for every
// route except the exclusions in config.matcher below. Runs on every
// matched request (it's the only thing standing between the public
// internet and the app once Phase 3 locks RLS down to the two allowed
// emails — a signed-out visitor should never even reach a page that then
// fails to load data, they should land on /login instead).
export async function middleware(request) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // A token refresh mid-request needs the new cookies on both the
          // outgoing request (so the rest of this function sees them) and
          // the response (so the browser actually keeps them) — hence
          // setting on request.cookies and rebuilding response from it,
          // not just writing straight to the original response.
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getUser() (not getSession()) — it revalidates the token against
  // Supabase's Auth server instead of trusting whatever the cookie claims,
  // which matters here since this check is the actual access gate, not
  // just a UI nicety.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except: /login itself, Next's internal static/image
    // assets, and the PWA's own static files (icons, manifest, service
    // worker) — those need to load before a session exists (e.g. iOS
    // reading the manifest/icons to even offer "Add to Home Screen").
    // api/ is included for any future server route, even though Phase 1
    // found none exist today.
    '/((?!_next/static|_next/image|favicon.ico|login|sw\\.js|manifest\\.webmanifest|icon-192\\.png|icon-512\\.png|apple-touch-icon\\.png|api/).*)',
  ],
};
