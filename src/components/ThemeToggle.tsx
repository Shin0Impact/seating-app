'use client';
import { useTheme, type ThemePref } from '@/lib/theme';
import { Icon } from './Icon';

const NEXT: Record<ThemePref, ThemePref> = { auto: 'light', light: 'dark', dark: 'auto' };
const LABEL: Record<ThemePref, string> = { auto: 'المظهر: تلقائي', light: 'المظهر: فاتح', dark: 'المظهر: داكن' };

/** Cycles auto → light → dark. Used on the site pages; the editor has the full Settings dialog. */
export default function ThemeToggle() {
  const { pref, setPref } = useTheme();
  return (
    <button className="icon-btn" title={LABEL[pref]} aria-label={LABEL[pref]} onClick={() => setPref(NEXT[pref])}>
      {pref === 'dark' ? <Icon name="moon" /> : <Icon name="sun" />}
      {pref === 'auto' && <small aria-hidden style={{ fontSize: 10, marginInlineStart: -2 }}>A</small>}
    </button>
  );
}
