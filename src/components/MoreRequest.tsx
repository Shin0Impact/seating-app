'use client';
import { useState } from 'react';
import { useS } from './LangProvider';

/** A button that opens a small "how many more?" box; sending it tells the planner. */
export default function MoreRequest({ action, token, sent }: { action: (form: FormData) => void | Promise<void>; token: string; sent: boolean }) {
  const s = useS();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {!open && (
        <button type="button" className="btn" onClick={() => setOpen(true)}>{s('bringMore')}</button>
      )}
      {open && (
        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <input type="hidden" name="token" value={token} />
          <label className="field-col" style={{ alignItems: 'center' }}>{s('moreHowMany')}
            <input name="extra" type="number" min={1} max={20} inputMode="numeric" defaultValue={1} autoFocus required style={{ width: 90 }} />
          </label>
          <div className="row">
            <button className="btn primary">{s('sendMore')}</button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>{s('cancel')}</button>
          </div>
        </form>
      )}
      {sent && !open && <p className="notice ok" style={{ margin: 0 }}>{s('moreSent')}</p>}
    </div>
  );
}
