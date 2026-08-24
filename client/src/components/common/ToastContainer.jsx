import { useToast } from '../../context/ToastContext';

const VARIANT_CLASSES = {
  success: 'text-bg-success',
  error: 'text-bg-danger',
};

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container position-fixed bottom-0 end-0 p-3" style={{ zIndex: 1080 }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast show align-items-center border-0 mb-2 ${VARIANT_CLASSES[toast.variant] || VARIANT_CLASSES.success}`}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
        >
          <div className="d-flex">
            <div className="toast-body">{toast.message}</div>
            <button
              type="button"
              className="btn-close btn-close-white me-2 m-auto"
              aria-label="Close"
              onClick={() => dismissToast(toast.id)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
