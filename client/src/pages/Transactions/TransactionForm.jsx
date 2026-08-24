import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ShopAutocomplete } from '../../components/shops/ShopAutocomplete';
import * as transactionsApi from '../../api/transactionsApi';
import { useToast } from '../../context/ToastContext';
import {
  calculateBundleValue,
  calculateCommissionRate,
  calculateProfit,
  calculateAmountCollected,
} from '../../utils/businessLogic';

function todayLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const INITIAL_BUNDLES = { bundles_10: 0, bundles_50: 0, bundles_100: 0 };

function BundleField({ label, value, onChange }) {
  return (
    <div className="col-4">
      <label className="form-label small">{label}</label>
      <input
        type="number"
        className="form-control"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
      />
    </div>
  );
}

function PreviewRow({ label, value, emphasize }) {
  return (
    <div className={`d-flex justify-content-between align-items-center py-2 border-top ${emphasize ? 'fw-semibold' : ''}`}>
      <span className="text-body-secondary">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function TransactionForm() {
  const { id } = useParams();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [shop, setShop] = useState(null);
  const [date, setDate] = useState(todayLocalDate());
  const [bundles, setBundles] = useState(INITIAL_BUNDLES);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Bumped on every reset to force ShopAutocomplete to remount rather than
  // just receive a new `value` prop - its internal text input is otherwise
  // uncontrolled-ish (initialized once from `value`, then user-typed), so a
  // prop-only reset would leave the visible text stuck on the old shop name.
  const [formKey, setFormKey] = useState(0);

  const [loadingExisting, setLoadingExisting] = useState(isEditMode);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    setLoadingExisting(true);
    transactionsApi
      .getTransaction(id)
      .then((tx) => {
        if (cancelled) return;
        setShop({ id: tx.shop_id, shop_name: tx.shop_name });
        setDate(tx.transaction_date);
        setBundles({ bundles_10: tx.bundles_10, bundles_50: tx.bundles_50, bundles_100: tx.bundles_100 });
        setFormKey((k) => k + 1); // ensure ShopAutocomplete mounts with the loaded shop already set
      })
      .catch(() => {
        if (!cancelled) setLoadError('Could not load this transaction. It may not exist.');
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEditMode]);

  const changeValue = calculateBundleValue(bundles);
  const commissionRate = calculateCommissionRate(bundles);
  const profit = calculateProfit(changeValue, commissionRate);
  const amountCollected = calculateAmountCollected(changeValue, profit);
  const hasAnyBundles = bundles.bundles_10 > 0 || bundles.bundles_50 > 0 || bundles.bundles_100 > 0;

  const setBundle = (key, value) => setBundles((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setShop(null);
    setDate(todayLocalDate());
    setBundles(INITIAL_BUNDLES);
    setFormKey((k) => k + 1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!shop) {
      setError('Please select or create a shop.');
      return;
    }
    if (!hasAnyBundles) {
      setError('Select at least one bundle.');
      return;
    }

    const payload = { shop_id: shop.id, transaction_date: date, ...bundles };

    setSubmitting(true);
    try {
      if (isEditMode) {
        const updated = await transactionsApi.updateTransaction(id, payload);
        showToast(
          `Transaction updated: ${updated.shop_name} — Rs. ${Number(updated.amount_collected).toLocaleString()} collected.`,
          'success'
        );
        navigate('/transactions');
      } else {
        const created = await transactionsApi.createTransaction(payload);
        showToast(
          `Transaction saved: ${created.shop_name} — Rs. ${Number(created.amount_collected).toLocaleString()} collected.`,
          'success'
        );
        resetForm();
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not save transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingExisting) {
    return (
      <div className="text-center text-muted py-5">
        <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
        Loading transaction...
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">{isEditMode ? 'Edit Transaction' : 'New Transaction'}</h1>
        <Link to="/transactions" className="btn btn-outline-secondary btn-sm">
          Back to History
        </Link>
      </div>

      {loadError ? (
        <div className="alert alert-danger" role="alert">
          {loadError}
        </div>
      ) : (
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <div className="card shadow-sm">
              <div className="card-body">
                {error && (
                  <div className="alert alert-danger py-2" role="alert">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                  <div className="mb-3">
                    <ShopAutocomplete key={formKey} value={shop} onChange={setShop} />
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Transaction Date</label>
                    <input
                      type="date"
                      className="form-control"
                      value={date}
                      max={todayLocalDate()}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>

                  <label className="form-label">Bundles</label>
                  <div className="row g-2 mb-4">
                    <BundleField
                      label="Rs. 10"
                      value={bundles.bundles_10}
                      onChange={(v) => setBundle('bundles_10', v)}
                    />
                    <BundleField
                      label="Rs. 50"
                      value={bundles.bundles_50}
                      onChange={(v) => setBundle('bundles_50', v)}
                    />
                    <BundleField
                      label="Rs. 100"
                      value={bundles.bundles_100}
                      onChange={(v) => setBundle('bundles_100', v)}
                    />
                  </div>

                  <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
                        Saving...
                      </>
                    ) : isEditMode ? (
                      'Save Changes'
                    ) : (
                      'Save Transaction'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="card shadow-sm">
              <div className="card-body">
                <p className="section-label mb-3">Preview</p>
                <PreviewRow label="Change Value" value={`Rs. ${changeValue.toLocaleString()}`} />
                <PreviewRow label="Commission" value={`${(commissionRate * 100).toFixed(2)}%`} />
                <PreviewRow label="Profit" value={`Rs. ${profit.toLocaleString()}`} />
                <PreviewRow label="Amount Collected" value={`Rs. ${amountCollected.toLocaleString()}`} emphasize />
                <p className="text-muted small mt-3 mb-0">
                  This preview is calculated locally for convenience. The saved values are always calculated and
                  verified by the server.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
