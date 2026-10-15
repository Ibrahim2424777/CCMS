import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as analyticsApi from '../../api/analyticsApi';
import { useAuth } from '../../context/AuthContext';

// Currency-ink green, validated as a single-series chart color on the card
// surface (dataviz validator); grid/axis/ticks use the ledger-paper rules.
const TREND_LINE_COLOR = '#13805a';
const TICK_STYLE = { fill: '#736a55', fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' };
const TOOLTIP_STYLE = { fontSize: 13, background: '#fffdf8', border: '1px solid #cdbd9a', borderRadius: 6 };

function formatMoney(n) {
  return `Rs. ${Number(n).toLocaleString()}`;
}

// transaction_date / profitTrend dates arrive as plain 'YYYY-MM-DD' strings
// (see server/src/config/db.js's DATE type-parser fix).
function formatDate(isoDateString) {
  if (!isoDateString) return '';
  const [y, m, d] = isoDateString.split('-');
  return `${d}/${m}/${y}`;
}

function formatShortDate(isoDateString) {
  const [, m, d] = isoDateString.split('-');
  return `${d}/${m}`;
}

function PeriodCard({ title, change, profit, transactions, shops }) {
  return (
    <div className="col-12 col-sm-6 col-lg-4">
      <div className="card shadow-sm h-100">
        <div className="card-body">
          <p className="section-label mb-3">{title}</p>
          <div className="d-flex justify-content-between align-items-center py-2 border-top">
            <span className="text-body-secondary">Total Change</span>
            <span className="fw-semibold">{formatMoney(change)}</span>
          </div>
          <div className="d-flex justify-content-between align-items-center py-2 border-top">
            <span className="text-body-secondary">Profit</span>
            <span className="fw-semibold text-success">{formatMoney(profit)}</span>
          </div>
          <div className={`d-flex justify-content-between align-items-center py-2 border-top ${shops === undefined ? 'border-bottom' : ''}`}>
            <span className="text-body-secondary">Transactions</span>
            <span>{transactions}</span>
          </div>
          {shops !== undefined && (
            <div className="d-flex justify-content-between align-items-center py-2 border-top border-bottom">
              <span className="text-body-secondary">Shops Served</span>
              <span>{shops}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InventorySummary({ inventory }) {
  const byType = Object.fromEntries(inventory.bundles.map((b) => [b.bundle_type, b.bundle_count]));
  return (
    <div className="card shadow-sm mb-4">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <p className="section-label mb-0">Inventory</p>
          <Link to="/inventory" className="small">
            View Details
          </Link>
        </div>
        <div className="row gy-3 text-center">
          {[10, 50, 100].map((type) => (
            <div key={type} className={`col-6 col-md-3 denom-${type}`}>
              <p className="h5 mb-0">{byType[type] ?? 0}</p>
              <p className="text-muted small mb-0">
                <span className="denom-dot" aria-hidden="true" />
                Rs.{type} bundles
              </p>
            </div>
          ))}
          <div className="col-6 col-md-3">
            <p className="h5 mb-0">{formatMoney(inventory.totals.value)}</p>
            <p className="text-muted small mb-0">Total Value</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentTransactions({ transactions }) {
  return (
    <div className="card shadow-sm mb-4 mb-lg-0 h-100">
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <p className="section-label mb-0">Recent Transactions</p>
          <Link to="/transactions" className="small">
            View All
          </Link>
        </div>
        {transactions.length === 0 ? (
          <p className="text-muted mb-0">No transactions yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm mb-0 align-middle">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shop</th>
                  <th className="text-end">Amount Collected</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="text-nowrap">{formatDate(t.transaction_date)}</td>
                    <td>{t.shop_name}</td>
                    <td className="text-end text-nowrap">{formatMoney(t.amount_collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfitTrendChart({ data }) {
  return (
    <div className="card shadow-sm h-100">
      <div className="card-body">
        <p className="section-label mb-3">Profit Trend &mdash; Last 7 Days</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4d9c1" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatShortDate}
              tick={TICK_STYLE}
              axisLine={{ stroke: '#cdbd9a' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => `Rs.${Number(v).toLocaleString()}`}
              tick={TICK_STYLE}
              axisLine={false}
              tickLine={false}
              width={70}
            />
            <Tooltip
              formatter={(value) => [formatMoney(value), 'Profit']}
              labelFormatter={(label) => formatDate(label)}
              contentStyle={TOOLTIP_STYLE}
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke={TREND_LINE_COLOR}
              strokeWidth={2}
              dot={{ r: 4, fill: TREND_LINE_COLOR, strokeWidth: 2, stroke: '#fffdf8' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    analyticsApi
      .getDashboard()
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the dashboard.');
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
      <h1 className="h4 mb-1">Welcome, {user?.name}</h1>
      <p className="text-muted mb-4">How is the business doing?</p>

      {loading && (
        <div className="text-center text-muted py-5">
          <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Loading dashboard...
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {dashboard && (
        <>
          <div className="row g-3 mb-1">
            <PeriodCard title="Today" {...dashboard.today} />
            <PeriodCard title="This Week" {...dashboard.week} />
            <PeriodCard title="This Month" {...dashboard.month} />
          </div>

          <div className="my-4" />

          <InventorySummary inventory={dashboard.inventory} />

          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <RecentTransactions transactions={dashboard.recentTransactions} />
            </div>
            <div className="col-12 col-lg-6">
              <ProfitTrendChart data={dashboard.profitTrend} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
