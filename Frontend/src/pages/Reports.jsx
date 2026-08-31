import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchReports } from '../api';
import { ROUTES } from '../routes/paths';
import {
  formatComparison,
  formatDistance,
  formatDuration,
  formatRangeLabel,
  mapRankItems,
  mergeRankLists,
} from '../utils/analyticsUtils';
import { PURPLE } from '../utils/vehicleUtils';

const REPORT_TYPES = [
  {
    id: 'distance',
    label: 'Distance Report',
    desc: 'Total km travelled by vehicle',
    metric: (report) => formatDistance(report?.distanceDTO?.totalDistance),
    compare: (report) => report?.distanceDTO?.distanceComparision,
    last: (report) => formatDistance(report?.distanceDTO?.lastTotalDistance),
    lastLabel: 'Last Distance',
    gradient: 'from-sky-500 to-blue-700',
  },
  {
    id: 'duration',
    label: 'Duration Report',
    desc: 'Total running duration by vehicle',
    metric: (report) => formatDuration(report?.durationDTO?.totalDuration),
    compare: (report) => report?.durationDTO?.comparision,
    last: (report) => formatDuration(report?.durationDTO?.lastDuration),
    lastLabel: 'Last Duration',
    gradient: 'from-violet-500 to-purple-700',
  },
  {
    id: 'fuelConsume',
    label: 'Fuel Consume Report',
    desc: 'Fuel consumption summary',
    metric: (report) => `${Number(report?.fuelConsumeDTO?.currentFuel || 0).toFixed(2)} L`,
    compare: (report) => report?.fuelConsumeDTO?.comparison,
    last: (report) => `${Number(report?.fuelConsumeDTO?.lastFuel || 0).toFixed(2)} L`,
    lastLabel: 'Last Fuel',
    gradient: 'from-orange-400 to-amber-600',
  },
  {
    id: 'fuelFill',
    label: 'Fuel Fill Report',
    desc: 'Fuel fill events summary',
    metric: (report) => `${Number(report?.fuelFillDTO?.currentFuel || 0).toFixed(2)} L`,
    compare: (report) => report?.fuelFillDTO?.comparison,
    last: (report) => `${Number(report?.fuelFillDTO?.lastFuel || 0).toFixed(2)} L`,
    lastLabel: 'Last Fuel Fill',
    gradient: 'from-emerald-500 to-teal-700',
  },
];

function SortIcon() {
  return (
    <span className="ml-1 inline-flex flex-col leading-none opacity-70">
      <svg className="h-2 w-2" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0l4 5H0z" /></svg>
      <svg className="h-2 w-2 -mt-0.5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z" /></svg>
    </span>
  );
}

