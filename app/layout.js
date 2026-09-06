import './globals.css';
import { THEME_INIT_SCRIPT } from '../lib/theme';

export const metadata = {
  title: 'Baby Tracker',
  description: 'Tap-to-log baby habit tracker',
  // icons + appleWebApp is what actually gets Safari's "Add to Home
  // Screen" to use a real app icon and open without browser chrome —
  // the web manifest below (app/manifest.js) is mostly ignored by iOS,
  // Android/Chrome is the one that reads it for its own install prompt.
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Baby Tracker',
  },
  // Next only emits the modern, unprefixed mobile-web-app-capable tag from
  // appleWebApp.capable above. Older iOS versions specifically look for
  // the apple-prefixed one to actually launch standalone (no address
  // bar) instead of just bookmarking a browser tab, so it's added
  // explicitly rather than relying on appleWebApp alone.
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Matches the browser/status-bar chrome to whichever theme is active so
  // it doesn't stay a bright cream bar above a dark page. The media-query
  // form only covers the system-default case; an explicit override (see
  // lib/theme.js) is a per-session choice the OS-level chrome color can't
  // react to without a native app wrapper, so it's a known, accepted gap.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdf6ec' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a17' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the inline script below sets data-theme on
    // this element before React hydrates (so an explicit dark/light choice
    // never flashes the wrong theme first), which otherwise trips React's
    // "server/client attribute mismatch" warning for this one attribute.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
