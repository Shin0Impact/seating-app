'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon, IconButton } from './Icon';
import { useLang, useS } from './LangProvider';
import { useTheme } from '@/lib/theme';
import { updatePassword, updateUsername } from '@/app/actions';
import { browserClient } from '@/lib/supabase/browser';
import type { SKey } from '@/lib/site-i18n';

export type AccountProps = { eventId?: string; signOut: () => void | Promise<void> };

function UsernameForm() {
  const s = useS();
  const [current, setCurrent] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const sb = browserClient();
        const { data: u } = await sb.auth.getUser();
        if (!u.user) return;
        const { data } = await sb.from('profiles').select('username').eq('user_id', u.user.id).maybeSingle();
        if (live) {
          setCurrent(data?.username ?? '');
          setValue(data?.username ?? '');
        }
      } catch {
        if (live) setCurrent('');
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await updateUsername(value);
    const key = (
      { saved: 'usernameSaved', taken: 'usernameTaken', invalid: 'usernameInvalid', error: 'usernameError' } as const
    )[r];
    setMsg({ ok: r === 'saved', text: s(key) });
    if (r === 'saved') setCurrent(value.trim().toLowerCase());
    setBusy(false);
  }
  return (
    <details className="set-details">
      <summary>
        {s('username')}
        {current ? <span className="muted">{current}</span> : null}
      </summary>
      <form onSubmit={submit} className="set-form">
        <small className="muted">{current ? s('usernameHintSet') : s('usernameHintNew')}</small>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          minLength={2}
          maxLength={30}
          autoCapitalize="none"
          autoComplete="off"
          dir="ltr"
          placeholder="jihad"
          aria-label={s('username')}
        />
        <button className="btn" disabled={busy}>
          {current ? s('usernameChange') : s('usernameSave')}
        </button>
        {msg && (
          <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status" style={{ margin: 0 }}>
            {msg.text}
          </p>
        )}
      </form>
    </details>
  );
}

function PasswordForm() {
  const s = useS();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMsg(null);
    const r = await updatePassword(String(f.get('current')), String(f.get('next')), String(f.get('again')));
    const key: SKey = (
      { saved: 'pwSaved', wrong: 'pwWrong', short: 'pwShort', mismatch: 'pwMismatch', error: 'pwError' } as const
    )[r];
    setMsg({ ok: r === 'saved', text: s(key) });
    if (r === 'saved') form.reset();
    setBusy(false);
  }
  return (
    <details className="set-details">
      <summary>{s('changePassword')}</summary>
      <form onSubmit={submit} className="set-form">
        <input
          name="current"
          type="password"
          required
          autoComplete="current-password"
          dir="ltr"
          placeholder={s('pwCurrent')}
          aria-label={s('pwCurrent')}
        />
        <input
          name="next"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          placeholder={s('pwNew')}
          aria-label={s('pwNew')}
        />
        <input
          name="again"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          dir="ltr"
          placeholder={s('pwAgain')}
          aria-label={s('pwAgain')}
        />
        <button className="btn" disabled={busy}>
          {s('changePassword')}
        </button>
        {msg && (
          <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status" style={{ margin: 0 }}>
            {msg.text}
          </p>
        )}
      </form>
    </details>
  );
}

/** The one settings menu used on every page. The hall designer adds its own sections as children. */
export default function SettingsPanel({
  account,
  onClose,
  children,
}: {
  account?: AccountProps;
  onClose: () => void;
  children?: ReactNode;
}) {
  const s = useS();
  const { lang, setLang } = useLang();
  const { pref, setPref } = useTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="picker-backdrop" onMouseDown={onClose} />
      <div className="import-dialog settings" role="dialog" aria-label={s('settings')}>
        <div className="set-head">
          <h2>{s('settings')}</h2>
          <IconButton icon="close" label={s('done')} onClick={onClose} />
        </div>

        {account && (
          <section className="set-sec">
            <h3>{s('account')}</h3>
            <div className="set-actions set-grid">
              <Link className="btn" href="/events">
                {s('allEvents')}
              </Link>
              {account.eventId && (
                <Link className="btn" href={`/events/${account.eventId}`}>
                  {s('eventPage')}
                </Link>
              )}
              <form action={account.signOut} className="set-wide">
                <button className="danger">{s('signOut')}</button>
              </form>
            </div>
            <UsernameForm />
            <PasswordForm />
          </section>
        )}

        <section className="set-sec">
          <h3>{s('language')}</h3>
          <div className="seg" role="group" aria-label={s('language')}>
            <button className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}>
              العربية
            </button>
            <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              English
            </button>
          </div>
        </section>

        <section className="set-sec">
          <h3>{s('appearance')}</h3>
          <div className="seg" role="group" aria-label={s('appearance')}>
            {(
              [
                ['auto', s('themeAuto')],
                ['light', s('themeLight')],
                ['dark', s('themeDark')],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={pref === k ? 'on' : ''} onClick={() => setPref(k)}>
                {k === 'light' && <Icon name="sun" size={16} />}
                {k === 'dark' && <Icon name="moon" size={16} />}
                {label}
              </button>
            ))}
          </div>
          <small className="muted">{s('themeHint')}</small>
        </section>

        {children}

        <div className="set-actions set-done">
          <button className="primary" onClick={onClose}>
            {s('done')}
          </button>
        </div>
      </div>
    </>
  );
}
