import { notFound } from 'next/navigation';
import ImportStep from '@/components/ImportStep';
import { SiteHeader, StepBar } from '@/components/Site';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';

export const metadata = { title: 'استيراد الضيوف' };

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('id,name,layout,version').eq('id', id).maybeSingle();
  if (!ev) notFound();
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container">
        <div className="page-title"><h1>استيراد الضيوف <span className="tag">اختياري</span></h1></div>
        <StepBar id={id} active="import" />
        <ImportStep id={id} initial={parseLayout(ev.layout)} version={ev.version} />
      </main>
    </div>
  );
}
