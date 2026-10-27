'use client';
import { useState } from 'react';
import { deleteEvent } from '@/app/actions';

export default function DeleteEvent({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  return (
    <section className="danger-zone">
      <div>
        <h3>حذف المناسبة</h3>
        <p className="muted" style={{ margin: 0 }}>يحذف المخطط والضيوف وكل روابط الدعوات نهائيًا. لا يمكن التراجع.</p>
      </div>
      {!open ? (
        <button className="btn danger" onClick={() => setOpen(true)}>حذف المناسبة…</button>
      ) : (
        <form action={deleteEvent} className="danger-form">
          <input type="hidden" name="id" value={id} />
          <label className="field-col">اكتب اسم المناسبة للتأكيد: <b>{name}</b>
            <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn danger-fill" disabled={typed.trim() !== name.trim()}>احذف نهائيًا</button>
            <button type="button" className="btn" onClick={() => { setOpen(false); setTyped(''); }}>إلغاء</button>
          </div>
        </form>
      )}
    </section>
  );
}
