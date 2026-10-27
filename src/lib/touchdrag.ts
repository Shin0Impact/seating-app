/** True on phones/tablets, where HTML5 drag-and-drop is unreliable and we use our own touch drag. */
export const coarsePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

/** preset: an element spec; guest: one guest id; guests: comma-separated ids; group: a group name (its unseated members). */
export type TouchPayload = { kind: 'preset' | 'guest' | 'guests' | 'group'; value: string; label: string };

/** Reads what a `data-tdrag` element carries: "preset:<spec>" or "guest:<id>". */
export function readPayload(el: HTMLElement): TouchPayload | null {
  const raw = el.getAttribute('data-tdrag');
  if (!raw) return null;
  const i = raw.indexOf(':');
  const kind = raw.slice(0, i);
  const value = raw.slice(i + 1);
  const label = (el.textContent || '').trim().slice(0, 40);
  return kind === 'preset' || kind === 'guest' || kind === 'guests' || kind === 'group' ? { kind, value, label } : null;
}
