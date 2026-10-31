'use client';

import { useEffect, useRef, useState } from 'react';
import { useS } from './LangProvider';

type Bubble = { text: string; x: number; y: number; kind: 'tip' | 'err' };

/**
 * Replaces two things the browser draws by itself: the grey hover tooltip (the `title` attribute) and the
 * "Please fill out this field" bubble on forms. Both become our own bubbles.
 */
export function NativeUi() {
  const s = useS();
  const sRef = useRef(s);
  sRef.current = s;
  const [b, setB] = useState<Bubble | null>(null);
  const timer = useRef(0);
  const flagged = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const place = (el: Element, text: string, kind: Bubble['kind']) => {
      const r = el.getBoundingClientRect();
      setB({ text, kind, x: r.left + r.width / 2, y: kind === 'tip' ? r.top : r.bottom });
    };
    // Hover tooltips: take the title off the element (so the browser shows nothing) and show ours.
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as Element | null)?.closest?.('[title], [data-tip]') as HTMLElement | null;
      if (!el) return;
      const t = el.getAttribute('title');
      if (t) {
        if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', t);
        el.setAttribute('data-tip', t);
        el.removeAttribute('title');
      }
      const tip = el.getAttribute('data-tip');
      if (tip) place(el, tip, 'tip');
    };
    const out = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-tip]')) setB((x) => (x?.kind === 'tip' ? null : x));
    };
    const focus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      const tip = el?.getAttribute?.('data-tip');
      if (el && tip && el.matches(':focus-visible')) place(el, tip, 'tip');
    };
    const blur = () => setB((x) => (x?.kind === 'tip' ? null : x));

    // Form checks: our own message instead of the browser's bubble.
    const invalid = (e: Event) => {
      e.preventDefault();
      const el = e.target as HTMLInputElement;
      if (flagged.current) return; // only the first problem of a submit
      flagged.current = el;
      const v = el.validity;
      const t = sRef.current;
      const text = v.valueMissing ? t('valRequired') : v.tooShort ? t('valShort', { n: el.minLength }) : t('valFormat');
      el.focus({ preventScroll: false });
      el.setAttribute('aria-invalid', 'true');
      place(el, text, 'err');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setB((x) => (x?.kind === 'err' ? null : x)), 4500);
      window.setTimeout(() => (flagged.current = null), 0);
    };
    const input = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.getAttribute?.('aria-invalid')) el.removeAttribute('aria-invalid');
      setB((x) => (x?.kind === 'err' ? null : x));
    };
    const hide = () => setB(null);

    document.addEventListener('pointerover', over, true);
    document.addEventListener('pointerout', out, true);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('invalid', invalid, true);
    document.addEventListener('input', input, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('pointerdown', () => setB((x) => (x?.kind === 'tip' ? null : x)), true);
    return () => {
      document.removeEventListener('pointerover', over, true);
      document.removeEventListener('pointerout', out, true);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('invalid', invalid, true);
      document.removeEventListener('input', input, true);
      window.removeEventListener('scroll', hide, true);
    };
  }, []);

  if (!b) return null;
  const left = Math.min(Math.max(b.x, 90), window.innerWidth - 90);
  return (
    <div
      className={`ui-bubble ${b.kind}${b.kind === 'tip' ? ' above' : ''}`}
      role={b.kind === 'err' ? 'alert' : 'tooltip'}
      style={{ left, top: b.y }}
    >
      {b.text}
    </div>
  );
}
