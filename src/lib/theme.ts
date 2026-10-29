'use client';
import { useCallback, useEffect, useState } from 'react';

export type ThemePref = 'auto' | 'light' | 'dark';
export type Theme = 'light' | 'dark';
export const THEME_KEY = 'seating-theme';

/** Runs before first paint (inlined in <head>) so there is no light flash in dark mode. */
export const THEME_BOOT = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()`;

export function readPref(): ThemePref {
  try {
    const p = localStorage.getItem(THEME_KEY);
    if (p === 'light' || p === 'dark' || p === 'auto') return p;
  } catch {}
  return 'light'; // first visit opens in light mode; Auto is opt-in
}

export function resolve(pref: ThemePref): Theme {
  if (pref === 'auto')
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return pref;
}

function apply(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

/** Theme preference (auto follows the device) and the resolved light/dark value. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>('light');
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const p = readPref();
    setPrefState(p);
    const sync = () => {
      const t = resolve(readPref());
      setTheme(t);
      apply(t);
    };
    sync();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', sync);
    window.addEventListener('storage', sync);
    window.addEventListener('seating-theme', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('storage', sync);
      window.removeEventListener('seating-theme', sync);
    };
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(THEME_KEY, p);
    } catch {}
    const t = resolve(p);
    setTheme(t);
    apply(t);
    window.dispatchEvent(new Event('seating-theme'));
  }, []);

  return { pref, theme, setPref };
}
