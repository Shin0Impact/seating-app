'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { matches } from '@/lib/search';

type Props = {
  value: string;
  onValue: (v: string) => void;
  suggestions: string[];
  className?: string;
  maxLength?: number;
  placeholder?: string;
  'aria-label'?: string;
};

/** A text field with our own suggestion list (replaces <input list> + <datalist>, which the browser draws itself). */
export function GroupInput({ value, onValue, suggestions, className, maxLength, placeholder, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
    max: number;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const shown = useMemo(
    () => suggestions.filter((s) => s !== value && (!value.trim() || matches(value, s))).slice(0, 40),
    [suggestions, value],
  );
  const visible = open && shown.length > 0;

  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const t = input.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const above = r.top - 12;
      const up = below < 200 && above > below;
      const rtl = getComputedStyle(t).direction === 'rtl';
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        ...(rtl ? { right: window.innerWidth - r.right } : { left: r.left }),
        width: Math.max(r.width, 180),
        max: Math.max(120, Math.min(260, up ? above : below)),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [visible]);

  useEffect(() => setActive(-1), [value]);

  const pick = (s: string) => {
    onValue(s);
    setOpen(false);
  };

  return (
    <>
      <input
        ref={input}
        type="text"
        className={className}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        aria-label={rest['aria-label']}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onValue(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!visible) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => (a + 1) % shown.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => (a <= 0 ? shown.length - 1 : a - 1));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(shown[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {visible &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="sel-pop"
            style={{ ...pos, maxHeight: pos.max }}
            dir={document.documentElement.dir || undefined}
            onPointerDown={(e) => e.preventDefault()}
          >
            <ul role="listbox" className="sel-list">
              {shown.map((s, i) => (
                <li
                  key={s}
                  role="option"
                  aria-selected={i === active}
                  className={`sel-opt${i === active ? ' active' : ''}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => pick(s)}
                >
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
