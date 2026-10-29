import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/noto-sans-arabic';
import './globals.css';
import { THEME_BOOT } from '@/lib/theme';
import { LangProvider } from '@/components/LangProvider';
import { getLang } from '@/lib/lang-server';
import { dirOf } from '@/lib/i18n';
import PwaRegister from '@/components/PwaRegister';

export const metadata: Metadata = {
  title: 'طاولتنا · Our Table',
  description: 'Hall seating plans, guest invitations and check-in',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'طاولتنا', statusBarStyle: 'default' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2f5fc4' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} dir={dirOf(lang)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <LangProvider initial={lang}>{children}</LangProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
