import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import { THEME_BOOT } from '@/lib/theme';

export const metadata: Metadata = {
  title: 'Hall layout',
  description: 'Wedding hall seating layout editor',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
