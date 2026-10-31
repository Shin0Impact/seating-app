type Props = {
  label: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
};

export function ConfirmDialog({ label, text, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true }: Props) {
  return (
    <>
      <div className="picker-backdrop" onMouseDown={onCancel} />
      <div
        className="import-dialog confirm"
        role="alertdialog"
        aria-label={label}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <p>{text}</p>
        <div className="row">
          <button className={danger ? 'primary danger-fill' : 'primary'} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </>
  );
}
