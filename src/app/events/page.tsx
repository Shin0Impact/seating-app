import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { emptyLayout } from '@/lib/layout';
import { supabaseConfigured } from '@/lib/supabase/env';

async function create(form: FormData) {
  'use server';
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const date = String(form.get('date') ?? '');
  if (!name) return;
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('events')
    .insert({ name, event_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, layout: emptyLayout() })
    .select('id')
    .single();
  if (error || !data) redirect('/events?error=1');
  redirect(`/events/${data.id}`);
}

async function signOut() {
  'use server';
  await (await serverClient()).auth.signOut();
  redirect('/login');
}

export default async function Events() {
  if (!supabaseConfigured) return <main className="page"><p>Supabase is not configured yet (see README: Going online).</p></main>;
  const supabase = await serverClient();
  const { data: events } = await supabase.from('events').select('id,name,event_date,updated_at').order('updated_at', { ascending: false });
  return (
    <main className="page">
      <div className="row between">
        <h1>مناسباتي</h1>
        <form action={signOut}><button>خروج</button></form>
      </div>
      <ul className="cards">
        {(events ?? []).map((e) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`}><b>{e.name}</b><span>{e.event_date ?? ''}</span></Link>
            <Link href={`/events/${e.id}/invites`}>الدعوات</Link>
            <Link href={`/events/${e.id}/scan`}>مسح الدخول</Link>
          </li>
        ))}
        {(events ?? []).length === 0 && <li className="muted">لا توجد مناسبات بعد.</li>}
      </ul>
      <h2>مناسبة جديدة</h2>
      <form action={create} className="stack">
        <label>الاسم<input name="name" required maxLength={120} /></label>
        <label>التاريخ<input name="date" type="date" /></label>
        <button className="primary">إنشاء</button>
      </form>
    </main>
  );
}
