import { useEffect, useState } from 'react';
import * as inventoryApi from '../../api/inventoryApi';

function formatNumber(n) {
  return Number(n).toLocaleString();
}

function BundleCard({ bundleType, bundleCount, noteCount, value }) {
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
        </div>
      </div>
    </div>
  );
}

export default function Inventory() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    inventoryApi
      .getInventory()
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
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
