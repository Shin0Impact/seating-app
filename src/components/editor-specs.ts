import { LIMITS, MARKER_KINDS, type MarkerKind } from '@/lib/layout';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const USAGE_KEY = 'seating-table-usage-v1';
/** Shown when nothing has been used yet; usage then reorders them and brings in new sizes. */
export const DEFAULT_PRESETS: { shape: 'round' | 'rect'; seats: number }[] = [
  { shape: 'round', seats: 20 },
  { shape: 'round', seats: 10 },
  { shape: 'round', seats: 8 },
  { shape: 'round', seats: 12 },
  { shape: 'rect', seats: 20 },
  { shape: 'rect', seats: 10 },
  { shape: 'rect', seats: 8 },
];
export const PRESET_SLOTS = 7;

export type Spec =
  | { kind: 'table'; shape: 'round' | 'rect'; seats: number }
  | { kind: 'column'; shape: 'circle' | 'square' }
  | { kind: 'zone' }
  | { kind: 'marker'; marker: MarkerKind };

export const specToString = (sp: Spec) =>
  sp.kind === 'table'
    ? `table:${sp.shape}:${sp.seats}`
    : sp.kind === 'column'
      ? `column:${sp.shape}`
      : sp.kind === 'marker'
        ? `marker:${sp.marker}`
        : 'zone';

export function parseSpec(str: string): Spec | null {
  const [kind, a, b] = str.split(':');
  if (kind === 'table' && (a === 'round' || a === 'rect') && Number.isFinite(Number(b)))
    return { kind, shape: a, seats: clamp(Math.round(Number(b)), LIMITS.seatsMin, LIMITS.seatsMax) };
  if (kind === 'column' && (a === 'circle' || a === 'square')) return { kind, shape: a };
  if (kind === 'zone') return { kind };
  if (kind === 'marker' && (MARKER_KINDS as readonly string[]).includes(a)) return { kind, marker: a as MarkerKind };
  return null;
}
