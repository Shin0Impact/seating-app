'use client';
import { useRef, useState } from 'react';
import { useS } from './LangProvider';

/** Wheel / pinch / buttons to zoom, drag to move. Wraps anything (the hall drawing). */
export default function ZoomPan({ children }: { children: React.ReactNode }) {
  const s = useS();
  const [v, setV] = useState({ k: 1, x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ d: number } | null>(null);

  const zoomAt = (factor: number, cx: number, cy: number) =>
    setV((p) => {
      const k = Math.min(8, Math.max(1, p.k * factor));
      const f = k / p.k;
      // keep the point under (cx, cy) fixed
      return k === 1 ? { k, x: 0, y: 0 } : { k, x: cx - (cx - p.x) * f, y: cy - (cy - p.y) * f };
    });
  const centre = () => {
    const r = box.current?.getBoundingClientRect();
    return { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 };
  };
  const rel = (e: { clientX: number; clientY: number }) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div
      className="zoompan"
      ref={box}
      onWheel={(e) => {
        const p = rel(e);
        zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.zp-btns')) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        last.current = null;
      }}
      onPointerMove={(e) => {
        const prev = pts.current.get(e.pointerId);
        if (!prev) return;
        pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.current.size === 2) {
          const [a, b] = [...pts.current.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (last.current && last.current.d > 0) {
            const mid = rel({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
            zoomAt(d / last.current.d, mid.x, mid.y);
          }
          last.current = { d };
        } else if (pts.current.size === 1) {
          const dx = e.clientX - prev.x;
          const dy = e.clientY - prev.y;
          setV((p) => (p.k === 1 ? p : { ...p, x: p.x + dx, y: p.y + dy }));
        }
      }}
      onPointerUp={(e) => { pts.current.delete(e.pointerId); last.current = null; }}
      onPointerCancel={(e) => { pts.current.delete(e.pointerId); last.current = null; }}
    >
      <div className="zp-inner" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>{children}</div>
      <div className="zp-btns">
        <button type="button" aria-label={s('zoomIn')} onClick={() => { const c = centre(); zoomAt(1.5, c.x, c.y); }}>+</button>
        <button type="button" aria-label={s('zoomOut')} onClick={() => { const c = centre(); zoomAt(1 / 1.5, c.x, c.y); }}>−</button>
        {v.k > 1 && <button type="button" aria-label={s('zoomReset')} onClick={() => setV({ k: 1, x: 0, y: 0 })}>⟲</button>}
      </div>
    </div>
  );
}
