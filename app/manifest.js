// Next.js file-convention manifest — automatically served at
// /manifest.webmanifest and linked in the document head, so nothing else
// needs to reference it manually. This plus the icons/appleWebApp entries
// in app/layout.js's metadata is what lets the app be added to a phone's
// home screen as a standalone icon instead of just a bookmarked tab.
export default function manifest() {
  return {
    name: 'Baby Tracker',
    short_name: 'Baby Tracker',
    description: 'Tap-to-log baby habit tracker',
    start_url: '/',
    display: 'standalone',
    background_color: '#fdf6ec',
    theme_color: '#fdf6ec',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
