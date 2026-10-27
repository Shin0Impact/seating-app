'use client';
import { useEffect } from 'react';
import type { Lang, Key } from '@/lib/i18n';
import type { ThemePref } from '@/lib/theme';
import { Icon } from './Icon';

type Props = {
  t: (k: Key) => string;
  lang: Lang;
  setLang: (l: Lang) => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  snapGrid: boolean;
  toggleSnap: () => void;
  locked: boolean;
  toggleLock: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  clearDisabled: boolean;
  onClose: () => void;
};

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={onClick} />;
}

export default function SettingsDialog(p: Props) {
  const { t } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  return (
    <>
      <div className="picker-backdrop" onMouseDown={p.onClose} />
      <div className="import-dialog settings" role="dialog" aria-label={t('appSettings')}>
        <h2>{t('appSettings')}</h2>

        <section className="set-sec">
          <h3>{t('setLanguage')}</h3>
          <div className="seg" role="group" aria-label={t('setLanguage')}>
            <button className={p.lang === 'ar' ? 'on' : ''} onClick={() => p.setLang('ar')}>العربية</button>
            <button className={p.lang === 'en' ? 'on' : ''} onClick={() => p.setLang('en')}>English</button>
          </div>
        </section>

        <section className="set-sec">
          <h3>{t('setAppearance')}</h3>
          <div className="seg" role="group" aria-label={t('setAppearance')}>
            {([['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]] as const).map(([k, label]) => (
              <button key={k} className={p.themePref === k ? 'on' : ''} onClick={() => p.setThemePref(k)}>
                {k === 'light' && <Icon name="sun" size={16} />}
                {k === 'dark' && <Icon name="moon" size={16} />}
                {label}
              </button>
            ))}
          </div>
          <small className="muted">{t('themeHint')}</small>
        </section>

        <section className="set-sec">
          <h3>{t('setLayout')}</h3>
          <div className="set-row">
            <div>{t('snapShort')}<small>{t('snapHint')}</small></div>
            <Switch on={p.snapGrid} onClick={p.toggleSnap} label={t('snapShort')} />
          </div>
          <div className="set-row">
            <div>{t('lockShort')}<small>{t('lockHint')}</small></div>
            <Switch on={p.locked} onClick={p.toggleLock} label={t('lockShort')} />
          </div>
        </section>

        <section className="set-sec">
          <h3>{t('setData')}</h3>
          <small className="muted">{t('dataHint')}</small>
          <div className="set-actions">
            <button onClick={p.onExport}><Icon name="download" size={18} />{t('exportFile')}</button>
            <button onClick={p.onImport}><Icon name="upload" size={18} />{t('importFile')}</button>
            <button className="danger" onClick={p.onClear} disabled={p.clearDisabled}><Icon name="trash" size={18} />{t('clearAll')}</button>
          </div>
        </section>

        <div className="set-actions">
          <button className="primary" onClick={p.onClose} autoFocus>{t('closeSettings')}</button>
        </div>
      </div>
    </>
  );
}
