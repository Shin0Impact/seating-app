import { notFound } from 'next/navigation';
import HelperLink from '@/components/HelperLink';
import Scanner from '@/components/Scanner';
import { SiteHeader, StepBar } from '@/components/Site';
import { serverClient } from '@/lib/supabase/server';
import { getS } from '@/lib/lang-server';

export async function generateMetadata() {
  const { s } = await getS();
  return { title: `${s('titleScan')} · ${s('brand')}` };
}

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { s } = await getS();
  const { data: ev } = await (
    await serverClient()
  )
    .from('events')
    .select('id,name,helper_token')
    .eq('id', id)
    .maybeSingle();
  if (!ev) notFound();
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container scan">
        <div className="page-title">
          <h1>{s('scanTitle')}</h1>
        </div>
        <StepBar id={id} active="scan" />
        <Scanner />
        <HelperLink eventId={id} initial={(ev.helper_token as string | null) ?? null} />
      </main>
    </div>
  );
}
