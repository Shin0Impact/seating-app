'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseLayout, type Layout } from '@/lib/layout';
import { merge3 } from '@/lib/merge';
import { browserClient } from '@/lib/supabase/browser';

export type SyncStatus = 'saved' | 'saving' | 'error' | 'merged';

/**
 * A newer plan from another device, already merged with this device's edits.
 * `mineAt` is this device's plan the merge was made from: if the screen changed since (an edit landed in between),
 * the screen merges `layout` into its current plan with `mineAt` as the common base, so nothing is lost.
 * `base`/`theirs` let the undo history take the other device's changes too.
 */
export type IncomingPlan = { layout: Layout; mineAt: Layout; base: Layout; theirs: Layout; seq: number };

const POLL_MS = 2500;
const SAVE_MS = 700;

/**
 * Live saving for one event's plan, safe with several phones open at once. Each device saves its edits a moment
 * after they stop and checks every few seconds for a newer version; when someone else saved first, their changes
 * are merged with this device's (field by field) instead of either side overwriting the other.
 */
export function useLayoutSync(id: string, initial: Layout, version: number) {
  const [status, setStatus] = useState<SyncStatus>('saved');
  const [incoming, setIncoming] = useState<IncomingPlan | null>(null);
  const ver = useRef(version);
  const base = useRef(initial);
  const baseJson = useRef(JSON.stringify(initial));
  const current = useRef(initial);
  const dirty = useRef(false);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  /**
   * A merged plan handed to the screen that the screen has not shown yet (it waits while a finger or the mouse is
   * down). Until it says so, every plan the screen reports is merged with it, so an edit made on the older screen
   * cannot save over what the other device did.
   */
  const unshown = useRef<IncomingPlan | null>(null);

  const flash = useCallback(() => {
    setStatus('merged');
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setStatus((s) => (s === 'merged' ? 'saved' : s)), 2500);
  }, []);

  /** Fetch a newer saved plan, if there is one, and merge it in. */
  const pull = useCallback(async (): Promise<boolean> => {
    const { data, error } = await browserClient()
      .from('events')
      .select('version,layout')
      .eq('id', id)
      .gt('version', ver.current)
      .maybeSingle();
    if (error || !data) return false;
    const theirs = parseLayout(data.layout);
    const mine = current.current;
    const prev = base.current;
    const merged = dirty.current ? merge3(prev, mine, theirs) : theirs;
    ver.current = data.version as number;
    base.current = theirs;
    baseJson.current = JSON.stringify(theirs);
    current.current = merged;
    dirty.current = merged !== theirs && JSON.stringify(merged) !== baseJson.current;
    const inc = { layout: merged, mineAt: mine, base: prev, theirs, seq: ++seq.current };
    unshown.current = inc;
    setIncoming(inc);
    flash();
    return true;
  }, [id, flash]);

  const flush = useCallback(async (): Promise<void> => {
    if (busy.current || !dirty.current) return;
    busy.current = true;
    setStatus('saving');
    const snap = current.current;
    const { data, error } = await browserClient()
      .from('events')
      .update({ layout: snap, version: ver.current + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('version', ver.current)
      .select('version');
    if (error) {
      busy.current = false;
      setStatus('error');
      timer.current = setTimeout(() => void flush(), 4000);
      return;
    }
    if (!data || data.length === 0) {
      // someone else saved first: take their changes, keep ours on top, and save again
      const got = await pull();
      busy.current = false;
      if (got) {
        void flush();
        return;
      }
      // nothing newer either: the save was refused (signed out, or no access any more). Say so, keep the edits
      // on this screen and try again in a moment instead of hammering the server
      setStatus('error');
      timer.current = setTimeout(() => void flush(), 4000);
      return;
    }
    ver.current = data[0].version as number;
    base.current = snap;
    baseJson.current = JSON.stringify(snap);
    dirty.current = current.current !== snap && JSON.stringify(current.current) !== baseJson.current;
    busy.current = false;
    setStatus((s) => (dirty.current ? 'saving' : s === 'merged' ? s : 'saved'));
    if (dirty.current) void flush();
  }, [id, pull]);

  const onChange = useCallback(
    (screen: Layout) => {
      const u = unshown.current;
      const layout = u ? applyIncoming(screen, u) : screen;
      current.current = layout;
      const json = JSON.stringify(layout);
      dirty.current = json !== baseJson.current;
      if (!dirty.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_MS);
    },
    [flush],
  );

  /** The screen now shows this merged plan. */
  const shown = useCallback((s: number) => {
    if (unshown.current && unshown.current.seq <= s) unshown.current = null;
  }, []);

  /** Save now (before leaving the page). */
  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
  }, [flush]);

  useEffect(() => {
    const down = () => (pressed.current = true);
    const up = () => (pressed.current = false);
    const tick = () => {
      if (document.visibilityState !== 'visible' || busy.current || dirty.current || pressed.current) return;
      void pull();
    };
    const iv = setInterval(tick, POLL_MS);
    const vis = () => {
      if (document.visibilityState === 'visible') return tick();
      // the app is going to the background (phone locked, switched app, tab closed): save right away, a phone may
      // stop the page before the usual short wait is over
      if (dirty.current) {
        if (timer.current) clearTimeout(timer.current);
        void flush();
      }
    };
    const hide = () => {
      if (!dirty.current) return;
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || busy.current) e.preventDefault();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // a mouse drag and drop ends without a pointerup in some browsers
    window.addEventListener('dragend', up, true);
    window.addEventListener('drop', up, true);
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', vis);
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(iv);
      // leaving the editor inside the app (back button, a link): save what is still waiting
      if (dirty.current) {
        if (timer.current) clearTimeout(timer.current);
        void flush();
      }
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('dragend', up, true);
      window.removeEventListener('drop', up, true);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('focus', vis);
      window.removeEventListener('beforeunload', warn);
    };
  }, [pull, flush]);

  return { status, incoming, onChange, saveNow, shown };
}

/** Bring a merged plan from another device onto the screen without losing an edit made while it was on its way. */
export function applyIncoming(screen: Layout, inc: IncomingPlan): Layout {
  return screen === inc.mineAt ? inc.layout : merge3(inc.mineAt, screen, inc.layout);
}
