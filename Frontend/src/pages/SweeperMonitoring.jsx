import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSavedVehicles, fetchSweepingReport } from '../api';
import { VEHICLE_MAP_ICON } from '../components/VehicleIcons';

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

function rangeToEpoch(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  return { startTime: start.getTime(), endTime: end.getTime() };
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return `${hours}h ${pad(mins)}m`;
}

function formatKm(km) {
  return `${(Number(km) || 0).toFixed(1)} km`;
}

function formatClock(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDateTime(ms) {
  if (!ms) return '--';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '--';
  return `${pad(d.getDate())} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function CalendarIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0121 8.25v11.25A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V8.25A1.5 1.5 0 014.5 6.75z" />
    </svg>
  );
}

function ClockIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3.75 2.25M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RouteIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function SweepHeadIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19h16M6 19c0-3 2-5 6-5s6 2 6 5M9 8.5l6 6M8 4l10 10" />
    </svg>
  );
}

function TruckMiniIcon({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h9.75v8.25H3V7.5zm9.75 2.25H18l3 3v3H12.75V9.75zM7.125 18.375a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0zm11.25 0a1.125 1.125 0 11-2.25 0 1.125 1.125 0 012.25 0z" />
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

function ModePanel({ mode, stats, onViewDetails }) {
  const isSweep = mode === 'sweeping';
  const wrap = isSweep
    ? 'bg-[#eef8ee] border-[#cde8cd]'
    : 'bg-[#fff3e8] border-[#f5d4b8]';
  const title = isSweep ? 'text-[#2E7D32]' : 'text-[#E65100]';
  const iconBg = isSweep ? 'bg-[#2E7D32]' : 'bg-[#E65100]';
  const link = isSweep ? 'text-[#2E7D32]' : 'text-[#E65100]';

  return (
    <div className={`flex min-w-0 flex-col rounded-xl border p-3 ${wrap}`}>
      <div className="mb-3 flex items-start gap-2">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white ${iconBg}`}>
          {isSweep ? <SweepHeadIcon className="h-4 w-4" /> : <TruckMiniIcon className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-bold leading-tight ${title}`}>{isSweep ? 'Sweeping' : 'Non-Sweeping'}</p>
          <p className="text-[0.65rem] text-gray-500">{isSweep ? 'Speed < 8 km/h' : 'Speed > 8 km/h'}</p>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[0.65rem] text-gray-500">Total Time</p>
          <p className="text-sm font-bold text-gray-900">{formatDuration(stats?.totalTimeSec)}</p>
        </div>
        <div>
          <p className="text-[0.65rem] text-gray-500">Total Distance</p>
          <p className="text-sm font-bold text-gray-900">{formatKm(stats?.totalKm)}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onViewDetails}
        className={`mt-auto inline-flex items-center gap-1 text-xs font-semibold ${link}`}
      >
        View Details
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </button>
    </div>
  );
}

function SegmentSheet({ detail, onClose }) {
  if (!detail) return null;
  const isSweep = detail.mode === 'sweeping';
  const segments = detail.stats?.segments || [];
  const accent = isSweep ? GREEN : ORANGE;

  return (
    <div className="fixed inset-0 z-[2200] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close details" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
          <div>
            <p className="text-xs font-medium text-gray-500">{detail.vehicle.vehicleNo}</p>
            <h3 className="text-lg font-bold text-gray-900" style={{ color: accent }}>
              {isSweep ? 'Sweeping' : 'Non-Sweeping'}
            </h3>
            <p className="text-xs text-gray-500">
              {formatDuration(detail.stats?.totalTimeSec)} · {formatKm(detail.stats?.totalKm)} · {segments.length} trips
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-3">
          {segments.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">No GPS segments in this range.</p>
          ) : (
            <div>
              {/* Overall stats */}
              <div className="mb-4 rounded-lg border p-3" style={{ borderColor: accent, backgroundColor: `${accent}08` }}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-gray-500">Total Time</p>
                    <p className="text-lg font-bold" style={{ color: accent }}>{formatDuration(detail.stats?.totalTimeSec)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Total Distance</p>
                    <p className="text-lg font-bold" style={{ color: accent }}>{formatKm(detail.stats?.totalKm)}</p>
                  </div>
                </div>
              </div>

              {/* Date-wise breakdown */}
              {detail.dateWiseStats && detail.dateWiseStats.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 text-right font-semibold">Time</th>
                        <th className="px-3 py-2 text-right font-semibold">Distance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.dateWiseStats.map((d, i) => {
                        const modeData = isSweep ? d.sweeping : d.nonSweeping;
                        return (
                          <tr key={`${d.date}-${i}`} className={i % 2 ? 'bg-gray-50/70' : 'bg-white'}>
                            <td className="px-3 py-2.5 font-medium text-gray-800">{d.date}</td>
                            <td className="px-3 py-2.5 text-right text-gray-800">{formatDuration(modeData?.totalTimeSec)}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-gray-900">{formatKm(modeData?.totalKm)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Original segments view */}
              {segments.length > 0 && (
                <div className="mt-4">
                  <p className="mb-3 text-xs font-semibold text-gray-600">
                    {segments.filter(seg => isSweep ? seg.avgSpeed < 8 : seg.avgSpeed > 8).length} Segments
                  </p>
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Start time</th>
                          <th className="px-3 py-2 font-semibold">End time</th>
                          <th className="px-3 py-2 text-right font-semibold">Speed (km/h)</th>
                          <th className="px-3 py-2 text-right font-semibold">Total km</th>
                        </tr>
                      </thead>
                      <tbody>
                        {segments
                          .filter(seg => isSweep ? seg.avgSpeed < 8 : seg.avgSpeed > 8)
                          .map((seg, i) => (
                          <tr key={`${seg.startTime}-${i}`} className={i % 2 ? 'bg-gray-50/70' : 'bg-white'}>
                            <td className="px-3 py-2.5 text-gray-800">
                              <div className="font-medium">{formatClock(seg.startTime)}</div>
                              <div className="text-[0.65rem] text-gray-400">{formatDateTime(seg.startTime).slice(0, 11)}</div>
                            </td>
                            <td className="px-3 py-2.5 text-gray-800">
                              <div className="font-medium">{formatClock(seg.endTime)}</div>
                              <div className="text-[0.65rem] text-gray-400">{formatDateTime(seg.endTime).slice(0, 11)}</div>
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-900">{seg.avgSpeed?.toFixed(1) || '-'}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-gray-900">{formatKm(seg.totalKm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SweeperMonitoring() {
  const defaults = useMemo(() => todayRange(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [vehicleOuid, setVehicleOuid] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('sweeper');
  const [options, setOptions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);

  // Define categories with their vehicles
  const categories = {
    sweeper: { name: 'Sweeper', vehicles: ['1CBM', '2CBM', '3CBM'] },
    litterPicker: { name: 'Litter Picker', vehicles: ['LP1', 'LP2', 'LP3'] },
    jetWasher: { name: 'Jet Washer', vehicles: ['JW1', 'JW2'] },
  };

  const loadOptions = useCallback(async () => {
    try {
      const result = await fetchSavedVehicles();
      const list = (result.data || []).map((v) => ({
        ouid: v.ouid,
        vehicleNo: v.vehicleNo,
        alias: v.alias || v.vehicleType || '',
      }));
      setOptions(list);
    } catch {
      setOptions([]);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { startTime, endTime } = rangeToEpoch(fromDate, toDate);
      if (!startTime || !endTime || startTime > endTime) {
        throw new Error('Please choose a valid date range');
      }
      
      console.log(`[SweeperMonitoring] Loading report - category: ${selectedCategory}, vehicleOuid: ${vehicleOuid}`);
      
      // If specific vehicle is selected, use its ouid
      // If only category is selected (no specific vehicle), pass empty ouid (will show all in category)
      const result = await fetchSweepingReport({ startTime, endTime, ouid: vehicleOuid });
      console.log(`[SweeperMonitoring] Report received:`, result.data);
      setReport(result.data);
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, vehicleOuid]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    loadReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- default today on first load

  function handleApply(e) {
    e.preventDefault();
    loadReport();
  }

  const summary = report?.summary;
  const vehicles = report?.vehicles || [];

  return (
    <div className="-m-4 min-h-full bg-[#f3f4f6] p-3 sm:-m-6 sm:p-5">
      <div className="mx-auto max-w-3xl space-y-3 lg:max-w-5xl">
        <form onSubmit={handleApply} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <DateField label="From Date" value={fromDate} onChange={setFromDate} />
            <DateField label="To Date" value={toDate} onChange={setToDate} />
          </div>
          
          {/* Category and Vehicle Dropdowns */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1.5 block text-[0.7rem] font-medium text-gray-500">Category</span>
              <div className="relative">
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setVehicleOuid('');
                  }}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-sm font-medium text-gray-900 outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
                >
                  <option value="">All Vehicles</option>
                  {Object.entries(categories).map(([key, cat]) => (
                    <option key={key} value={key}>
                      {cat.name}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </span>
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[0.7rem] font-medium text-gray-500">
                {selectedCategory ? `${categories[selectedCategory]?.name}` : 'Vehicle'}
              </span>
              <div className="relative">
                <select
                  value={vehicleOuid}
                  onChange={(e) => setVehicleOuid(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-sm font-medium text-gray-900 outline-none focus:border-green-500 focus:bg-white focus:ring-2 focus:ring-green-100"
                >
                  <option value="">
                    All {selectedCategory ? categories[selectedCategory]?.name : 'Select Category First'}
                  </option>
                  {selectedCategory &&
                    options
                      .filter((v) => categories[selectedCategory].vehicles.includes(v.vehicleNo))
                      .map((v) => (
                        <option key={v.ouid} value={v.ouid}>
                          {v.vehicleNo}{v.alias ? ` · ${v.alias}` : ''}
                        </option>
                      ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </span>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-60"
            style={{ backgroundColor: GREEN }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.5 3.5 6 6.5 6 10.5A6 6 0 116 13.5C6 9.5 9.5 6.5 12 3z" />
            </svg>
            {loading ? 'Loading...' : 'Apply Filter'}
          </button>
        </form>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[#2E7D32]">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="text-[0.65rem] font-medium">Sweeping Time</span>
            </div>
            <p className="text-lg font-bold text-[#2E7D32]">{loading ? '—' : formatDuration(summary?.sweepingTimeSec)}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[#2E7D32]">
              <RouteIcon className="h-3.5 w-3.5" />
              <span className="text-[0.65rem] font-medium">Sweeping KM</span>
            </div>
            <p className="text-lg font-bold text-[#2E7D32]">{loading ? '—' : formatKm(summary?.sweepingKm)}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[#E65100]">
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="text-[0.65rem] font-medium">Non-Sweeping Time</span>
            </div>
            <p className="text-lg font-bold text-[#E65100]">{loading ? '—' : formatDuration(summary?.nonSweepingTimeSec)}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3 shadow-sm">
            <div className="mb-1 flex items-center gap-1.5 text-[#E65100]">
              <RouteIcon className="h-3.5 w-3.5" />
              <span className="text-[0.65rem] font-medium">Non-Sweeping KM</span>
            </div>
            <p className="text-lg font-bold text-[#E65100]">{loading ? '—' : formatKm(summary?.nonSweepingKm)}</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <p className="text-sm font-semibold text-gray-800">
            {selectedCategory && !vehicleOuid
              ? `${categories[selectedCategory]?.name} (${vehicles.filter(v => categories[selectedCategory]?.vehicles.includes(v.vehicleNo)).length}/${vehicles.length})`
              : `${vehicles.length} Vehicles`}
          </p>
          <button type="button" onClick={loadReport} className="inline-flex items-center gap-1 text-xs text-gray-500">
            Last update: {report?.lastUpdate || '--'}
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992M4.45 16.023A8.25 8.25 0 1119.55 7.977" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {loading && vehicles.length === 0 ? (
            <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">Loading GPS data...</div>
          ) : vehicles.length === 0 ? (
            <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">
              No vehicles found. Open Live Vehicles so GPS history can sync.
            </div>
          ) : (
            vehicles
              .filter(v => {
                // If category selected but no specific vehicle, filter by category
                if (selectedCategory && !vehicleOuid) {
                  return categories[selectedCategory]?.vehicles.includes(v.vehicleNo);
                }
                return true;
              })
              .map((v, index) => (
              <article key={v.ouid} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${v.gpsOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <h3 className="truncate text-sm font-bold text-gray-900">
                        {v.vehicleNo}{' '}
                        <span className="font-semibold text-gray-700">
                          {v.alias || `Sweeper Machine ${String(index + 1).padStart(2, '0')}`}
                        </span>
                      </h3>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-[0.7rem] text-gray-500">
                      <RouteIcon className="h-3 w-3 text-gray-400" />
                      {v.gpsOnline ? 'GPS Online' : 'GPS Offline'} · {v.lastUpdate || '--'}
                    </p>
                  </div>
                  <img
                    src={VEHICLE_MAP_ICON}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-contain"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ModePanel
                    mode="sweeping"
                    stats={v.sweeping}
                    onViewDetails={() => setDetail({ vehicle: v, mode: 'sweeping', stats: v.sweeping, dateWiseStats: v.dateWiseStats })}
                  />
                  <ModePanel
                    mode="nonSweeping"
                    stats={v.nonSweeping}
                    onViewDetails={() => setDetail({ vehicle: v, mode: 'nonSweeping', stats: v.nonSweeping, dateWiseStats: v.dateWiseStats })}
                  />
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <SegmentSheet detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
