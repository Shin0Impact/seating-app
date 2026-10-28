import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import HallPreview from '@/components/HallPreview';
import HallFileImport from '@/components/HallFileImport';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
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
        <div className="page-title"><h1>مخطط القاعة</h1></div>
        <Link href={hall} className="preview-card" aria-label="فتح المحرر">
          {tables || layout.elements.length ? <HallPreview layout={layout} /> : <p className="muted">القاعة فارغة بعد. افتح المحرر لترسم الطاولات.</p>}
          <span className="btn primary preview-open">{layout.elements.length ? 'فتح المحرر لتعديل المخطط' : 'ابدأ برسم القاعة'}</span>
        </Link>
        <HallFileImport id={id} hasHall={layout.elements.length > 0 || layout.guests.length > 0} />
        <p className="muted small-note">{tables} طاولة · أُجلس {seated} من {layout.guests.length} ضيفًا</p>
      </main>
    </div>
  );
}
