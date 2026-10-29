import type { ReactNode, RefObject } from 'react';
import type { Key } from '@/lib/i18n';
import { IconButton } from '../Icon';

export type EditorView = 'hall' | 'tables';

type Props = {
  t: (k: Key) => string;
  leading?: ReactNode;
  view: EditorView;
  onView: (v: EditorView) => void;
  tableCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSettings: () => void;
  fileRef: RefObject<HTMLInputElement | null>;
  onImportFile: (file: File) => void;
};

/** Top bar: title, the table sizes toggle, undo and redo, settings. */
export function EditorHeader(p: Props) {
  const { t } = p;
  return (
    <header className="bar">
      {p.leading ?? <h1>{t('appTitle')}</h1>}
      <div className="bar-actions">
        <IconButton
          icon="ruler"
          label={t('tabTables')}
          pressed={p.view === 'tables'}
          count={p.tableCount}
          onClick={() => p.onView(p.view === 'tables' ? 'hall' : 'tables')}
        />
        <span className="sep" aria-hidden />
        <IconButton icon="undo" label={`${t('undo')} (Ctrl+Z)`} onClick={p.onUndo} disabled={!p.canUndo} />
        <IconButton icon="redo" label={`${t('redo')} (Ctrl+Y)`} onClick={p.onRedo} disabled={!p.canRedo} />
        <span className="sep" aria-hidden />
        <IconButton icon="settings" label={t('appSettings')} onClick={p.onSettings} />
        <input
          ref={p.fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImportFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
