import { useEffect, useState } from 'react';
import * as inventoryApi from '../../api/inventoryApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

function formatNumber(n) {
  return Number(n).toLocaleString();
}

function AdjustControl({ bundleType, onAdjust, busy }) {
  const [amount, setAmount] = useState('');

  const submit = (sign) => {
    const value = parseFloat(amount);
    if (!value || value <= 0) return;
    onAdjust(bundleType, sign * value);
    setAmount('');
  };

  return (
    <div className="mt-3 pt-3 border-top">
      <label className="form-label small text-body-secondary mb-1">Adjust stock</label>
      <div className="d-flex gap-2">
        <input
          type="number"
          className="form-control form-control-sm"
          min="0"
          step="0.5"
          placeholder="Qty"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="btn btn-sm btn-outline-success text-nowrap"
          onClick={() => submit(1)}
          disabled={busy}
        >
          + Add
        </button>
        <button
          type="button"
          className="btn btn-sm btn-outline-danger text-nowrap"
          onClick={() => submit(-1)}
          disabled={busy}
        >
          − Remove
        </button>
      </div>
    </div>
  );
}

function BundleCard({ bundleType, bundleCount, noteCount, value, isAdmin, onAdjust, busy }) {
  return (
    <div className="col-12 col-md-4">
      <div className="card shadow-sm h-100">
        <div className="card-body">
          <p className="section-label mb-3">Rs. {bundleType} Bundles</p>
          <p className="display-6 mb-0">{formatNumber(bundleCount)}</p>
          <p className="text-muted small mb-3">bundles</p>
          <div className="d-flex justify-content-between align-items-center py-2 border-top">
            <span className="text-body-secondary">Notes</span>
            <span>{formatNumber(noteCount)}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center py-2 border-top">
            <span className="text-body-secondary">Value</span>
            <span className="fw-semibold">Rs. {formatNumber(value)}</span>
          </div>
          {isAdmin && <AdjustControl bundleType={bundleType} onAdjust={onAdjust} busy={busy} />}
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const { isAdmin } = useAuth();
  const { showToast } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adjustingType, setAdjustingType] = useState(null);

  const loadInventory = () => inventoryApi.getInventory().then(setSnapshot);

  useEffect(() => {
    let cancelled = false;
    loadInventory()
      .catch(() => {
        if (!cancelled) setError('Could not load inventory.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAdjust = async (bundleType, delta) => {
    setAdjustingType(bundleType);
    try {
      await inventoryApi.adjustInventory(bundleType, delta);
      await loadInventory();
      showToast(
        `Rs. ${bundleType} stock ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} bundle(s).`,
        'success'
      );
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Could not adjust inventory.', 'error');
    } finally {
      setAdjustingType(null);
    }
  };

  return (
    <div>
      <h1 className="h4 mb-4">Inventory</h1>

      {loading && (
        <div className="text-center text-muted py-5">
          <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Loading inventory...
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {snapshot && (
        <>
          <div className="row g-3 mb-3">
            {snapshot.bundles.map((b) => (
              <BundleCard
                key={b.bundle_type}
                bundleType={b.bundle_type}
                bundleCount={b.bundle_count}
                noteCount={b.note_count}
                value={b.value}
                isAdmin={isAdmin}
                onAdjust={handleAdjust}
                busy={adjustingType === b.bundle_type}
              />
            ))}
          </div>

          <div className="card shadow-sm">
            <div className="card-body">
              <p className="section-label mb-3">Total</p>
              <div className="row text-center">
                <div className="col-4">
                  <p className="h4 mb-0">{formatNumber(snapshot.totals.bundle_count)}</p>
                  <p className="text-muted small mb-0">bundles</p>
                </div>
                <div className="col-4">
                  <p className="h4 mb-0">{formatNumber(snapshot.totals.note_count)}</p>
                  <p className="text-muted small mb-0">notes</p>
                </div>
                <div className="col-4">
                  <p className="h4 mb-0">Rs. {formatNumber(snapshot.totals.value)}</p>
                  <p className="text-muted small mb-0">total value</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
