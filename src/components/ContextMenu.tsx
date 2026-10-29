'use client';

import { useEffect, useRef } from 'react';

export type MenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean } | 'sep';

/** Right-click / long-press menu. Closes on outside press, Escape or after choosing. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const opened = useRef(Date.now());
  const ref = useRef<HTMLDivElement>(null);
  const lastTouch = useRef(0);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    // browsers send a fake mouse press right after a finger lifts; it must not close the menu
    const touch = () => (lastTouch.current = Date.now());
    document.addEventListener('touchend', touch, true);
    return () => document.removeEventListener('touchend', touch, true);
  }, []);
  const mayClose = () => Date.now() - opened.current > 350 && Date.now() - lastTouch.current > 700;
  const H = items.length * 40 + 16;
  const left = Math.max(8, Math.min(x, window.innerWidth - 248));
  const top = Math.max(8, Math.min(y, window.innerHeight - H - 8));
  return (
    <>
      <div
        className="menu-backdrop"
        // a finger lifting right after a long press must not close the menu it just opened
        onMouseDown={() => mayClose() && onClose()}
        onTouchStart={() => Date.now() - opened.current > 350 && onClose()}
        onContextMenu={(e) => {
          e.preventDefault();
          if (mayClose()) onClose();
        }}
      />
      <div
        ref={ref}
        className="ctxmenu"
        role="menu"
        style={{ left, top }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {items.map((it, i) =>
          it === 'sep' ? (
            <hr key={i} />
          ) : (
            <button
              key={i}
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              disabled={it.disabled}
              onClick={() => {
                onClose();
                it.onClick();
              }}
            >
              {it.label}
            </button>
          ),
        )}
      </div>
    </>
  );
}
