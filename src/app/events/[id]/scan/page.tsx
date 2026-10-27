import { notFound } from 'next/navigation';
import Scanner from '@/components/Scanner';
import { SiteHeader, StepBar } from '@/components/Site';
import { serverClient } from '@/lib/supabase/server';

export const metadata = { title: 'مسح الدخول' };

export default async function ScanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: ev } = await (await serverClient()).from('events').select('id,name').eq('id', id).maybeSingle();
  if (!ev) notFound();
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container narrow">
        <div className="page-title"><h1>مسح الدخول</h1></div>
        <StepBar id={id} active="scan" />
        <Scanner />
      </main>
    </div>
  );
}
