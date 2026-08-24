import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as transactionsApi from '../../api/transactionsApi';
import * as shopsApi from '../../api/shopsApi';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Modal } from '../../components/common/Modal';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date (Newest First)' },
  { value: 'date_asc', label: 'Date (Oldest First)' },
  { value: 'amount_desc', label: 'Amount (High to Low)' },
  { value: 'amount_asc', label: 'Amount (Low to High)' },
];

const PAGE_SIZE = 10;

function formatMoney(n) {
  return `Rs. ${Number(n).toLocaleString()}`;
}

// transaction_date arrives as a plain 'YYYY-MM-DD' string (see server/src/config/db.js).
function formatDate(isoDateString) {
  if (!isoDateString) return '';
  const [y, m, d] = isoDateString.split('-');
  return `${d}/${m}/${y}`;
}

function formatPercent(rate) {
  return `${(Number(rate) * 100).toFixed(2)}%`;
}

export default function TransactionHistory() {
  const { showToast } = useToast();

  const [shops, setShops] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [shopId, setShopId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [viewing, setViewing] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, shopId, dateFrom, dateTo, sort]);

  useEffect(() => {
    shopsApi.listShops().then(setShops).catch(() => {});
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await transactionsApi.listTransactions({
        search: debouncedSearch || undefined,
        shop_id: shopId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      });
      setRows(result.data);
      setPagination(result.pagination);
    } catch {
      setError('Could not load transactions.');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, shopId, dateFrom, dateTo, sort, page]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleView = async (id) => {
    setViewing({});
    setViewLoading(true);
    try {
      setViewing(await transactionsApi.getTransaction(id));
    } catch {
      showToast('Could not load transaction details.', 'error');
      setViewing(null);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await transactionsApi.deleteTransaction(deleteTarget.id);
      showToast(`Transaction for ${deleteTarget.shop_name} deleted.`, 'success');
      setDeleteTarget(null);
      await loadTransactions();
    } catch (err) {
      showToast(err.response?.data?.error?.message || 'Could not delete transaction.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setShopId('');
    setDateFrom('');
    setDateTo('');
    setSort('date_desc');
  };

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-4">
        <h1 className="h4 mb-0">Transaction History</h1>
        <Link to="/transactions/new" className="btn btn-primary btn-sm">
          + New Transaction
        </Link>
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label small">Search</label>
              <input
                className="form-control"
                placeholder="Search by shop..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">Shop</label>
              <select className="form-select" value={shopId} onChange={(e) => setShopId(e.target.value)}>
                <option value="">All shops</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.shop_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">From</label>
              <input
                type="date"
                className="form-control"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">To</label>
              <input type="date" className="form-control" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">Sort</label>
              <select className="form-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-1">
              <button type="button" className="btn btn-outline-secondary w-100" onClick={clearFilters}>
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body p-0">
          {error && (
            <div className="alert alert-danger m-3 mb-0" role="alert">
              {error}
            </div>
          )}

          {loading ? (
            <div className="p-4 text-center text-muted">
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading transactions...
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-center text-muted">No transactions match these filters.</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Shop</th>
                    <th className="text-end table-hide-sm">Rs. 10</th>
                    <th className="text-end table-hide-sm">Rs. 50</th>
                    <th className="text-end table-hide-sm">Rs. 100</th>
                    <th className="text-end table-hide-sm">Change Value</th>
                    <th className="text-end table-hide-sm">Commission</th>
                    <th className="text-end table-hide-sm">Profit</th>
                    <th className="text-end">Amount Collected</th>
                    <th className="table-hide-sm">Created By</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td className="text-nowrap">{formatDate(t.transaction_date)}</td>
                      <td>{t.shop_name}</td>
                      <td className="text-end table-hide-sm">{t.bundles_10}</td>
                      <td className="text-end table-hide-sm">{t.bundles_50}</td>
                      <td className="text-end table-hide-sm">{t.bundles_100}</td>
                      <td className="text-end text-nowrap table-hide-sm">{formatMoney(t.total_change_value)}</td>
                      <td className="text-end table-hide-sm">{formatPercent(t.commission_rate)}</td>
                      <td className="text-end text-nowrap table-hide-sm">{formatMoney(t.profit)}</td>
                      <td className="text-end text-nowrap fw-semibold">{formatMoney(t.amount_collected)}</td>
                      <td className="table-hide-sm">{t.created_by_name}</td>
                      <td className="text-nowrap">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary me-1"
                          onClick={() => handleView(t.id)}
                        >
                          View
                        </button>
                        <Link to={`/transactions/${t.id}/edit`} className="btn btn-sm btn-outline-primary me-1">
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleteTarget(t)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {pagination.totalPages > 0 && (
          <div className="card-footer d-flex flex-wrap gap-2 justify-content-between align-items-center bg-white">
            <span className="text-muted small">
              Page {pagination.page} of {pagination.totalPages} &middot; {pagination.total} total
            </span>
            <div className="btn-group">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        show={Boolean(viewing)}
        title="Transaction Detail"
        onClose={() => setViewing(null)}
        footer={
          <button type="button" className="btn btn-outline-secondary" onClick={() => setViewing(null)}>
            Close
          </button>
        }
      >
        {viewLoading || !viewing ? (
          <p className="text-muted mb-0">Loading...</p>
        ) : (
          <dl className="row mb-0">
            <dt className="col-5">Shop</dt>
            <dd className="col-7">{viewing.shop_name}</dd>
            <dt className="col-5">Date</dt>
            <dd className="col-7">{formatDate(viewing.transaction_date)}</dd>
            <dt className="col-5">Rs. 10 bundles</dt>
            <dd className="col-7">{viewing.bundles_10}</dd>
            <dt className="col-5">Rs. 50 bundles</dt>
            <dd className="col-7">{viewing.bundles_50}</dd>
            <dt className="col-5">Rs. 100 bundles</dt>
            <dd className="col-7">{viewing.bundles_100}</dd>
            <dt className="col-5">Change Value</dt>
            <dd className="col-7">{formatMoney(viewing.total_change_value)}</dd>
            <dt className="col-5">Commission</dt>
            <dd className="col-7">{formatPercent(viewing.commission_rate)}</dd>
            <dt className="col-5">Profit</dt>
            <dd className="col-7">{formatMoney(viewing.profit)}</dd>
            <dt className="col-5">Amount Collected</dt>
            <dd className="col-7 fw-semibold">{formatMoney(viewing.amount_collected)}</dd>
            <dt className="col-5">Created By</dt>
            <dd className="col-7">{viewing.created_by_name}</dd>
            <dt className="col-5">Status</dt>
            <dd className="col-7">
              <span className={`badge ${viewing.status === 'ACTIVE' ? 'bg-success' : 'bg-secondary'}`}>
                {viewing.status}
              </span>
            </dd>
          </dl>
        )}
      </Modal>

      <ConfirmDialog
        show={Boolean(deleteTarget)}
        title="Delete Transaction"
        message={
          deleteTarget
            ? `Delete the transaction for ${deleteTarget.shop_name} on ${formatDate(deleteTarget.transaction_date)} (${formatMoney(
                deleteTarget.amount_collected
              )})? This will restore its bundles to inventory. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        confirming={deleting}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
