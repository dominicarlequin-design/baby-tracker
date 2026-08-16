import './globals.css';

export const metadata = {
  title: 'Baby Tracker',
  description: 'Tap-to-log baby habit tracker with alerts',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
