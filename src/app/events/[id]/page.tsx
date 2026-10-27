import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, StepBar } from '@/components/Site';
import { parseLayout } from '@/lib/layout';
import { totals, type InviteRow } from '@/lib/inviteview';
import DeleteEvent from '@/components/DeleteEvent';
import { signOut } from '@/app/actions';
import { serverClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EventHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ delete?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('id,name,event_date,layout').eq('id', id).maybeSingle();
  if (!ev) notFound();
  const { data: invites } = await supabase.from('invites').select('token,guest_id,party_size,status,confirmed_count,checked_in_at,sent_at').eq('event_id', id);
  const layout = parseLayout(ev.layout);
  const tables = layout.elements.filter((e) => e.kind === 'table').length;
  const seated = layout.guests.filter((g) => g.tableId).length;
  const t = totals((invites ?? []) as InviteRow[]);
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }}>
        <form action={signOut}><button className="btn small">تسجيل الخروج</button></form>
      </SiteHeader>
      <main className="container">
        <div className="page-title"><h1>{ev.name}</h1></div>
        <StepBar id={id} active="hall" />
        <div className="step-cards">
          <section className="step-card">
            <span className="n">1</span>
            <h3>الضيوف <span className="tag">اختياري</span></h3>
            <div className="big">{layout.guests.length}</div>
            <p className="muted" style={{ margin: 0 }}>{layout.guests.length ? 'ضيفًا في القائمة' : 'ابدأ باستيراد ملف CSV أو Excel، أو تخطَّ وأضفهم من المخطط.'}</p>
            <Link className="btn" href={`/events/${id}/import`}>{layout.guests.length ? 'استيراد المزيد' : 'استيراد قائمة'}</Link>
          </section>
          <section className="step-card">
            <span className="n">2</span>
            <h3>مخطط القاعة</h3>
            <div className="big">{tables}</div>
            <p className="muted" style={{ margin: 0 }}>{tables ? `طاولة · أُجلس ${seated} من ${layout.guests.length}` : 'ارسم الطاولات واسحب الضيوف إلى كراسيهم.'}</p>
            <Link className="btn primary" href={`/events/${id}/hall`}>فتح المخطط</Link>
          </section>
          <section className="step-card">
            <span className="n">3</span>
            <h3>الدعوات</h3>
            <div className="big">{t.families ? `${t.sent}/${t.families}` : '—'}</div>
            <p className="muted" style={{ margin: 0 }}>{t.families ? `عائلة أُرسلت لها الدعوة · أكّدت ${t.confirmedFamilies}` : 'رابط واحد لكل عائلة تُرسله لربّها عبر واتساب.'}</p>
            <Link className="btn" href={`/events/${id}/invites`}>إدارة الدعوات</Link>
          </section>
          <section className="step-card">
            <span className="n">4</span>
            <h3>الدخول</h3>
            <div className="big">{t.arrived}</div>
            <p className="muted" style={{ margin: 0 }}>{t.families ? `عائلة وصلت من ${t.confirmedFamilies} مؤكّدة` : 'يوم الحفل: امسح رمز الضيف ليظهر كرسيه.'}</p>
            <Link className="btn" href={`/events/${id}/scan`}>فتح الماسح</Link>
          </section>
        </div>
        {q.delete && <p className="notice err" role="alert">{q.delete === 'mismatch' ? 'الاسم المكتوب لا يطابق اسم المناسبة.' : 'تعذّر حذف المناسبة. حاول مرة أخرى.'}</p>}
        <p className="muted">الدعوات والمخطط صفحتان منفصلتان: يمكن لشخصين العمل على الاثنين في الوقت نفسه من الحساب نفسه.</p>
        <DeleteEvent id={id} name={ev.name} />
      </main>
    </div>
  );
}
