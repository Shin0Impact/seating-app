'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { localeOf } from '@/lib/site-i18n';
import { useLang, useS } from './LangProvider';

type Pos = { top?: number; bottom?: number; left?: number; right?: number; width: number } | null;

/** Opens under the field on desktop, as a bottom sheet on phones; closes on outside tap, scroll or Escape. */
function Pop({
  anchor,
  onClose,
  title,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<Pos>(null);
  const [sheet, setSheet] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor) return;
      const narrow = window.innerWidth <= 640;
      setSheet(narrow);
      if (narrow) return setPos(null);
      const r = anchor.getBoundingClientRect();
      const up = window.innerHeight - r.bottom < 360 && r.top > window.innerHeight - r.bottom;
      const rtl = getComputedStyle(anchor).direction === 'rtl';
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        ...(rtl ? { right: window.innerWidth - r.right } : { left: r.left }),
        width: Math.max(r.width, 280),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);
  useEffect(() => {
    const down = (e: Event) => {
      const n = e.target as Node;
      if (box.current?.contains(n) || anchor?.contains(n)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const scroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node) && window.innerWidth > 640) onClose();
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [anchor, onClose]);
  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheet]);
  return createPortal(
    <>
      {sheet && <div className="sel-backdrop" onPointerDown={onClose} />}
      <div
        ref={box}
        role="dialog"
        aria-label={title}
        className={`sel-pop pick-pop${sheet ? ' sheet' : ''}`}
        style={sheet || !pos ? undefined : pos}
        dir={document.documentElement.dir || undefined}
      >
        {sheet && <span className="sel-grab" aria-hidden="true" />}
        {children}
      </div>
    </>,
    document.body,
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseIso = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
};

const Chev = ({ flip }: { flip?: boolean }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={flip ? { transform: 'scaleX(-1)' } : undefined}
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

/** A date field with our own calendar. Submits `YYYY-MM-DD` (or empty) under `name`, like <input type="date">. */
export function DateField({ name, defaultValue = '' }: { name: string; defaultValue?: string }) {
  const s = useS();
  const { lang } = useLang();
  const locale = localeOf(lang);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const cur = parseIso(value);
  const now = new Date();
  const [view, setView] = useState({ y: cur?.y ?? now.getFullYear(), m: cur?.m ?? now.getMonth() });
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const first = new Date(view.y, view.m, 1).getDay();
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(first).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(view.y, view.m, 1));
  const wd = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + i)),
  );
  const shift = (d: number) => setView((v) => ({ y: v.y + Math.floor((v.m + d) / 12), m: (v.m + d + 12) % 12 }));
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const text = cur
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
        new Date(cur.y, cur.m, cur.d),
      )
    : '';
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        ref={btn}
        className="sel-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`sel-label${text ? '' : ' ph'}`}>{text || s('pickDate')}</span>
        <svg
          className="sel-chev"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      {open && (
        <Pop anchor={btn.current} onClose={close} title={s('pickDate')}>
          <div className="cal-head">
            <button type="button" className="cal-nav" aria-label={s('pickPrev')} onClick={() => shift(-1)}>
              <Chev flip={rtl} />
            </button>
            <strong>
              {monthName} {view.y}
            </strong>
            <button type="button" className="cal-nav" aria-label={s('pickNext')} onClick={() => shift(1)}>
              <Chev flip={!rtl} />
            </button>
          </div>
          <div className="cal-grid cal-wd" aria-hidden="true">
            {wd.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) =>
              d === 0 ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  className={`cal-day${iso(view.y, view.m, d) === value ? ' on' : ''}${iso(view.y, view.m, d) === today ? ' today' : ''}`}
                  onClick={() => {
                    setValue(iso(view.y, view.m, d));
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              ),
            )}
          </div>
          <div className="cal-foot">
            <button
              type="button"
              onClick={() => {
                setValue(today);
                setView({ y: now.getFullYear(), m: now.getMonth() });
                setOpen(false);
              }}
            >
              {s('pickToday')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  setValue('');
                  setOpen(false);
                }}
              >
                {s('pickClear')}
              </button>
            )}
          </div>
        </Pop>
      )}
    </>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** A time field with our own hour/minute lists. Submits `HH:MM` (or empty) under `name`, like <input type="time">. */
export function TimeField({ name, defaultValue = '' }: { name: string; defaultValue?: string }) {
  const s = useS();
  const [value, setValue] = useState(defaultValue.slice(0, 5));
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const m = /^(\d{2}):(\d{2})/.exec(value);
  const h = m ? +m[1] : null;
  const mi = m ? +m[2] : null;
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), ...(mi == null ? [] : [mi])])].sort(
    (a, b) => a - b,
  );
  const set = (nh: number | null, nm: number | null) => setValue(`${pad(nh ?? 0)}:${pad(nm ?? 0)}`);
  useEffect(() => {
    if (!open) return;
    document.querySelectorAll('.time-col .on').forEach((e) => e.scrollIntoView({ block: 'center' }));
  }, [open]);
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        ref={btn}
        className="sel-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`sel-label${value ? '' : ' ph'}`} dir="ltr">
          {value || s('pickTime')}
        </span>
        <svg
          className="sel-chev"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      </button>
      {open && (
        <Pop anchor={btn.current} onClose={close} title={s('pickTime')}>
          <div className="time-cols" dir="ltr">
            <div className="time-col" role="listbox" aria-label={s('pickHour')}>
              {HOURS.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="option"
                  aria-selected={x === h}
                  className={x === h ? 'on' : ''}
                  onClick={() => set(x, mi)}
                >
                  {pad(x)}
                </button>
              ))}
            </div>
            <div className="time-col" role="listbox" aria-label={s('pickMinute')}>
              {minutes.map((x) => (
                <button
                  key={x}
                  type="button"
                  role="option"
                  aria-selected={x === mi}
                  className={x === mi ? 'on' : ''}
                  onClick={() => set(h, x)}
                >
                  {pad(x)}
                </button>
              ))}
            </div>
          </div>
          <div className="cal-foot">
            <button type="button" className="primary" onClick={close}>
              {s('pickDone')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  setValue('');
                  setOpen(false);
                }}
              >
                {s('pickClear')}
              </button>
            )}
          </div>
        </Pop>
      )}
    </>
  );
}
