import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/Site';
import LangToggle from '@/components/LangToggle';
import SiteSettings from '@/components/SiteSettings';
import { getS } from '@/lib/lang-server';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';
import { signOut } from '@/app/actions';
import { normalizeUsername } from '@/lib/username';

/** Only same-site event pages are valid places to return to after signing in. */
function safeNext(v: unknown): string {
  const n = typeof v === 'string' ? v : '';
  return /^\/events(\/[0-9a-f-]{36}(\/(hall|import|invites|preview|scan))?)?$/.test(n) ? n : '/events';
}

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
  const next = safeNext(form.get('next'));
  if (error) redirect(`/?error=1${next === '/events' ? '' : `&next=${encodeURIComponent(next)}`}`);
  redirect(next);
}

export const dynamic = 'force-dynamic';

export const metadata = { title: 'طاولتنا · Our Table' };

export default async function Landing({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const q = await searchParams;
  const { s } = await getS();
  const next = safeNext(q.next);
  let signedIn = false;
  if (supabaseConfigured) {
    const { data } = await (await serverClient()).auth.getUser();
    signedIn = !!data.user;
  }
  return (
    <div className="site">
      <div className="theme-float">
        <LangToggle />
        <SiteSettings account={signedIn ? { signOut } : undefined} />
      </div>
      <section className="hero">
        <div className="hero-inner">
          <div className="login-card">
            <div className="login-head">
              <Logo size={56} />
              <h1>{s('brand')}</h1>
              <p>{s('tagline')}</p>
            </div>
            {!supabaseConfigured ? (
              <p className="notice info">{s('serverNotSet')}</p>
            ) : signedIn ? (
              <>
                <h2>{s('welcomeBack')}</h2>
                <Link className="btn primary" href={next}>
                  {s('continueToEvents')}
                </Link>
                <form action={signOut}>
                  <button className="btn" style={{ width: '100%' }}>
                    {s('signOut')}
                  </button>
                </form>
              </>
            ) : (
              <form
                action={signIn}
                className="login-form"
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                <input type="hidden" name="next" value={next} />
                {q.error && (
                  <p className="notice err" role="alert">
                    {s('badLogin')}
                  </p>
                )}
                <label className="field-col">
                  {s('userOrEmail')}
                  <input
                    name="email"
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    dir="ltr"
                  />
                </label>
                <label className="field-col">
                  {s('password')}
                  <input name="password" type="password" required autoComplete="current-password" dir="ltr" />
                </label>
                <button className="btn primary">{s('signIn')}</button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
