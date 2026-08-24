import { Modal } from './Modal';

export function ConfirmDialog({
  show,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
  confirming = false,
}) {
  return (
    <Modal
      show={show}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn btn-${variant}`} onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Please wait...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="mb-0">{message}</p>
    </Modal>
  );
}
