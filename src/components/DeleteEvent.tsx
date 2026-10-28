'use client';
import { useState } from 'react';
import { deleteEvent } from '@/app/actions';
import { useS } from './LangProvider';

export default function DeleteEvent({ id, name }: { id: string; name: string }) {
  const s = useS();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  return (
    <section className="danger-zone">
      <div>
        <h3>{s('deleteEvent')}</h3>
        <p className="muted" style={{ margin: 0 }}>{s('deleteWarn')}</p>
      </div>
      {!open ? (
        <button className="btn danger" onClick={() => setOpen(true)}>{s('deleteBtn')}</button>
      ) : (
        <form action={deleteEvent} className="danger-form">
          <input type="hidden" name="id" value={id} />
          <label className="field-col">{s('typeNameToConfirm')} <b>{name}</b>
            <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn danger-fill" disabled={typed.trim() !== name.trim()}>{s('deleteForever')}</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setTyped(''); }}>{s('cancel')}</button>
          </div>
        </form>
      )}
    </section>
  );
}
