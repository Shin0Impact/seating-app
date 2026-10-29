import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, StepBar } from '@/components/Site';
import HallPreview from '@/components/HallPreview';
import HallFileImport from '@/components/HallFileImport';
import { getS } from '@/lib/lang-server';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { s } = await getS();
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('id,name,layout').eq('id', id).maybeSingle();
  if (!ev) notFound();
  const layout = parseLayout(ev.layout);
  const tables = layout.elements.filter((e) => e.kind === 'table').length;
  const seated = layout.guests.filter((g) => g.tableId).length;
  const hall = `/events/${id}/hall`;
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container">
        <div className="page-title">
          <h1>{s('planTitle')}</h1>
        </div>
        <StepBar id={id} active="hall" />
        <Link href={hall} className="preview-card" aria-label={s('openDesignerAria')}>
          {layout.elements.length ? (
            <HallPreview layout={layout} label={s('planTitle')} />
          ) : (
            <p className="muted">{s('emptyHall')}</p>
          )}
          <span className="btn preview-open">{layout.elements.length ? s('openDesigner') : s('startDrawing')}</span>
        </Link>
        <HallFileImport id={id} hasHall={layout.elements.length > 0 || layout.guests.length > 0} />
        <p className="muted small-note">{s('previewSummary', { tables, seated, guests: layout.guests.length })}</p>
      </main>
    </div>
  );
}
