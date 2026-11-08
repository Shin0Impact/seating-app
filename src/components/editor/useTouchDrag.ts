import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { readPayload, type TouchPayload } from '@/lib/touchdrag';

export type TouchDropHandler = (p: TouchPayload, x: number, y: number, over: boolean, final: boolean) => void;

/**
 * Drag an item from the side panel over the hall: a finger holds it a moment first, a mouse just moves. The page
 * moves the item itself instead of using the browser's drag and drop, which on Windows can get stuck (Chrome then
 * refuses every drop with a "not allowed" sign until it is restarted).
 */
export function useTouchDrag(hallRef: RefObject<HTMLElement | null>, onDrop: TouchDropHandler, onStart: () => void) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const startRef = useRef(onStart);
  startRef.current = onStart;

  useEffect(() => {
    let pending: { timer: number; x: number; y: number; el: HTMLElement; mouse: boolean } | null = null;
    let active: { p: TouchPayload; ghost: HTMLElement; x: number; y: number; mouse: boolean } | null = null;
    const cancelPending = () => {
      if (pending) window.clearTimeout(pending.timer);
      pending = null;
    };
    const overHall = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!(hit && hallRef.current?.contains(hit));
    };
    const moveTo = (x: number, y: number) => {
      if (!active) return;
      active.x = x;
      active.y = y;
      active.ghost.style.transform = active.mouse
        ? `translate(${x}px, ${y}px) translate(12px, 12px)`
        : `translate(${x}px, ${y}px) translate(-50%, -130%)`;
      dropRef.current(active.p, x, y, overHall(x, y), false);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      e.preventDefault();
      const t0 = e.touches[0];
      if (t0) moveTo(t0.clientX, t0.clientY);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    const end = (cancelled: boolean) => {
      const a = active;
      if (!a) return;
      active = null;
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onCancel, true);
      document.removeEventListener('pointerup', onEnd, true);
      document.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('keydown', onEsc, true);
      document.documentElement.classList.remove('dragging-item');
      a.ghost.remove();
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'end' }));
      dropRef.current(a.p, a.x, a.y, !cancelled && overHall(a.x, a.y), true);
      // The finger or button lifting would otherwise also "click" what is underneath (or the tile, adding a copy).
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 300);
    };
    const onEnd = () => end(false);
    const onCancel = () => end(true);
    const activate = (el: HTMLElement, x: number, y: number, mouse: boolean) => {
      const p = readPayload(el);
      if (!p) return;
      const ghost = document.createElement('div');
      ghost.className = 'touch-ghost';
      ghost.textContent = p.label;
      document.body.appendChild(ghost);
      active = { p, ghost, x, y, mouse };
      startRef.current();
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'start' }));
      if (mouse) {
        window.getSelection()?.removeAllRanges();
        document.documentElement.classList.add('dragging-item');
        document.addEventListener('pointerup', onEnd, true);
        document.addEventListener('pointercancel', onCancel, true);
        window.addEventListener('blur', onCancel);
        document.addEventListener('keydown', onEsc, true);
      } else {
        navigator.vibrate?.(15);
        document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
        document.addEventListener('touchend', onEnd, true);
        document.addEventListener('touchcancel', onCancel, true);
      }
      moveTo(x, y);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      const el = t?.closest?.('[data-tdrag]') as HTMLElement | null;
      if (!el || active) return;
      el.draggable = false; // never the browser's own drag and drop
      // the buttons inside a row (edit, delete) and the pick-mode checkbox stay plain buttons
      const ctl = t?.closest?.('button, input, select, textarea, a');
      if (ctl && ctl !== el && el.contains(ctl)) return;
      cancelPending();
      const x = e.clientX;
      const y = e.clientY;
      if (e.pointerType !== 'touch') {
        if (e.button !== 0) return;
        e.preventDefault(); // no text selection while dragging
        pending = { x, y, el, mouse: true, timer: 0 };
        return;
      }
      pending = {
        x,
        y,
        el,
        mouse: false,
        timer: window.setTimeout(() => {
          pending = null;
          activate(el, x, y, false);
        }, 320),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (active?.mouse) return moveTo(e.clientX, e.clientY);
      if (!pending) return;
      const far = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (pending.mouse) {
        // a mouse starts dragging once it has moved a little (a plain click stays a click)
        if (far > 5) {
          const { el } = pending;
          pending = null;
          activate(el, e.clientX, e.clientY, true);
        }
        return;
      }
      if (far > 8) cancelPending();
    };
    // Android shows its own hold menu (copy / select / "right click") when a finger rests on a person or chip for a moment;
    // that would pop up over the drag. Block it after any touch, except inside text fields where select and paste are needed.
    let lastTouch = 0;
    const markTouch = (e: PointerEvent) => {
      if (e.pointerType === 'touch') lastTouch = Date.now();
    };
    const noNativeMenu = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable=true]')) return;
      if (active || pending || Date.now() - lastTouch < 3000) e.preventDefault();
    };
    document.addEventListener('pointerdown', markTouch, true);
    document.addEventListener('contextmenu', noNativeMenu, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cancelPending, true);
    document.addEventListener('pointercancel', cancelPending, true);
    return () => {
      cancelPending();
      active?.ghost.remove();
      document.removeEventListener('pointerdown', markTouch, true);
      document.removeEventListener('contextmenu', noNativeMenu, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cancelPending, true);
      document.removeEventListener('pointercancel', cancelPending, true);
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('pointerup', onEnd, true);
      document.removeEventListener('pointercancel', onCancel, true);
      window.removeEventListener('blur', onCancel);
      document.removeEventListener('keydown', onEsc, true);
      document.documentElement.classList.remove('dragging-item');
    };
  }, [hallRef]);
}
