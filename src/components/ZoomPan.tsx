'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useS } from './LangProvider';

type View = { k: number; x: number; y: number };
const MAX = 10;

/** The full-screen surface: pinch follows the fingers exactly, drag moves, wheel zooms toward the pointer. */
function Surface({ children, label, onClose }: { children: React.ReactNode; label: string; onClose: () => void }) {
  const s = useS();
  const box = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<View>({ k: 1, x: 0, y: 0 });
  const vRef = useRef(v);
  vRef.current = v;
  const pts = useRef(new Map<number, { x: number; y: number }>());
  /** State when the current gesture began: the content point under the fingers must stay under them. */
  const g = useRef<{ v0: View; mid0: { x: number; y: number }; d0: number } | null>(null);

  const local = (cx: number, cy: number) => {
    const r = box.current!.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };
  const begin = () => {
    const ps = [...pts.current.values()].map((p) => local(p.x, p.y));
    if (ps.length === 0) return (g.current = null);
    const mid = ps.length === 1 ? ps[0] : { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    g.current = { v0: vRef.current, mid0: mid, d0: ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0 };
  };
  const apply = () => {
    const cur = g.current;
    if (!cur) return;
    const ps = [...pts.current.values()].map((p) => local(p.x, p.y));
    if (ps.length === 0) return;
    const mid = ps.length === 1 ? ps[0] : { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    const d = ps.length === 2 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0;
    const k = ps.length === 2 && cur.d0 > 0 ? Math.min(MAX, Math.max(1, cur.v0.k * (d / cur.d0))) : cur.v0.k;
    const px = (cur.mid0.x - cur.v0.x) / cur.v0.k; // content point first under the fingers
    const py = (cur.mid0.y - cur.v0.y) / cur.v0.k;
    setV(k === 1 ? { k, x: 0, y: 0 } : { k, x: mid.x - px * k, y: mid.y - py * k });
  };

  // wheel must be non-passive to stop the page scrolling behind
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = local(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016));
      setV((c) => {
        const k = Math.min(MAX, Math.max(1, c.k * factor));
        const f = k / c.k;
        return k === 1 ? { k, x: 0, y: 0 } : { k, x: p.x - (p.x - c.x) * f, y: p.y - (p.y - c.y) * f };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const buttonZoom = (factor: number) => {
    const r = box.current!.getBoundingClientRect();
    const p = { x: r.width / 2, y: r.height / 2 };
    setV((c) => {
      const k = Math.min(MAX, Math.max(1, c.k * factor));
      const f = k / c.k;
      return k === 1 ? { k, x: 0, y: 0 } : { k, x: p.x - (p.x - c.x) * f, y: p.y - (p.y - c.y) * f };
    });
  };

  return (
    <div className="zp-full" role="dialog" aria-modal="true" aria-label={label}>
      <div
        className="zp-surface"
        ref={box}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('.zp-btns')) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          begin();
        }}
        onPointerMove={(e) => {
          if (!pts.current.has(e.pointerId)) return;
          pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          apply();
        }}
        onPointerUp={(e) => { pts.current.delete(e.pointerId); begin(); }}
        onPointerCancel={(e) => { pts.current.delete(e.pointerId); begin(); }}
        onDoubleClick={(e) => {
          const p = local(e.clientX, e.clientY);
          setV((c) => {
            if (c.k > 1.01) return { k: 1, x: 0, y: 0 };
            const k = 3;
            return { k, x: p.x - p.x * k, y: p.y - p.y * k };
          });
        }}
      >
        <div className="zp-inner" style={{ width: `${v.k * 100}%`, height: `${v.k * 100}%`, transform: `translate(${v.x}px, ${v.y}px)` }}>{children}</div>
      </div>
      <div className="zp-title">{label}</div>
      <div className="zp-btns">
        <button type="button" aria-label={s('closeMap')} onClick={onClose}>✕</button>
        <button type="button" aria-label={s('zoomIn')} onClick={() => buttonZoom(1.6)}>+</button>
        <button type="button" aria-label={s('zoomOut')} onClick={() => buttonZoom(1 / 1.6)}>−</button>
      </div>
    </div>
  );
}

/** A button showing where your table is; it opens the hall full screen to pinch, drag and scroll-zoom. */
export default function ZoomPan({ children, label, small }: { children: React.ReactNode; label: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" className={small ? 'btn small zp-open zp-small' : 'btn zp-open'} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        <span>{label}</span>
        {!small && <span aria-hidden>⤢</span>}
      </button>
      {open && mounted && createPortal(<Surface label={label} onClose={close}>{children}</Surface>, document.body)}
    </>
  );
}
