import { notFound } from 'next/navigation';
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
  const { data: ev } = await (await serverClient()).from('events').select('id,name').eq('id', id).maybeSingle();
  if (!ev) notFound();
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container narrow">
        <div className="page-title"><h1>{s('scanTitle')}</h1></div>
        <StepBar id={id} active="scan" />
        <Scanner />
      </main>
    </div>
  );
}
