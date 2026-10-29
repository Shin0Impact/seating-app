import Link from 'next/link';
import type { ReactNode } from 'react';
import SiteSettings from './SiteSettings';
import { getS } from '@/lib/lang-server';
import { Icon, type IconName } from './Icon';
import { signOut } from '@/app/actions';

export function Logo({ size = 34 }: { size?: number }) {
  // A round table seen from above: a solid table, five chairs, and one warm chair for "your seat".
  const chairs = [0, 72, 144, 216, 288];
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
      {chairs.map((a, i) => {
        const r = (a - 90) * (Math.PI / 180);
        return (
          <circle
            key={a}
            cx={24 + 17.5 * Math.cos(r)}
            cy={24 + 17.5 * Math.sin(r)}
            r="4.6"
            fill={i === 0 ? '#e0a53a' : 'var(--accent-soft)'}
            stroke={i === 0 ? '#e0a53a' : 'var(--accent)'}
            strokeWidth="1.6"
          />
        );
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
        <SiteSettings account={{ eventId: crumb?.id, signOut }} />
      </div>
    </header>
  );
}

export type StepKey = 'home' | 'import' | 'hall' | 'invites' | 'scan';

/** The event's navigation: tabs under the title on a computer, a bar along the bottom of the screen on a phone. */
export async function StepBar({ id, active }: { id: string; active: StepKey }) {
  const { s } = await getS();
  const items: { key: StepKey; label: string; path: string; icon: IconName }[] = [
    { key: 'home', label: s('navHome'), path: '', icon: 'home' },
    { key: 'import', label: s('stepGuests'), path: '/import', icon: 'users' },
    { key: 'hall', label: s('stepHall'), path: '/preview', icon: 'grid' },
    { key: 'invites', label: s('stepInvites'), path: '/invites', icon: 'list' },
    { key: 'scan', label: s('stepEntry'), path: '/scan', icon: 'scan' },
  ];
  return (
    <nav className="eventnav" aria-label={s('steps')}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={`/events/${id}${it.path}`}
          className={`en-item${it.key === active ? ' on' : ''}`}
          aria-current={it.key === active ? 'page' : undefined}
        >
          <Icon name={it.icon} size={20} />
          <span>{it.label}</span>
        </Link>
      ))}
    </nav>
  );
}
