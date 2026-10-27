import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Site';
import ThemeToggle from '@/components/ThemeToggle';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { signOut } from '@/app/actions';
import { normalizeUsername } from '@/lib/username';

async function signIn(form: FormData) {
  'use server';
  const typed = normalizeUsername(String(form.get('email') ?? ''));
  const password = String(form.get('password') ?? '');
  const supabase = await serverClient();
  let email = typed;
  if (typed && !typed.includes('@')) {
    const { data } = await supabase.rpc('login_email', { p_username: typed });
    email = typeof data === 'string' && data ? data : `${typed}@invalid.local`;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect('/?error=1');
  redirect('/events');
}

export const dynamic = 'force-dynamic';

export const metadata = { title: 'ترتيب الجلوس', description: 'ترتيب طاولات القاعة ودعوات الضيوف والدخول بالرمز' };

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  let signedIn = false;
  if (supabaseConfigured) {
    const { data } = await (await serverClient()).auth.getUser();
    signedIn = !!data.user;
  }
  return (
    <div className="site">
      <div className="theme-float"><ThemeToggle /></div>
      <section className="hero">
        <div className="hero-inner">
          <div className="login-card">
            <div className="login-head">
              <Logo size={56} />
              <h1>ترتيب الجلوس</h1>
              <p>خطّط قاعة الحفل ونظّم ضيوفك في مكان واحد.</p>
            </div>
            {!supabaseConfigured ? (
              <p className="notice info">الخادم غير مُعدّ بعد. أضف مفاتيح Supabase في إعدادات Vercel.</p>
            ) : signedIn ? (
              <>
                <h2>أهلًا بعودتك</h2>
                <Link className="btn primary" href="/events">متابعة إلى مناسباتي</Link>
                <form action={signOut}><button className="btn" style={{ width: '100%' }}>تسجيل الخروج</button></form>
              </>
            ) : (
              <form action={signIn} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {q.error && <p className="notice err" role="alert">اسم المستخدم أو كلمة المرور غير صحيحة.</p>}
                <label className="field-col">اسم المستخدم أو البريد الإلكتروني<input name="email" type="text" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} dir="ltr" /></label>
                <label className="field-col">كلمة المرور<input name="password" type="password" required autoComplete="current-password" dir="ltr" /></label>
                <button className="btn primary">دخول</button>
              </form>
            )}
            <p className="hero-foot"><Link href="/editor">جرّب المحرر بدون حساب</Link></p>
          </div>
        </div>
      </section>
    </div>
  );
}
