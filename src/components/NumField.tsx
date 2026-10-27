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
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.1, int, hideLabel, onChange } = props;
  const [txt, setTxt] = useState(String(round2(value)));
  const focused = useRef(false);
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
          setTxt(String(round2(value)));
        }}
        onChange={(e) => {
          setTxt(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(int ? Math.round(n) : n, min, max));
        }}
      />
    </label>
  );
}
