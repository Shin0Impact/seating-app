import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

async function sign(form: FormData) {
  'use server';
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const mode = form.get('mode') === 'up' ? 'up' : 'in';
  const supabase = await serverClient();
  const { error } =
    mode === 'up' ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message.slice(0, 200))}`);
  redirect(mode === 'up' ? '/login?notice=confirm' : '/events');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const q = await searchParams;
  if (!supabaseConfigured) return <main className="page"><p>Supabase is not configured yet (see README: Going online).</p></main>;
  return (
    <main className="page narrow">
      <h1>تسجيل دخول المنظّم</h1>
      {q.error && <p className="form-error" role="alert">{q.error}</p>}
      {q.notice === 'confirm' && <p className="form-note">تم إنشاء الحساب. افتح بريدك وأكّد العنوان ثم سجّل الدخول.</p>}
      <form action={sign} className="stack">
        <label>البريد الإلكتروني<input name="email" type="email" required autoComplete="email" /></label>
        <label>كلمة المرور<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>
        <div className="row">
          <button name="mode" value="in" className="primary">دخول</button>
          <button name="mode" value="up">حساب جديد</button>
        </div>
      </form>
    </main>
  );
}
