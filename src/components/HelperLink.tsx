'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { makeToken } from '@/lib/invites';
import { useS } from './LangProvider';

/** The planner's switch for the door-helper link: create, copy, replace (old one stops) or turn off. */
export default function HelperLink({ eventId, initial }: { eventId: string; initial: string | null }) {
  const s = useS();
  const [token, setToken] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState(false);
  const url = token ? `${window.location.origin}/h/${token}` : '';

  async function save(next: string | null) {
    const { error } = await browserClient().from('events').update({ helper_token: next }).eq('id', eventId);
    setErr(!!error);
    if (!error) {
      setToken(next);
      setCopied(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      /* the link is shown below to copy by hand */
    }
  }
  return (
    <section className="card-box helper-link">
      <h2>{s('helperTitle')}</h2>
      <p className="muted">{s('helperHint')}</p>
      {!token ? (
        <button className="btn primary" onClick={() => save(makeToken())}>
          {s('helperCreate')}
        </button>
      ) : (
        <>
          <input
            className="field-input"
            readOnly
            dir="ltr"
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={s('helperTitle')}
          />
          <div className="exp-row">
            <button className="btn primary small" onClick={copy}>
              {copied ? s('helperCopied') : s('helperCopy')}
            </button>
            <button className="btn small" onClick={() => save(makeToken())}>
              {s('helperNew')}
            </button>
            <button className="btn small danger" onClick={() => save(null)}>
              {s('helperOff')}
            </button>
          </div>
          <p className="muted">{s('helperNewHint')}</p>
        </>
      )}
      {err && <p className="notice err">{s('genericError')}</p>}
    </section>
  );
}
