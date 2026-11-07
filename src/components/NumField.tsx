'use client';

import { useEffect, useRef, useState } from 'react';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const round2 = (v: number) => Math.round(v * 100) / 100;

/** Number input that lets you type freely and only applies valid, clamped values. */
export function NumField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  int?: boolean;
  hideLabel?: boolean;
  /** Wait this long after the last keystroke before applying (typing "18" must not apply "1" first). Enter or leaving the field applies at once. */
  delay?: number;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.1, int, hideLabel, delay = 0, onChange } = props;
  const [txt, setTxt] = useState(String(round2(value)));
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waiting = useRef<number | null>(null);
  const apply = (n: number | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    waiting.current = null;
    if (n !== null && n !== value) onChange(n);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!focused.current) setTxt(String(round2(value)));
  }, [value]);
  return (
    <label className={hideLabel ? 'field bare' : 'field'}>
      {!hideLabel && <span>{label}</span>}
      <input
        type="number"
        inputMode="decimal"
        aria-label={hideLabel ? label : undefined}
        value={txt}
        min={min}
        max={max}
        step={step}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          const w = waiting.current;
          apply(w);
          setTxt(String(round2(w ?? value)));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && waiting.current !== null) apply(waiting.current);
        }}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value);
          if (!Number.isFinite(n)) return;
          const v = clamp(int ? Math.round(n) : n, min, max);
          if (!delay) return onChange(v);
          // the arrows on the field step by one: apply those at once
          const stepped = Math.abs(v - value) === step && !(e.nativeEvent as InputEvent).inputType;
          if (stepped) return apply(v);
          waiting.current = v;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => apply(v), delay);
        }}
      />
    </label>
  );
}
