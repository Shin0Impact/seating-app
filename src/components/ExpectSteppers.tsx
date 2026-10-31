'use client';

import type { Counts } from '@/lib/expect';

type Props = {
  size: number;
  value: Counts;
  labels: { sure: string; maybe: string; court: string };
  onChange: (sure: number, maybe: number) => void;
};

/** Planner's guess for one invitation: how many are sure and how many maybe; the rest are courtesy. */
export function ExpectSteppers({ size, value, labels, onChange }: Props) {
  const { sure, maybe, court } = value;
  const full = sure + maybe >= size;
  return (
    <div className="exp-row">
      <span className="stepper sure">
        <span className="lbl">{labels.sure}</span>
        <button
          type="button"
          aria-label={`${labels.sure} −`}
          disabled={sure === 0}
          onClick={() => onChange(sure - 1, maybe)}
        >
          −
        </button>
        <output>{sure}</output>
        <button
          type="button"
          aria-label={`${labels.sure} +`}
          disabled={full && maybe === 0}
          onClick={() => onChange(sure + 1, maybe - (full ? 1 : 0))}
        >
          +
        </button>
      </span>
      <span className="stepper maybe">
        <span className="lbl">{labels.maybe}</span>
        <button
          type="button"
          aria-label={`${labels.maybe} −`}
          disabled={maybe === 0}
          onClick={() => onChange(sure, maybe - 1)}
        >
          −
        </button>
        <output>{maybe}</output>
        <button
          type="button"
          aria-label={`${labels.maybe} +`}
          disabled={full && sure === 0}
          onClick={() => onChange(sure - (full ? 1 : 0), maybe + 1)}
        >
          +
        </button>
      </span>
      {court > 0 && (
        <span className="exp-rest">
          {court} {labels.court}
        </span>
      )}
    </div>
  );
}
