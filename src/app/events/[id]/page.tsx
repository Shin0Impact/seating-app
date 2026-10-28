import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import { parseLayout } from '@/lib/layout';
import { totals, type InviteRow } from '@/lib/inviteview';
import DeleteEvent from '@/components/DeleteEvent';
import { renameEvent } from '@/app/actions';
import { serverClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EventHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ delete?: string; rename?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const [{ data: ev }, { data: invites }] = await Promise.all([
    supabase.from('events').select('id,name,event_date,layout').eq('id', id).maybeSingle(),
    supabase.from('invites').select('token,guest_id,party_size,status,confirmed_count,checked_in_at,sent_at').eq('event_id', id),
  ]);
  if (!ev) notFound();
  const layout = parseLayout(ev.layout);
  const tables = layout.elements.filter((e) => e.kind === 'table').length;
  const seated = layout.guests.filter((g) => g.tableId).length;
  const t = totals((invites ?? []) as InviteRow[]);
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container">
        <div className="page-title"><h1>{ev.name}</h1></div>
        <div className="step-cards">
          <section className="step-card">
            <div className="sc-head"><span className="n">1</span><h3>الضيوف <span className="tag">اختياري</span></h3></div>
            <div className="big">{layout.guests.length}</div>
            <p className="muted" style={{ margin: 0 }}>{layout.guests.length ? 'ضيفًا في القائمة' : 'ابدأ باستيراد ملف CSV أو Excel، أو تخطَّ وأضفهم من المخطط.'}</p>
            <Link className="btn" href={`/events/${id}/import`}>{layout.guests.length ? 'استيراد المزيد' : 'استيراد قائمة'}</Link>
          </section>
          <section className="step-card">
            <div className="sc-head"><span className="n">2</span><h3>مخطط القاعة</h3></div>
            <div className="big">{tables}</div>
            <p className="muted" style={{ margin: 0 }}>{tables ? `طاولة · أُجلس ${seated} من ${layout.guests.length}` : 'ارسم الطاولات واسحب الضيوف إلى كراسيهم.'}</p>
            <Link className="btn primary" href={`/events/${id}/preview`}>عرض المخطط</Link>
          </section>
          <section className="step-card">
            <div className="sc-head"><span className="n">3</span><h3>الدعوات</h3></div>
            <div className="big">{t.families ? `${t.sent}/${t.families}` : '—'}</div>
            <p className="muted" style={{ margin: 0 }}>{t.families ? `عائلة أُرسلت لها الدعوة · أكّدت ${t.confirmedFamilies}` : 'رابط واحد لكل عائلة تُرسله لربّها عبر واتساب.'}</p>
            <Link className="btn" href={`/events/${id}/invites`}>إدارة الدعوات</Link>
          </section>
          <section className="step-card">
            <div className="sc-head"><span className="n">4</span><h3>الدخول</h3></div>
            <div className="big">{t.arrived}</div>
            <p className="muted" style={{ margin: 0 }}>{t.families ? `عائلة وصلت من ${t.confirmedFamilies} مؤكّدة` : 'يوم الحفل: امسح رمز الضيف ليظهر كرسيه.'}</p>
            <Link className="btn" href={`/events/${id}/scan`}>فتح الماسح</Link>
          </section>
        </div>
        <p className="muted small-note">الدعوات والمخطط صفحتان منفصلتان: يمكن لشخصين العمل على الاثنين في الوقت نفسه.</p>
        <details className="event-settings" open={!!q.rename || !!q.delete}>
          <summary>إعدادات المناسبة</summary>
          {q.delete && <p className="notice err" role="alert">{q.delete === 'mismatch' ? 'الاسم المكتوب لا يطابق اسم المناسبة.' : 'تعذّر حذف المناسبة. حاول مرة أخرى.'}</p>}
        {q.rename && (
          <p className={`notice ${q.rename === 'saved' ? 'ok' : 'err'}`} role="status">
            {q.rename === 'saved' ? 'تم حفظ التعديل.' : q.rename === 'invalid' ? 'الاسم مطلوب.' : 'تعذّر حفظ التعديل.'}
          </p>
        )}
        <form action={renameEvent} className="rename-form">
          <input type="hidden" name="id" value={id} />
          <label className="field-col">الاسم<input name="name" defaultValue={ev.name} required maxLength={120} /></label>
          <label className="field-col">التاريخ (اختياري)<input name="date" type="date" defaultValue={ev.event_date ?? ''} /></label>
          <button className="btn">حفظ</button>
        </form>
        <DeleteEvent id={id} name={ev.name} />
        </details>
      </main>
    </div>
  );
}
