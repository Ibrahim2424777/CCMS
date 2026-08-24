import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import * as analyticsApi from '../../api/analyticsApi';

// Single-hue blue (validated for chart use, dataviz skill palette) - every
// chart on this page plots one measure at a time, so a second categorical
// hue is never needed; identity comes from the axis labels + card title.
const CHART_COLOR = '#2a78d6';
const GRID_COLOR = '#e1e0d9';
const AXIS_COLOR = '#c3c2b7';
const TICK_STYLE = { fill: '#898781', fontSize: 12 };

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'custom', label: 'Custom Range' },
];

function formatMoney(n) {
  return `Rs. ${Number(n).toLocaleString()}`;
}

function todayLocalDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// period/date values arrive as plain 'YYYY-MM-DD' strings (see server/src/config/db.js).
function formatDate(isoDateString) {
  if (!isoDateString) return '';
  const [y, m, d] = isoDateString.split('-');
  return `${d}/${m}/${y}`;
}

function formatPeriodTick(isoDateString, groupBy) {
  const [y, m, d] = isoDateString.split('-');
  if (groupBy === 'month') {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[Number(m) - 1]} ${y}`;
  }
  return `${d}/${m}`;
}

function StatTile({ label, value }) {
  return (
    <div className="col-6 col-md-4 col-lg-2">
      <div className="card shadow-sm h-100">
        <div className="card-body text-center">
          <p className="h5 mb-1">{value}</p>
          <p className="text-muted small mb-0">{label}</p>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="col-12 col-lg-6">
      <div className="card shadow-sm h-100">
        <div className="card-body">
          <p className="section-label mb-3">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="text-muted small text-center py-5">No data in this range.</div>;
}

export default function Analytics() {
  const [range, setRange] = useState('last7days');
  const [customFrom, setCustomFrom] = useState(todayLocalDate());
  const [customTo, setCustomTo] = useState(todayLocalDate());

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) {
      return; // wait for a valid custom range before fetching
    }

    let cancelled = false;
    setLoading(true);
    setError('');

    const params = range === 'custom' ? { range, from: customFrom, to: customTo } : { range };

    analyticsApi
      .getSummary(params)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load analytics for this range.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [range, customFrom, customTo]);

  const hasTrendData = summary?.trend.points.some((p) => p.profit !== 0 || p.change !== 0);
  const hasBundleData = summary?.bundleDistribution.some((b) => b.count > 0);
  const hasTopShops = summary?.topShops.length > 0;

  return (
    <div>
      <h1 className="h4 mb-4">Analytics</h1>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex flex-wrap gap-2" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`btn btn-sm ${range === opt.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="row g-2 mt-3">
              <div className="col-auto">
                <label className="form-label small mb-1">From</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div className="col-auto">
                <label className="form-label small mb-1">To</label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={customTo}
                  min={customFrom}
                  max={todayLocalDate()}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          )}

          {summary && (
            <p className="text-muted small mt-3 mb-0">
              Showing {formatDate(summary.range.from)} &ndash; {formatDate(summary.range.to)}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="text-center text-muted py-5">
          <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
          Loading analytics...
        </div>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {summary && !loading && (
        <>
          <div className="row g-3 mb-4">
            <StatTile label="Transactions" value={summary.totals.transactions.toLocaleString()} />
            <StatTile label="Unique Shops" value={summary.totals.uniqueShops.toLocaleString()} />
            <StatTile label="Total Change" value={formatMoney(summary.totals.totalChange)} />
            <StatTile label="Total Profit" value={formatMoney(summary.totals.totalProfit)} />
            <StatTile label="Avg. Transaction" value={formatMoney(summary.totals.avgTransaction)} />
            <StatTile label="Avg. Profit" value={formatMoney(summary.totals.avgProfit)} />
          </div>

          <div className="row g-3">
            <ChartCard title="Profit Over Time">
              {hasTrendData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={summary.trend.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(v) => formatPeriodTick(v, summary.trend.groupBy)}
                      tick={TICK_STYLE}
                      axisLine={{ stroke: AXIS_COLOR }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `Rs.${Number(v).toLocaleString()}`}
                      tick={TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip formatter={(value) => [formatMoney(value), 'Profit']} labelFormatter={formatDate} />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      stroke={CHART_COLOR}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLOR, strokeWidth: 2, stroke: '#fcfcfb' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Change Provided Over Time">
              {hasTrendData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={summary.trend.points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(v) => formatPeriodTick(v, summary.trend.groupBy)}
                      tick={TICK_STYLE}
                      axisLine={{ stroke: AXIS_COLOR }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => `Rs.${Number(v).toLocaleString()}`}
                      tick={TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={70}
                    />
                    <Tooltip formatter={(value) => [formatMoney(value), 'Change Provided']} labelFormatter={formatDate} />
                    <Bar dataKey="change" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Bundle Distribution">
              {hasBundleData ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={summary.bundleDistribution.map((b) => ({ ...b, label: `Rs. ${b.bundleType}` }))}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                    <XAxis dataKey="label" tick={TICK_STYLE} axisLine={{ stroke: AXIS_COLOR }} tickLine={false} />
                    <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false} width={50} allowDecimals={false} />
                    <Tooltip
                      formatter={(value, name) => [value.toLocaleString(), name === 'count' ? 'Bundles' : name]}
                    />
                    <Bar dataKey="count" name="Bundles" fill={CHART_COLOR} radius={[4, 4, 0, 0]} maxBarSize={64} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="Top Shops">
              {hasTopShops ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={summary.topShops}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
                    <XAxis type="number" tick={TICK_STYLE} axisLine={{ stroke: AXIS_COLOR }} tickLine={false} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="shopName"
                      tick={TICK_STYLE}
                      axisLine={false}
                      tickLine={false}
                      width={110}
                    />
                    <Tooltip formatter={(value) => [value.toLocaleString(), 'Transactions']} />
                    <Bar dataKey="transactions" fill={CHART_COLOR} radius={[0, 4, 4, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}
