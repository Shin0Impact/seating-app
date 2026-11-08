'use client';

import { useEffect, useState } from 'react';
import { useS } from './LangProvider';

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? '';
const EVERY_MS = 5 * 60 * 1000;

/**
 * A page left open across a release keeps running the old code (phones keep tabs and installed apps open for days).
 * When the server is on a newer release, offer to reload so every device saves the same way.
 */
export default function UpdateBanner() {
  const s = useS();
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (!BUILD) return;
    let last = 0;
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (build && build !== BUILD) setStale(true);
      } catch {
        /* offline: check again later */
      }
    };
    const first = window.setTimeout(check, 5000);
    const iv = window.setInterval(check, EVERY_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="update-banner" role="status">
      <span>{s('newVersion')}</span>
      <button className="btn small primary" onClick={() => window.location.reload()}>
        {s('reloadNow')}
      </button>
    </div>
  );
}
