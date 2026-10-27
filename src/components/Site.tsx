import Link from 'next/link';
import type { ReactNode } from 'react';
import ThemeToggle from './ThemeToggle';
import { signOut } from '@/app/actions';

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      <circle cx="24" cy="24" r="10" fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect key={a} x="21" y="3.5" width="6" height="8" rx="2.5" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.6" transform={`rotate(${a} 24 24)`} />
      ))}
    </svg>
  );
}

export function SiteHeader({ crumb, children }: { crumb?: { id: string; name: string }; children?: ReactNode }) {
  return (
    <header className="site-bar">
      <div className="crumbs">
        <Link href="/events" className="brand">
          <Logo />
          <span>ترتيب الجلوس</span>
        </Link>
        {crumb && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/events/${crumb.id}`}>
              <b>{crumb.name}</b>
            </Link>
          </>
        )}
      </div>
      <div className="site-actions">
        {children}
        <ThemeToggle />
        <form action={signOut}><button className="btn small">تسجيل الخروج</button></form>
      </div>
    </header>
  );
}

export type StepKey = 'import' | 'hall' | 'invites' | 'scan';
const STEPS: { key: StepKey; label: string; sub: string; path: string }[] = [
  { key: 'import', label: 'الضيوف', sub: 'اختياري', path: 'import' },
  { key: 'hall', label: 'المخطط', sub: 'القاعة والطاولات', path: 'hall' },
  { key: 'invites', label: 'الدعوات', sub: 'رابط لكل عائلة', path: 'invites' },
  { key: 'scan', label: 'الدخول', sub: 'مسح الرمز', path: 'scan' },
];

export function StepBar({ id, active }: { id: string; active: StepKey }) {
  return (
    <nav className="stepbar" aria-label="الخطوات">
      {STEPS.map((s, i) => (
        <Link key={s.key} href={`/events/${id}/${s.path}`} className={`step${s.key === active ? ' on' : ''}`} aria-current={s.key === active ? 'step' : undefined}>
          <span className="n">{i + 1}</span>
          <span>
            {s.label}
            <small>{s.sub}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}
