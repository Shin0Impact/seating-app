import { useCallback, useRef, useState } from 'react';
import { emptyLayout, type Layout } from '@/lib/layout';

const MAX_UNDO = 60;
/** Edits with the same key within this many ms (typing in a field, nudging a number) undo as one step. */
const COALESCE_MS = 800;

/** The hall layout plus its undo/redo stacks. `commit` is the only way edits enter the history. */
export function useLayoutHistory() {
  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const past = useRef<Layout[]>([]);
  const future = useRef<Layout[]>([]);
  const lastEdit = useRef<{ key: string; time: number }>({ key: '', time: 0 });

  const commit = useCallback((next: Layout, key = '') => {
    const now = Date.now();
    const coalesce = key !== '' && lastEdit.current.key === key && now - lastEdit.current.time < COALESCE_MS;
    if (!coalesce) {
      past.current.push(layoutRef.current);
      if (past.current.length > MAX_UNDO) past.current.shift();
    }
    future.current = [];
    lastEdit.current = { key, time: now };
    setLayout(next);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev) {
      future.current.push(layoutRef.current);
      lastEdit.current = { key: '', time: 0 };
      setLayout(prev);
    }
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      past.current.push(layoutRef.current);
      lastEdit.current = { key: '', time: 0 };
      setLayout(next);
    }
  }, []);

  return {
    layout,
    setLayout,
    layoutRef,
    commit,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
