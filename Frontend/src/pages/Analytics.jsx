import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAnalyticsDashboard, fetchAnalyticsVehicleInfo } from '../api';
import { PURPLE } from '../utils/vehicleUtils';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDisplayDate(date) {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getDefaultRange() {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return `${hours}H ${mins}M`;
}

function formatDistance(km) {
  const value = Number(km) || 0;
  return `${value.toFixed(2)} km`;
}

function parseStartTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return NaN;
  d.setSeconds(0, 0);
  return d.getTime();
}

function parseEndTime(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return NaN;
  d.setSeconds(59, 999);
  return d.getTime();
}

function formatComparison(value) {
  const num = Number(value) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)} %`;
}

function normalizeGraphData(graphData = []) {
  if (!Array.isArray(graphData)) return [];

  return graphData.map((point, index) => {
    if (typeof point === 'number') {
      return { label: `Day ${index + 1}`, value: point };
    }

    const rawValue =
      point.y ??
      point.yaxis ??
      point.value ??
      point.distance ??
      point.duration ??
      0;

    let label = point.x || point.label || point.dateStr || point.date || '';
    if (!label && (point.time || point.dateTime || point.timestamp)) {
      const ts = Number(point.time || point.dateTime || point.timestamp);
      if (!Number.isNaN(ts)) {
        const d = new Date(ts);
        label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      }
    }
    if (!label) label = `Day ${index + 1}`;

    return { label, value: Number(rawValue) || 0 };
  });
}

function getYAxisSteps(maxValue, steps = 5) {
  if (maxValue <= 0) return [0, 50, 100, 150, 200, 250];
  const step = Math.ceil(maxValue / steps / 10) * 10 || 10;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

function AnalyticsBarChart({ title, data, unit, maxValue }) {
  const points = normalizeGraphData(data);
  const peak = maxValue || Math.max(...points.map((p) => p.value), 0);
  const ySteps = getYAxisSteps(peak);
  const chartMax = ySteps[ySteps.length - 1] || 1;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3 sm:px-4">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="bg-black p-3 sm:p-4">
        <div className="flex h-44 gap-2 sm:h-56 sm:gap-3">
          <div className="flex w-8 shrink-0 flex-col justify-between py-1 text-[0.6rem] text-gray-400 sm:w-10 sm:text-[0.65rem]">
            {[...ySteps].reverse().map((step) => (
              <span key={step}>{step}{unit}</span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between">
              {ySteps.map((step) => (
                <div key={step} className="border-t border-white/10" />
              ))}
            </div>
            <div className="relative flex h-full items-end justify-around gap-2 px-1">
              {points.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-xs text-gray-500">
                  No chart data for selected range
                </div>
              ) : (
                points.map((point, index) => {
                  const height = chartMax > 0 ? Math.max((point.value / chartMax) * 100, 4) : 4;
                  return (
                    <div key={`${point.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end">
                      <div
                        className="w-full max-w-8 rounded-t-sm bg-gradient-to-t from-lime-500 to-cyan-400"
                        style={{ height: `${height}%` }}
                        title={`${point.label}: ${point.value}${unit}`}
                      />
                      <span className="mt-2 max-w-[2.75rem] truncate text-[0.5rem] text-gray-400 sm:max-w-[3.5rem] sm:text-[0.55rem]">
                        {point.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, comparison, lastLabel, lastValue, loading }) {
  const negative = Number(comparison) < 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 sm:px-5">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-orange-500 sm:mt-3 sm:text-4xl">
        {loading ? '—' : value}
      </p>
      <div className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:text-sm">
        <span className={`inline-flex items-center gap-1 font-semibold ${negative ? 'text-red-500' : 'text-green-600'}`}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            {negative ? (
              <path d="M10 14l-4-4h8l-4 4z" />
            ) : (
              <path d="M10 6l4 4H6l4-4z" />
            )}
          </svg>
          {loading ? '—' : formatComparison(comparison)}
        </span>
        <span className="text-gray-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-400" />
          <span className="break-words">{lastLabel} {loading ? '—' : lastValue}</span>
        </span>
      </div>
    </div>
  );
}

