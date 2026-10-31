'use client';

import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { matches } from '@/lib/search';

type Opt = { value: string; label: string; disabled?: boolean };

const textOf = (n: ReactNode): string => {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (isValidElement(n)) return textOf((n as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
};

/** Reads the <option> children (also inside fragments, arrays and optgroups) so it is a drop-in for <select>. */
function collect(children: ReactNode, out: Opt[]) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ children?: ReactNode; value?: string | number; disabled?: boolean }>;
    if (el.type === Fragment || el.type === 'optgroup') collect(el.props.children, out);
    else if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ value: String(el.props.value ?? label), label, disabled: el.props.disabled });
    }
  });
}

type Props = {
  value: string | number;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  title?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
};

const SEARCH_FROM = 9;

/** Our own dropdown: a listbox under the field on desktop, a bottom sheet on phones. Same props as <select>. */
export function Select({ value, onChange, children, className = '', disabled, name, id, title, ...rest }: Props) {
  const options = useMemo(() => {
    const out: Opt[] = [];
    collect(children, out);
    return out;
  }, [children]);
  const current = String(value);
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
    max: number;
  } | null>(null);
  const [sheet, setSheet] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const typed = useRef({ s: '', t: 0 });
  const uid = useId();
  const searchable = options.length >= SEARCH_FROM;
  const shown = useMemo(
    () => (query.trim() ? options.filter((o) => matches(query, o.label)) : options),
    [options, query],
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery('');
    if (refocus) trigger.current?.focus({ preventScroll: true });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === current);
    setActive(Math.max(0, i));
    setOpen(true);
  };

  const pick = (o: Opt) => {
    if (o.disabled) return;
    if (o.value !== current) onChange({ target: { value: o.value } });
    close();
  };

  // Place the list under the field (or above when there is no room); phones get a bottom sheet.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current;
      if (!t) return;
      const narrow = window.innerWidth <= 640;
      setSheet(narrow);
      if (narrow) return setPos(null);
      const r = t.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 220 && above > below;
      const rtl = getComputedStyle(t).direction === 'rtl';
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        ...(rtl ? { right: window.innerWidth - r.right } : { left: r.left }),
        width: Math.max(r.width, 180),
        max: Math.max(160, Math.min(340, up ? above : below)),
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: Event) => {
      const n = e.target as Node;
      if (popup.current?.contains(n) || trigger.current?.contains(n)) return;
      close(false);
    };
    const scroll = (e: Event) => {
      if (popup.current?.contains(e.target as Node)) return;
      if (window.innerWidth > 640) close(false);
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open, close]);

  // Keep the highlighted row in view, and lock page scroll behind the sheet.
  useEffect(() => {
    if (!open) return;
    popup.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, shown]);
  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  const move = (d: number) => {
    if (!shown.length) return;
    let i = active;
    for (let k = 0; k < shown.length; k++) {
      i = (i + d + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(Math.max(0, shown.length - 1));
    } else if (e.key === 'Enter' || (e.key === ' ' && !searchable)) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Tab') close(false);
    else if (!searchable && e.key.length === 1) {
      const now = Date.now();
      typed.current = { s: (now - typed.current.t > 700 ? '' : typed.current.s) + e.key.toLowerCase(), t: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s));
      if (i >= 0) setActive(i);
    }
  };

  const list = (
    <div
      ref={popup}
      className={`sel-pop${sheet ? ' sheet' : ''}`}
      style={sheet || !pos ? undefined : { ...pos, maxHeight: pos.max }}
      dir={typeof document !== 'undefined' ? document.documentElement.dir || undefined : undefined}
      onKeyDown={onKey}
    >
      {sheet && <span className="sel-grab" aria-hidden="true" />}
      {sheet && rest['aria-label'] && <p className="sel-title">{rest['aria-label']}</p>}
      {searchable && (
        <input
          type="search"
          className="sel-search"
          value={query}
          autoFocus={!sheet}
          aria-label={rest['aria-label']}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
        />
      )}
      <ul role="listbox" id={`${uid}-list`} aria-label={rest['aria-label']} className="sel-list">
        {shown.map((o, i) => (
          <li
            key={o.value + i}
            role="option"
            data-i={i}
            aria-selected={o.value === current}
            aria-disabled={o.disabled || undefined}
            className={`sel-opt${i === active ? ' active' : ''}${o.value === current ? ' on' : ''}`}
            onPointerMove={() => i !== active && setActive(i)}
            onClick={() => pick(o)}
          >
            <span>{o.label}</span>
            {o.value === current && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="sel-empty">—</li>}
      </ul>
    </div>
  );

  return (
    <>
      <button
        type="button"
        ref={trigger}
        id={id}
        title={title}
        disabled={disabled}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${uid}-list` : undefined}
        aria-label={rest['aria-label']}
        className={`sel-trigger ${className}`}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKey}
      >
        <span className="sel-label">{selected?.label ?? ''}</span>
        <svg
          className="sel-chev"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {name && <input type="hidden" name={name} value={current} />}
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {sheet && <div className="sel-backdrop" onPointerDown={() => close(false)} />}
            {list}
          </>,
          document.body,
        )}
    </>
  );
}
