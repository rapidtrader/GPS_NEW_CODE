import { useCallback, useEffect, useMemo, useState } from 'react';

const GREEN = '#2E7D32';
const ORANGE = '#E65100';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function rangeToTimestamp(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  return { startTime: start.getTime(), endTime: end.getTime() };
}

function CalendarIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0121 8.25v11.25A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V8.25A1.5 1.5 0 014.5 6.75z" />
    </svg>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[0.7rem] font-medium text-gray-500">{label}</span>
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-9 text-sm font-medium text-gray-900 outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          <CalendarIcon />
        </span>
      </div>
    </label>
  );
}

function DistanceBarChart({ reports, loading }) {
  // Sort by total distance (descending) and take top 10
  const sortedReports = useMemo(() => {
    if (!reports || reports.length === 0) return [];
    return [...reports]
      .sort((a, b) => (Number(b.totalDistance) || 0) - (Number(a.totalDistance) || 0))
      .slice(0, 10);
  }, [reports]);

  const maxDistance = useMemo(() => {
    if (sortedReports.length === 0) return 1;
    return Math.max(...sortedReports.map(r => Number(r.totalDistance) || 0));
  }, [sortedReports]);

  if (loading || sortedReports.length === 0) return null;

  return (
    <div className="rounded-2xl bg-black p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 text-sm font-bold text-white">Total Distance Covered by Each Vehicle in KM</h3>
      <div className="space-y-3">
        {sortedReports.map((report, index) => {
          const distance = Number(report.totalDistance) || 0;
          const percentage = maxDistance > 0 ? (distance / maxDistance) * 100 : 0;
          
          return (
            <div key={report._id || index} className="flex items-center gap-3">
              <div className="w-16 flex-shrink-0">
                <p className="text-xs font-bold text-gray-400">{report.vehicleNo}</p>
              </div>
              <div className="flex-1">
                <div className="relative h-6 overflow-hidden rounded bg-gray-800">
                  <div
                    className="h-full rounded transition-all duration-300"
                    style={{
                      width: `${percentage}%`,
                      backgroundColor: percentage > 50 ? '#2E7D32' : '#E65100',
                    }}
                  />
                </div>
              </div>
              <div className="w-12 flex-shrink-0 text-right">
                <p className="text-xs font-bold text-white">{distance.toFixed(0)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-center text-xs text-gray-400">
        Covered
      </div>
    </div>
  );
}

export default function DistanceReport() {
  const defaults = useMemo(() => todayRange(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate: fromDate,
        endDate: toDate,
      });

      const response = await fetch(`/api/distance-reports?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (!response.ok || data.status === 'ERROR') {
        throw new Error(data.message || 'Failed to fetch reports');
      }

      setReports(data.data || []);
    } catch (err) {
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const syncReports = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const { startTime, endTime } = rangeToTimestamp(fromDate, toDate);

      const response = await fetch('/api/distance-reports/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ startTime, endTime }),
      });

      const data = await response.json();
      if (!response.ok || data.status === 'ERROR') {
        throw new Error(data.message || 'Failed to sync reports');
      }

      // Refresh reports after sync
      await fetchReports();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [fromDate, toDate, fetchReports]);

  useEffect(() => {
    fetchReports();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- load on mount

  function handleApply(e) {
    e.preventDefault();
    fetchReports();
  }

  // Calculate totals
  const totals = reports.reduce(
    (acc, report) => {
      acc.totalDistance += Number(report.totalDistance) || 0;
      acc.vehicleCount += 1;
      return acc;
    },
    { totalDistance: 0, vehicleCount: 0 }
  );

  return (
    <div className="-m-4 min-h-full bg-[#f3f4f6] p-3 sm:-m-6 sm:p-5">
      <div className="mx-auto max-w-6xl space-y-3 lg:max-w-7xl">
        <form onSubmit={handleApply} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <DateField label="From Date" value={fromDate} onChange={setFromDate} />
            <DateField label="To Date" value={toDate} onChange={setToDate} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncReports}
              disabled={syncing}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-60"
              style={{ backgroundColor: ORANGE }}
            >
              <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992M4.45 16.023A8.25 8.25 0 1119.55 7.977" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Fresh'}
            </button>
          </div>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5" style={{ color: GREEN }}>
              <span className="text-[0.65rem] font-medium">Total Distance</span>
            </div>
            <p className="text-lg font-bold" style={{ color: GREEN }}>
              {loading ? '—' : `${totals.totalDistance.toFixed(1)} km`}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5" style={{ color: GREEN }}>
              <span className="text-[0.65rem] font-medium">Vehicles</span>
            </div>
            <p className="text-lg font-bold" style={{ color: GREEN }}>
              {loading ? '—' : totals.vehicleCount}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5" style={{ color: ORANGE }}>
              <span className="text-[0.65rem] font-medium">Avg Distance</span>
            </div>
            <p className="text-lg font-bold" style={{ color: ORANGE }}>
              {loading ? '—' : totals.vehicleCount > 0 ? `${(totals.totalDistance / totals.vehicleCount).toFixed(1)} km` : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-gray-500">
              <span className="text-[0.65rem] font-medium">Date Range</span>
            </div>
            <p className="text-xs font-bold text-gray-900">
              {loading ? '—' : `${fromDate} to ${toDate}`}
            </p>
          </div>
        </div>

        {/* Bar Chart */}
        <DistanceBarChart reports={reports} loading={loading} />

        {loading && reports.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">Loading distance reports...</div>
        ) : reports.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">
            No distance reports found for this date range.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-purple-900 text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Vehicle</th>
                    <th className="px-4 py-3 font-semibold">Vehicle Alias</th>
                    {/* Dynamic date headers */}
                    {Array.from(
                      new Set(
                        reports.flatMap((r) =>
                          r.dayWiseData?.map((d) => d.date) || []
                        )
                      )
                    )
                      .sort()
                      .map((date) => (
                        <th key={date} className="px-4 py-3 text-center font-semibold">
                          {date}
                        </th>
                      ))}
                    <th className="px-4 py-3 text-right font-semibold">Total Distance</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, i) => {
                    const dates = Array.from(
                      new Set(
                        reports.flatMap((r) =>
                          r.dayWiseData?.map((d) => d.date) || []
                        )
                      )
                    ).sort();

                    return (
                      <tr
                        key={report._id || i}
                        className={`${i % 2 ? 'bg-purple-50' : 'bg-white'} border-b border-gray-200`}
                      >
                        <td className="px-4 py-3 font-bold text-gray-900">{report.vehicleNo}</td>
                        <td className="px-4 py-3 text-gray-600">{report.vehicleAlias || '-'}</td>
                        {dates.map((date) => {
                          const dayData = report.dayWiseData?.find((d) => d.date === date);
                          const distance = dayData?.distance || 0;
                          return (
                            <td
                              key={date}
                              className="px-4 py-3 text-center font-semibold text-gray-900"
                            >
                              {distance}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {report.totalDistance?.toFixed(0) || '0'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="border-t-2 border-gray-300 bg-purple-900 font-bold text-white">
                    <td colSpan="2" className="px-4 py-3">
                      Total
                    </td>
                    {Array.from(
                      new Set(
                        reports.flatMap((r) =>
                          r.dayWiseData?.map((d) => d.date) || []
                        )
                      )
                    )
                      .sort()
                      .map((date) => {
                        const dayTotal = reports.reduce((sum, r) => {
                          const dayData = r.dayWiseData?.find((d) => d.date === date);
                          return sum + (dayData?.distance || 0);
                        }, 0);
                        return (
                          <td key={date} className="px-4 py-3 text-center">
                            {dayTotal}
                          </td>
                        );
                      })}
                    <td className="px-4 py-3 text-right">
                      {totals.totalDistance.toFixed(0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
