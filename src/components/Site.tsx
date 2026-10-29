import Link from 'next/link';
import type { ReactNode } from 'react';
import SiteSettings from './SiteSettings';
import { getS } from '@/lib/lang-server';
import { Icon } from './Icon';
import { signOut } from '@/app/actions';

export function Logo({ size = 34 }: { size?: number }) {
  // A round table seen from above: a solid table, five chairs, and one warm chair for "your seat".
  const chairs = [0, 72, 144, 216, 288];
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      {chairs.map((a, i) => {
        const r = (a - 90) * (Math.PI / 180);
        return <circle key={a} cx={24 + 17.5 * Math.cos(r)} cy={24 + 17.5 * Math.sin(r)} r="4.6" fill={i === 0 ? '#e0a53a' : 'var(--accent-soft)'} stroke={i === 0 ? '#e0a53a' : 'var(--accent)'} strokeWidth="1.6" />;
      })}
      <circle cx="24" cy="24" r="10.5" fill="var(--accent)" />
    </svg>
  );
}

export async function SiteHeader({ crumb, children }: { crumb?: { id: string; name: string }; children?: ReactNode }) {
  const { s } = await getS();
  return (
    <header className="site-bar">
      <div className="crumbs">
        <Link href="/events" className="brand">
          <Logo />
          <span className="brand-name">{s('brand')}</span>
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
        {crumb && (
          <Link className="btn small bar-btn" href="/events" aria-label={s('allEvents')} title={s('allEvents')}>
            <span className="ico"><Icon name="list" size={18} /></span>
            <span className="lbl">{s('allEvents')}</span>
          </Link>
        )}
        <SiteSettings account={{ eventId: crumb?.id, signOut }} />
      </div>
    </header>
  );
}

export type StepKey = 'import' | 'hall' | 'invites' | 'scan';

export async function StepBar({ id, active }: { id: string; active: StepKey }) {
  const { s } = await getS();
  const steps: { key: StepKey; label: string; sub: string; path: string }[] = [
    { key: 'import', label: s('stepGuests'), sub: '', path: 'import' },
    { key: 'hall', label: s('stepHall'), sub: s('stepHallSub'), path: 'preview' },
    { key: 'invites', label: s('stepInvites'), sub: s('stepInvitesSub'), path: 'invites' },
    { key: 'scan', label: s('stepEntry'), sub: s('stepEntrySub'), path: 'scan' },
  ];
  return (
    <nav className="stepbar" aria-label={s('steps')}>
      {steps.map((st, i) => (
        <Link key={st.key} href={`/events/${id}/${st.path}`} className={`step${st.key === active ? ' on' : ''}`} aria-current={st.key === active ? 'step' : undefined}>
          <span className="n">{i + 1}</span>
          <span>
            {st.label}
            <small>{st.sub}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}
