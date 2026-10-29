import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export type EditorKeyActions = {
  enabled: RefObject<boolean>;
  hasSelection: () => boolean;
  remove: () => void;
  selectAll: () => void;
  copy: () => void;
  paste: () => void;
  undo: () => void;
  redo: () => void;
  escape: () => void;
};

/** Delete, select all, copy, paste, undo, redo and Escape while the hall is showing. */
export function useEditorKeys(actions: EditorKeyActions) {
  const ref = useRef(actions);
  ref.current = actions;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = ref.current;
      if (!a.enabled.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if ((e.key === 'Delete' || e.key === 'Backspace') && a.hasSelection()) {
        e.preventDefault();
        a.remove();
      } else if (mod && k === 'a') {
        e.preventDefault();
        a.selectAll();
      } else if (mod && k === 'c' && a.hasSelection()) {
        e.preventDefault();
        a.copy();
      } else if (mod && k === 'v') {
        e.preventDefault();
        a.paste();
      } else if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        a.undo();
      } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        a.redo();
      } else if (e.key === 'Escape') {
        a.escape();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** True while Shift is held (a drag on empty floor then draws a selection box). */
export function useShiftHeld() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Shift' && setHeld(true);
    const up = (e: KeyboardEvent) => e.key === 'Shift' && setHeld(false);
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
  return held;
}