function SummaryCard({ title, value, comparison, lastLabel, lastValue, gradient, active, onClick }) {
  const negative = Number(comparison) < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left transition ${
        active ? 'border-purple-500 shadow-md ring-2 ring-purple-200' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${gradient} px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white`}>
        Report
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="mt-3 text-3xl font-bold text-orange-500">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className={`font-semibold ${negative ? 'text-red-500' : 'text-green-600'}`}>
          {formatComparison(comparison)}
        </span>
        <span className="text-gray-500">{lastLabel}: {lastValue}</span>
      </div>
    </button>
  );
}

function ReportTable({ title, rows, valueLabel, formatValue }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-white">
            <tr>
              <th className="px-4 py-3 font-semibold text-black">SN</th>
              <th className="px-4 py-3 font-semibold text-black">
                Vehicle No.<SortIcon />
              </th>
              <th className="px-4 py-3 font-semibold text-black">
                {valueLabel}<SortIcon />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  No saved report data for this section
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={row.ouid} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-black">{row.vehicleNo}</td>
                  <td className="px-4 py-3 font-medium text-gray-700">{formatValue(row.value)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Reports() {
  const [snapshots, setSnapshots] = useState([]);
  const [vehicles, setVehicles] = useState({});
  const [report, setReport] = useState(null);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [activeReport, setActiveReport] = useState('distance');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReports = useCallback(async (snapshotId = '') => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchReports(snapshotId);
      const payload = result.data || {};
      setSnapshots(payload.snapshots || []);
      setVehicles(payload.vehicles || {});
      setReport(payload.report || null);
      if (!snapshotId && payload.snapshots?.[0]?.id) {
        setSelectedSnapshotId(payload.snapshots[0].id);
      } else if (snapshotId) {
        setSelectedSnapshotId(snapshotId);
      }
    } catch (err) {
      setError(err.message);
      setSnapshots([]);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const distanceRows = useMemo(
    () =>
      mergeRankLists(
        mapRankItems(report?.distanceDTO?.top5Distance, vehicles, 'distance'),
        mapRankItems(report?.distanceDTO?.least5Distance, vehicles, 'distance')
      ).sort((a, b) => b.value - a.value),
    [report, vehicles]
  );

  const durationRows = useMemo(
    () =>
      mergeRankLists(
        mapRankItems(report?.durationDTO?.top5Durations, vehicles, 'duration'),
        mapRankItems(report?.durationDTO?.least5Durations, vehicles, 'duration')
      ).sort((a, b) => b.value - a.value),
    [report, vehicles]
  );

  const fuelConsumeRows = useMemo(
    () =>
      mergeRankLists(
        mapRankItems(report?.fuelConsumeDTO?.topFuel, vehicles, 'fuel'),
        mapRankItems(report?.fuelConsumeDTO?.leastFuel, vehicles, 'fuel')
      ).sort((a, b) => b.value - a.value),
    [report, vehicles]
  );

  const fuelFillRows = useMemo(
    () =>
      mergeRankLists(
        mapRankItems(report?.fuelFillDTO?.topFuel, vehicles, 'fuel'),
        mapRankItems(report?.fuelFillDTO?.leastFuel, vehicles, 'fuel')
      ).sort((a, b) => b.value - a.value),
    [report, vehicles]
  );

  const tableConfig = {
    distance: {
      title: 'Distance Report — Vehicle Wise',
      rows: distanceRows,
      valueLabel: 'Distance',
      formatValue: (value) => `${Number(value).toFixed(2)} km`,
    },
    duration: {
      title: 'Duration Report — Vehicle Wise',
      rows: durationRows,
      valueLabel: 'Duration',
      formatValue: (value) => formatDuration(value),
    },
    fuelConsume: {
      title: 'Fuel Consume Report — Vehicle Wise',
      rows: fuelConsumeRows,
      valueLabel: 'Fuel',
      formatValue: (value) => `${Number(value).toFixed(2)} L`,
    },
    fuelFill: {
      title: 'Fuel Fill Report — Vehicle Wise',
      rows: fuelFillRows,
      valueLabel: 'Fuel Fill',
      formatValue: (value) => `${Number(value).toFixed(2)} L`,
    },
  };

  const activeConfig = tableConfig[activeReport] || tableConfig.distance;
  const activeMeta = REPORT_TYPES.find((item) => item.id === activeReport) || REPORT_TYPES[0];

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
        Loading saved reports from database...
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
        <h3 className="text-lg font-bold text-gray-900">No Saved Reports Yet</h3>
        <p className="mt-2 text-sm text-gray-600">
          Open Analytics, select date range and click Search to save report data in MongoDB.
        </p>
        <Link
          to={ROUTES.analytics}
          className="mt-5 inline-block rounded-lg px-5 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: PURPLE }}
        >
          Go to Analytics
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Saved Reports</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">Fleet Reports from Database</h2>
          <p className="mt-1 text-sm text-gray-600">
            {formatRangeLabel(report.startTime, report.endTime)} · {report.ouids?.length || 0} vehicles
          </p>
        </div>

        <div className="min-w-[280px]">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Select Saved Report</label>
          <select
            value={selectedSnapshotId}
            onChange={(e) => {
              setSelectedSnapshotId(e.target.value);
              loadReports(e.target.value);
            }}
            className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-black focus:outline-none"
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {formatRangeLabel(snapshot.startTime, snapshot.endTime)} ({snapshot.vehicleCount} vehicles)
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {REPORT_TYPES.map((item) => (
          <SummaryCard
            key={item.id}
            title={item.label}
            value={item.metric(report)}
            comparison={item.compare(report)}
            lastLabel={item.lastLabel}
            lastValue={item.last(report)}
            gradient={item.gradient}
            active={activeReport === item.id}
            onClick={() => setActiveReport(item.id)}
          />
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Showing <span className="font-semibold">{activeMeta.label}</span> from MongoDB saved analytics data.
        Last synced: {report.syncedAt ? new Date(report.syncedAt).toLocaleString('en-IN') : '--'}
      </div>

      <ReportTable
        title={activeConfig.title}
        rows={activeConfig.rows}
        valueLabel={activeConfig.valueLabel}
        formatValue={activeConfig.formatValue}
      />
    </div>
  );
}
