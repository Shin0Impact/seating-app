import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { readPayload, type TouchPayload } from '@/lib/touchdrag';

export type TouchDropHandler = (p: TouchPayload, x: number, y: number, over: boolean, final: boolean) => void;

/**
 * Hold an item with a finger, then drag it over the hall. Mouse drags use native drag and drop;
 * this covers touch screens, where that does not exist.
 */
export function useTouchDrag(hallRef: RefObject<HTMLElement | null>, onDrop: TouchDropHandler, onStart: () => void) {
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const startRef = useRef(onStart);
  startRef.current = onStart;

  useEffect(() => {
    let pending: { timer: number; x: number; y: number; el: HTMLElement } | null = null;
    let active: { p: TouchPayload; ghost: HTMLElement; x: number; y: number } | null = null;
    const cancelPending = () => {
      if (pending) window.clearTimeout(pending.timer);
      pending = null;
    };
    const overHall = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!(hit && hallRef.current?.contains(hit));
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      e.preventDefault();
      const t0 = e.touches[0];
      if (!t0) return;
      active.x = t0.clientX;
      active.y = t0.clientY;
      active.ghost.style.transform = `translate(${t0.clientX}px, ${t0.clientY}px) translate(-50%, -130%)`;
      dropRef.current(active.p, t0.clientX, t0.clientY, overHall(t0.clientX, t0.clientY), false);
    };
    const end = (cancelled: boolean) => {
      const a = active;
      if (!a) return;
      active = null;
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onCancel, true);
      a.ghost.remove();
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'end' }));
      dropRef.current(a.p, a.x, a.y, !cancelled && overHall(a.x, a.y), true);
      // The finger lifting would otherwise also "click" the tile and add a second copy.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 300);
    };
    const onEnd = () => end(false);
    const onCancel = () => end(true);
    const activate = (el: HTMLElement, x: number, y: number) => {
      const p = readPayload(el);
      if (!p) return;
      const ghost = document.createElement('div');
      ghost.className = 'touch-ghost';
      ghost.textContent = p.label;
      ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
      document.body.appendChild(ghost);
      active = { p, ghost, x, y };
      startRef.current();
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'start' }));
      navigator.vibrate?.(15);
      document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      document.addEventListener('touchend', onEnd, true);
      document.addEventListener('touchcancel', onCancel, true);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tdrag]') as HTMLElement | null;
      if (!el) return;
      cancelPending();
      const x = e.clientX;
      const y = e.clientY;
      pending = {
        x,
        y,
        el,
        timer: window.setTimeout(() => {
          pending = null;
          activate(el, x, y);
        }, 320),
      };
    };
    const onMove = (e: PointerEvent) => {
      if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 8) cancelPending();
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
    };
  }, [hallRef]);
}
