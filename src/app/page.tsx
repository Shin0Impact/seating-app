import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Site';
import ThemeToggle from '@/components/ThemeToggle';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

async function signIn(form: FormData) {
  'use server';
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const supabase = await serverClient();
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
          <div className="hero-copy">
            <div className="hero-art"><Logo size={150} /></div>
            <h1>ترتيب الجلوس</h1>
            <p>ارسم قاعة الحفل ورتّب الطاولات، أرسل رابطًا لكل عائلة لتأكيد الحضور، وامسح رمز الضيف عند الباب ليصل مباشرةً إلى كرسيه.</p>
            <ul className="hero-points">
              <li>مخطط القاعة بالسحب والإفلات، يعمل على الهاتف</li>
              <li>رابط ورمز QR لكل عائلة، بدون تسجيل دخول للضيوف</li>
              <li>الفريق يتابع الدعوات والتأكيدات معًا في الوقت نفسه</li>
            </ul>
          </div>
          <div className="login-card">
            {!supabaseConfigured ? (
              <p className="notice info">الخادم غير مُعدّ بعد. أضف مفاتيح Supabase في إعدادات Vercel.</p>
            ) : signedIn ? (
              <>
                <h2>أهلًا بعودتك</h2>
                <Link className="btn primary" href="/events">متابعة إلى مناسباتي</Link>
              </>
            ) : (
              <form action={signIn} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <h2>تسجيل دخول المنظّم</h2>
                {q.error && <p className="notice err" role="alert">البريد الإلكتروني أو كلمة المرور غير صحيحة.</p>}
                <label className="field-col">البريد الإلكتروني<input name="email" type="email" required autoComplete="email" dir="ltr" /></label>
                <label className="field-col">كلمة المرور<input name="password" type="password" required autoComplete="current-password" dir="ltr" /></label>
                <button className="btn primary">دخول</button>
              </form>
            )}
            <p className="hero-foot">تريد تجربة المحرر فقط؟ <Link href="/editor">افتحه بدون حساب</Link> (يُحفظ على هذا الجهاز فقط).</p>
          </div>
        </div>
      </section>
    </div>
  );
}
