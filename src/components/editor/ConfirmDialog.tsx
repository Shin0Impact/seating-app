type Props = {
  label: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ label, text, confirmLabel, cancelLabel, onConfirm, onCancel }: Props) {
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
          <button className="primary danger-fill" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
          <button onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </>
  );
}
