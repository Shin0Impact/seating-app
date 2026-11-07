/** True on phones/tablets, where HTML5 drag-and-drop is unreliable and we use our own touch drag. */
let coarse: boolean | undefined;
export const coarsePointer = () => {
  if (typeof window === 'undefined') return false;
  return (coarse ??= window.matchMedia('(pointer: coarse)').matches);
};

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

/**
 * A press outside a menu or popup closes it, and nothing else: the rest of that same press (the release, and the
 * click or tap the browser makes from it) is dropped, so it cannot open whatever was underneath. Stops at the next
 * press, or after a moment.
 */
export function swallowRestOfPress() {
  if (typeof window === 'undefined') return;
  const types = ['pointerup', 'mouseup', 'touchend', 'click', 'contextmenu'];
  const stop = (e: Event) => {
    e.stopPropagation();
    if (e.cancelable && (e.type === 'click' || e.type === 'touchend' || e.type === 'contextmenu')) e.preventDefault();
    if (e.type === 'click') setTimeout(off, 0);
  };
  let timer = 0;
  const next = () => off();
  function off() {
    window.clearTimeout(timer);
    for (const t of types) window.removeEventListener(t, stop, true);
    window.removeEventListener('pointerdown', next, true);
  }
  for (const t of types) window.addEventListener(t, stop, true);
  timer = window.setTimeout(off, 800);
  // a new press starts fresh (registered after the current press has finished dispatching)
  setTimeout(() => window.addEventListener('pointerdown', next, true), 0);
}