function RankList({ title, items, valueFormatter, tone = 'danger' }) {
  const iconClass = tone === 'danger' ? 'text-red-500' : 'text-green-500';

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">No data available</p>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.ouid}`} className="flex items-center justify-between gap-3 px-3 py-3 sm:px-4">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-50 ${iconClass}`}>
                  {tone === 'danger' ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
                    </svg>
                  )}
                </span>
                <span className="truncate font-semibold text-gray-900">{item.vehicleNo || item.ouid}</span>
              </div>
              <span className="shrink-0 text-xs font-medium text-gray-700 sm:text-sm">{valueFormatter(item.value)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function mapRankItems(list = [], vehicleMap = {}) {
  return (list || []).map((item) => ({
    ouid: item.ouid,
    vehicleNo: vehicleMap[item.ouid]?.vehicleNo || item.vehicleNo || item.ouid,
    value: item.distance ?? item.duration ?? item.value ?? 0,
  }));
}

export default function Analytics() {
  const defaults = getDefaultRange();

  const [vehicles, setVehicles] = useState({});
  const [selectedOuid, setSelectedOuid] = useState('');
  const [startInput, setStartInput] = useState(toInputValue(defaults.start));
  const [endInput, setEndInput] = useState(toInputValue(defaults.end));
  const [dashboard, setDashboard] = useState(null);
  const [dataSource, setDataSource] = useState('live');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const vehicleOptions = useMemo(
    () =>
      Object.entries(vehicles)
        .map(([ouid, info]) => ({ ouid, vehicleNo: info.vehicleNo || ouid }))
        .sort((a, b) => a.vehicleNo.localeCompare(b.vehicleNo)),
    [vehicles]
  );

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startTime = parseStartTime(startInput);
      const endTime = parseEndTime(endInput);
      if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
        throw new Error('Invalid date range');
      }
      if (endTime < startTime) {
        throw new Error('End date must be after start date');
      }

      const vehicleResult = await fetchAnalyticsVehicleInfo();
      const info = vehicleResult.data || {};
      setVehicles(info);

      const ouids = selectedOuid ? [selectedOuid] : Object.keys(info);
      if (ouids.length === 0) {
        throw new Error('No vehicles available for analytics');
      }

      const dashboardResult = await fetchAnalyticsDashboard({
        startTime,
        endTime,
        ouid: selectedOuid,
        ouids,
      });
      setDashboard(dashboardResult.data || null);
      setDataSource(dashboardResult.source || 'live');
    } catch (err) {
      setError(err.message);
      setDashboard(null);
      setDataSource('live');
    } finally {
      setLoading(false);
    }
  }, [startInput, endInput, selectedOuid]);

  useEffect(() => {
    loadAnalytics();
    // Initial load only — use Search button to refresh after changing filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distance = dashboard?.distanceDTO || {};
  const duration = dashboard?.durationDTO || {};

  const longestDistance = mapRankItems(distance.top5Distance, vehicles);
  const shortestDistance = mapRankItems(distance.least5Distance, vehicles);
  const longestDuration = mapRankItems(duration.top5Durations, vehicles);
  const shortestDuration = mapRankItems(duration.least5Durations, vehicles);

  const rangeLabel = `${formatDisplayDate(new Date(startInput))} - ${formatDisplayDate(new Date(endInput))}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="w-full lg:min-w-[180px] lg:flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Select Vehicle</label>
          <select
            value={selectedOuid}
            onChange={(e) => setSelectedOuid(e.target.value)}
            disabled={loading}
            className="h-10 w-full rounded border border-gray-300 bg-white px-3 text-sm text-black focus:outline-none"
          >
            {vehicleOptions.length > 1 && <option value="">All Vehicles</option>}
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle.ouid} value={vehicle.ouid}>
                {vehicle.vehicleNo}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full lg:min-w-[280px] lg:flex-[2]">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Date Range</label>
          <div className="flex flex-col gap-2 rounded border border-gray-300 px-3 py-2 sm:flex-row sm:items-center">
            <input
              type="datetime-local"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className="w-full min-w-0 flex-1 border-0 bg-transparent text-sm text-black focus:outline-none"
            />
            <span className="hidden text-sm text-gray-400 sm:inline">-</span>
            <input
              type="datetime-local"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className="w-full min-w-0 flex-1 border-0 bg-transparent text-sm text-black focus:outline-none"
            />
          </div>
          <p className="mt-1 break-words text-[0.65rem] text-gray-500">{rangeLabel}</p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <span
            className={`inline-flex items-center justify-center rounded border px-3 py-2 text-xs font-semibold sm:py-1.5 ${
              dataSource === 'database'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-blue-300 bg-blue-50 text-blue-700'
            }`}
          >
            {dataSource === 'database' ? 'Database Data' : 'Live TBTrack Data'}
          </span>

          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="h-10 w-full rounded px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
            style={{ backgroundColor: PURPLE }}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <AnalyticsBarChart
            title="Mileage"
            data={distance.graphData}
            unit=" km"
            maxValue={distance.graphMaxValue}
          />
          <MetricCard
            title="Distance Travelled"
            value={formatDistance(distance.totalDistance)}
            comparison={distance.distanceComparision}
            lastLabel="Last Distance Travelled"
            lastValue={formatDistance(distance.lastTotalDistance)}
            loading={loading}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RankList
              title="Longest Distance"
              items={longestDistance}
              valueFormatter={(value) => `${Number(value).toFixed(2)}km`}
              tone="danger"
            />
            <RankList
              title="Shortest Distance"
              items={shortestDistance}
              valueFormatter={(value) => `${Number(value).toFixed(2)}km`}
              tone="success"
            />
          </div>
        </div>

        <div className="space-y-4">
          <AnalyticsBarChart
            title="Duration"
            data={duration.graphData}
            unit=" hr"
            maxValue={duration.graphMaxValue}
          />
          <MetricCard
            title="Total Duration"
            value={formatDuration(duration.totalDuration)}
            comparison={duration.comparision}
            lastLabel="Last Duration"
            lastValue={formatDuration(duration.lastDuration)}
            loading={loading}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <RankList
              title="Longest Duration"
              items={longestDuration}
              valueFormatter={(value) => formatDuration(value)}
              tone="danger"
            />
            <RankList
              title="Shortest Duration"
              items={shortestDuration}
              valueFormatter={(value) => formatDuration(value)}
              tone="success"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
