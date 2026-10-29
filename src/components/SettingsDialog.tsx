'use client';
import type { Key } from '@/lib/i18n';
import { Icon } from './Icon';
import SettingsPanel, { type AccountProps } from './SettingsPanel';

type Props = {
  account?: AccountProps;
  t: (k: Key) => string;
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
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" onClick={onClick} />
  );
}

/** The common settings menu plus the hall designer's own sections. */
export default function SettingsDialog(p: Props) {
  const { t } = p;
  return (
    <SettingsPanel account={p.account} onClose={p.onClose}>
      <section className="set-sec">
        <h3>{t('setLayout')}</h3>
        <div className="set-row">
          <div>
            {t('snapShort')}
            <small>{t('snapHint')}</small>
          </div>
          <Switch on={p.snapGrid} onClick={p.toggleSnap} label={t('snapShort')} />
        </div>
        <div className="set-row">
          <div>
            {t('lockShort')}
            <small>{t('lockHint')}</small>
          </div>
          <Switch on={p.locked} onClick={p.toggleLock} label={t('lockShort')} />
        </div>
      </section>

      <section className="set-sec">
        <h3>{t('setData')}</h3>
        <small className="muted">{t('dataHint')}</small>
        <div className="set-actions">
          <button onClick={p.onExport}>
            <Icon name="download" size={18} />
            {t('exportFile')}
          </button>
          <button onClick={p.onImport}>
            <Icon name="upload" size={18} />
            {t('importFile')}
          </button>
          <button className="danger" onClick={p.onClear} disabled={p.clearDisabled}>
            <Icon name="trash" size={18} />
            {t('clearAll')}
          </button>
        </div>
      </section>
    </SettingsPanel>
  );
}
