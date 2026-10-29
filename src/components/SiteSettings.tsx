'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { useS } from './LangProvider';
import SettingsPanel, { type AccountProps } from './SettingsPanel';

/** The gear button every page shows. Signed-in pages pass `account`; the landing and invite pages don't. */
export default function SiteSettings({ account }: { account?: AccountProps }) {
  const [open, setOpen] = useState(false);
  const s = useS();
  return (
    <>
      <button
        className="icon-btn"
        aria-label={s('settings')}
        title={s('settings')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="settings" />
      </button>
      {open && <SettingsPanel account={account} onClose={() => setOpen(false)} />}
    </>
  );
}
