import { useState } from 'react';
import type { DragEvent } from 'react';
import type { TouchDropHandler } from './useTouchDrag';
import { parseSpec, type Spec } from '../editor-specs';

export type DropHint = { tableId: string; seat: number | null };

type Deps = {
  worldFromClient: (cx: number, cy: number) => { x: number; y: number };
  resolveDrop: (wx: number, wy: number, ignoreId?: string) => DropHint | null;
  addSpecAt: (spec: Spec, x: number, y: number) => void;
  dropGuest: (guestId: string, wx: number, wy: number) => void;
  dropMany: (ids: string[], wx: number, wy: number) => void;
  idsOfGroup: (group: string) => string[];
  clearPeopleSel: () => void;
};

const isGuestDrag = (e: DragEvent) =>
  Array.from(e.dataTransfer.types).some(
    (t) => t === 'text/guest-id' || t === 'text/guest-ids' || t === 'text/guest-group',
  );
const isPresetDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('text/element-preset');
const sameHint = (a: DropHint | null, b: DropHint | null) => a?.tableId === b?.tableId && a?.seat === b?.seat;

/**
 * Dropping guests onto chairs and palette items onto the hall, for both mouse drags (native drag and drop)
 * and touch drags. `dropHint` is the chair that would receive the guest, `presetOver` is true while a palette
 * item hovers the hall.
 */
export function useHallDrop(d: Deps) {
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [presetOver, setPresetOver] = useState(false);

  const hover = (r: DropHint | null) => setDropHint((prev) => (sameHint(prev, r) ? prev : r));

  const dropHandlers = {
    onDragOver: (e: DragEvent) => {
      if (isPresetDrag(e)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setPresetOver(true);
        return;
      }
      if (!isGuestDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const w = d.worldFromClient(e.clientX, e.clientY);
      hover(d.resolveDrop(w.x, w.y));
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDropHint(null);
        setPresetOver(false);
      }
    },
    onDrop: (e: DragEvent) => {
      if (isPresetDrag(e)) {
        e.preventDefault();
        setPresetOver(false);
        const sp = parseSpec(e.dataTransfer.getData('text/element-preset'));
        if (sp) {
          const w = d.worldFromClient(e.clientX, e.clientY);
          d.addSpecAt(sp, w.x, w.y);
        }
        return;
      }
      if (!isGuestDrag(e)) return;
      e.preventDefault();
      const w = d.worldFromClient(e.clientX, e.clientY);
      setDropHint(null);
      const many = e.dataTransfer.getData('text/guest-ids');
      const group = e.dataTransfer.getData('text/guest-group');
      if (many) d.dropMany(many.split(',').filter(Boolean), w.x, w.y);
      else if (group) d.dropMany(d.idsOfGroup(group), w.x, w.y);
      else {
        const id = e.dataTransfer.getData('text/guest-id');
        if (id) d.dropGuest(id, w.x, w.y);
      }
    },
  };

  const onTouchDrop: TouchDropHandler = (p, x, y, over, final) => {
    const w = d.worldFromClient(x, y);
    if (p.kind === 'preset') {
      setPresetOver(over && !final);
      if (final && over) {
        const sp = parseSpec(p.value);
        if (sp) d.addSpecAt(sp, w.x, w.y);
      }
      return;
    }
    const ids =
      p.kind === 'group' ? d.idsOfGroup(p.value) : p.kind === 'guests' ? p.value.split(',').filter(Boolean) : [p.value];
    if (!final) {
      hover(over ? d.resolveDrop(w.x, w.y) : null);
      return;
    }
    setDropHint(null);
    if (!over) return;
    if (ids.length === 1) d.dropGuest(ids[0], w.x, w.y);
    else {
      d.dropMany(ids, w.x, w.y);
      if (p.kind === 'guests') d.clearPeopleSel();
    }
  };

  return { dropHint, presetOver, dropHandlers, onTouchDrop };
}
