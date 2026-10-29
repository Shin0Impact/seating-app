import { useRef } from 'react';
import type { RefObject } from 'react';
import type Konva from 'konva';

/**
 * Touch hold-and-release menu for the canvas. The menu opens when the finger lifts after a long hold,
 * so hold-then-drag never opens it. `lastTouchAt` lets the canvas ignore the contextmenu event Android
 * fires for the same press.
 */
export function useLongPress(
  wrapRef: RefObject<HTMLDivElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
  openMenu: (node: Konva.Node | null, clientX: number, clientY: number) => void,
) {
  const press = useRef<{ timer: number; x: number; y: number; ready?: boolean } | null>(null);
  const lastTouchAt = useRef(0);

  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      lastTouchAt.current = Date.now();
      cancel();
      const { clientX: x, clientY: y } = e;
      press.current = {
        x,
        y,
        timer: window.setTimeout(() => {
          if (press.current) press.current.ready = true;
        }, 550),
      };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancel();
    },
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current;
      cancel();
      if (p?.ready && e.pointerType === 'touch') {
        const r = wrapRef.current?.getBoundingClientRect();
        const node = r ? (stageRef.current?.getIntersection({ x: p.x - r.left, y: p.y - r.top }) ?? null) : null;
        openMenu(node, e.clientX, e.clientY);
      }
    },
    onPointerCancel: cancel,
  };
  return { handlers, cancel, lastTouchAt };
}
