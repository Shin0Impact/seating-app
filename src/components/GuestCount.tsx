'use client';
import { useState } from 'react';
import { useS } from './LangProvider';
import SubmitButton from './SubmitButton';

/**
 * "Registered guests: N" with a Change button next to it. In the first answer it only sets the number sent with the
 * Yes button (hidden field "count"); once confirmed it saves on its own, and the planner is told.
 */
export default function GuestCount({ count, pending, token, action, waitingExtra = 0, saved = false }: {
  count: number;
  pending?: boolean;
  token: string;
  action?: (form: FormData) => void | Promise<void>;
  waitingExtra?: number;
  saved?: boolean;
}) {
  const s = useS();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(count);
  const field = (
    <input
      name="count"
      type="number"
      min={1}
      max={70}
      inputMode="numeric"
      value={value}
      onChange={(e) => setValue(Math.max(1, Math.min(70, parseInt(e.target.value, 10) || 1)))}
      aria-label={s('guestsRegistered', { n: '' })}
      style={{ width: 90 }}
      autoFocus={open}
    />
  );
  return (
    <div className="guest-count">
      <div className="gc-row">
        <b>{s('guestsRegistered', { n: pending ? value : count })}</b>
        {!open && <button type="button" className="btn small" onClick={() => setOpen(true)}>{s('changeCount')}</button>}
      </div>
      {pending && open && (
        <div className="gc-edit">
          {field}
          <button type="button" className="btn small" onClick={() => setOpen(false)}>OK</button>
        </div>
      )}
      {pending && !open && <input type="hidden" name="count" value={value} />}
      {!pending && open && (
        <form action={action} className="gc-edit">
          <input type="hidden" name="token" value={token} />
          {field}
          <SubmitButton className="btn primary small">{s('save')}</SubmitButton>
          <button type="button" className="btn small" onClick={() => { setOpen(false); setValue(count); }}>{s('cancel')}</button>
        </form>
      )}
      {!pending && waitingExtra > 0 && <p className="muted" style={{ margin: 0 }}>{s('morePending', { n: waitingExtra })}</p>}
      {!pending && saved && !open && <p className="notice ok" style={{ margin: 0 }}>{s('countSaved')}</p>}
    </div>
  );
}
