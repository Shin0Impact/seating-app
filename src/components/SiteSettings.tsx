'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/lib/theme';
import { Icon } from './Icon';

/** Gear button for the site pages: opens a small settings menu with appearance and sign out. */
export default function SiteSettings({ signOut, eventId }: { signOut: () => void | Promise<void>; eventId?: string }) {
  const [open, setOpen] = useState(false);
  const { pref, setPref } = useTheme();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button className="icon-btn" aria-label="الإعدادات" title="الإعدادات" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="settings" />
      </button>
      {open && (
        <>
          <div className="picker-backdrop" onMouseDown={() => setOpen(false)} />
          <div className="import-dialog settings" role="dialog" aria-label="الإعدادات">
            <h2>الإعدادات</h2>
            <section className="set-sec">
              <h3>الحساب</h3>
              <div className="set-actions set-grid">
                <Link className="btn" href="/events">كل المناسبات</Link>
                {eventId && <Link className="btn" href={`/events/${eventId}`}>صفحة المناسبة</Link>}
                <form action={signOut} style={{ display: 'contents' }}>
                  <button className="danger">تسجيل الخروج</button>
                </form>
              </div>
            </section>
            <section className="set-sec">
              <h3>المظهر</h3>
              <div className="seg" role="group" aria-label="المظهر">
                {([['auto', 'تلقائي'], ['light', 'فاتح'], ['dark', 'داكن']] as const).map(([k, label]) => (
                  <button key={k} className={pref === k ? 'on' : ''} onClick={() => setPref(k)}>
                    {k === 'light' && <Icon name="sun" size={16} />}
                    {k === 'dark' && <Icon name="moon" size={16} />}
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <div className="set-actions set-done">
              <button className="btn primary" onClick={() => setOpen(false)}>تم</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
