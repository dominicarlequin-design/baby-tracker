import './globals.css';

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
  themeColor: '#fdf6ec',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
