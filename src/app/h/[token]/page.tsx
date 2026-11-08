import { notFound } from 'next/navigation';
import '@fontsource/amiri/arabic-400.css';
import '@fontsource/amiri/arabic-700.css';
import HelperDesk from '@/components/HelperDesk';
import SiteSettings from '@/components/SiteSettings';
import { Logo } from '@/components/Site';
import { getS } from '@/lib/lang-server';

export const metadata = { title: 'طاولتنا · Our Table', robots: { index: false, follow: false } };

export default async function Helper({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) notFound();
  const { s } = await getS();
  return (
    <div className="site">
      <header className="site-bar">
        <div className="crumbs">
          <span className="brand" title={s('helperDeskTitle')}>
            <Logo />
          </span>
        </div>
        {/* the desk puts its search here, so it stays in view while scrolling */}
        <div id="helper-search" className="helper-slot" />
        <SiteSettings />
      </header>
      <main className="container scan">
        <HelperDesk token={token} />
      </main>
    </div>
  );
}
