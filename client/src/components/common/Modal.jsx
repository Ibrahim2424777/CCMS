// Rendered with Bootstrap's modal CSS classes directly rather than its JS
// bundle (which isn't loaded - this project uses plain Bootstrap CSS, not
// react-bootstrap, per ARCHITECTURE.md section 20).
export function Modal({ show, title, onClose, children, footer }) {
  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop show" style={{ zIndex: 1050 }} />
      <div className="modal d-block" tabIndex="-1" role="dialog" style={{ zIndex: 1055 }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-footer">{footer}</div>}
          </div>
        </div>
      </div>
    </>
  );
}
