import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVehicles } from '../api';

const PURPLE = '#4a3068';

const STATUS_FILTERS = [
  { id: 'all', label: 'ALL', activeClass: 'bg-blue-600 text-white border-blue-600', idleClass: 'border-blue-600 text-blue-600' },
  { id: 'running', label: 'RUNNING', activeClass: 'bg-green-600 text-white border-green-600', idleClass: 'border-green-500 text-green-600' },
  { id: 'stopped', label: 'STOPPED', activeClass: 'bg-rose-500 text-white border-rose-500', idleClass: 'border-rose-400 text-rose-500' },
  { id: 'overspeed', label: 'OVERSPEED', activeClass: 'bg-orange-500 text-white border-orange-500', idleClass: 'border-orange-400 text-orange-500' },
  { id: 'idle', label: 'IDLE', activeClass: 'bg-yellow-500 text-white border-yellow-500', idleClass: 'border-yellow-500 text-yellow-600' },
  { id: 'unreachable', label: 'UNREACHABLE', activeClass: 'bg-sky-500 text-white border-sky-500', idleClass: 'border-sky-400 text-sky-500' },
  { id: 'new', label: 'NEW', activeClass: 'bg-gray-500 text-white border-gray-500', idleClass: 'border-gray-400 text-gray-500' },
  { id: 'inactive', label: 'INACTIVE', activeClass: 'bg-black text-white border-black', idleClass: 'border-black text-black border-2' },
];

const COLUMNS = [
  { key: 'sn', label: 'SN', sortable: false },
  { key: 'vehicleNo', label: 'Vehicle No.', sortable: true },
  { key: 'state', label: 'State', sortable: true },
  { key: 'vehicleType', label: 'V_Type', sortable: true },
  { key: 'lu', label: 'Last Updated', sortable: true },
  { key: 'since', label: 'Since', sortable: true },
  { key: 'overspeed', label: 'Overspeed', sortable: true },
  { key: 'mileage', label: 'Mileage', sortable: true },
  { key: 'odometer', label: 'Odometer(km)', sortable: true },
  { key: 'alias', label: 'Vehicle Nickname', sortable: true },
  { key: 'loadingStatus', label: 'Loading Status', sortable: false },
  { key: 'subscriptionStart', label: 'Sub_Start', sortable: true },
  { key: 'subscriptionDue', label: 'Sub_Due', sortable: true },
];

function SortIcon() {
  return (
    <span className="ml-1 inline-flex flex-col leading-none opacity-70">
      <svg className="h-2 w-2" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0l4 5H0z" /></svg>
      <svg className="h-2 w-2 -mt-0.5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z" /></svg>
    </span>
  );
}

function formatSince(sinceStr) {
  if (!sinceStr) return '--';
  const parts = sinceStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return sinceStr;
  const [, d, m, y, h, min, s] = parts;
  const since = new Date(`${y}-${m}-${d}T${h}:${min}:${s}`);
  const diffMs = Date.now() - since.getTime();
  if (diffMs < 0) return '--';
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${String(days).padStart(2, '0')}D ${String(hours % 24).padStart(2, '0')}H ${String(totalMins % 60).padStart(2, '0')}M`;
  }
  return `${String(hours).padStart(2, '0')}H ${String(totalMins % 60).padStart(2, '0')}M`;
}

function matchStatusFilter(vehicle, filter) {
  const state = (vehicle.state || '').toLowerCase();
  const status = (vehicle.vehicleStatus || '').toLowerCase();
  switch (filter) {
    case 'all': return true;
    case 'running': return /running|moving/.test(state);
    case 'stopped': return /off|stop/.test(state);
    case 'overspeed': return false;
    case 'idle': return /idle/.test(state);
    case 'unreachable': return vehicle.terminalPacketMeta?.gsmSignals === 0;
    case 'new': return false;
    case 'inactive': return status !== 'active';
    default: return true;
  }
}

function getCellValue(v, key) {
  switch (key) {
    case 'vehicleNo': return v.vehicleNo || '';
    case 'state': return v.state || '';
    case 'vehicleType': return v.vehicleType || '';
    case 'lu': return v.lu || '';
    case 'since': return v.since || '';
    case 'overspeed': return v.overspeed ?? '';
    case 'mileage': return v.mileage ?? '';
    case 'odometer': return v.odometer ?? '';
    case 'alias': return v.alias || '';
    case 'subscriptionStart': return v.subscriptionStart || '';
    case 'subscriptionDue': return v.subscriptionDue || '';
    default: return '';
  }
}

export default function LiveVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [vehicleToggle, setVehicleToggle] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchVehicles();
      setVehicles(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
    const interval = setInterval(loadVehicles, 30000);
    return () => clearInterval(interval);
  }, [loadVehicles]);

  const counts = useMemo(() => {
    const c = {};
    STATUS_FILTERS.forEach((f) => {
      c[f.id] = vehicles.filter((v) => matchStatusFilter(v, f.id)).length;
    });
    return c;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = vehicles.filter((v) => matchStatusFilter(v, filter));
    if (q) {
      list = list.filter(
        (v) =>
          v.vehicleNo?.toLowerCase().includes(q) ||
          v.vehicleType?.toLowerCase().includes(q) ||
          v.state?.toLowerCase().includes(q) ||
          v.alias?.toLowerCase().includes(q)
      );
    }
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = getCellValue(a, sortKey);
        const bv = getCellValue(b, sortKey);
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return list;
  }, [vehicles, search, filter, sortKey, sortDir]);

  const paginated = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const thClass = 'border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdClass = 'border border-gray-300 px-2 py-1.5 text-center text-xs text-black whitespace-nowrap';

  return (
    <div className="space-y-0">
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Status filter pills */}
      {filtersOpen && (
        <div className="flex flex-wrap gap-2 pb-2">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFilter(f.id); setPage(1); }}
                className={`flex min-w-[72px] flex-col items-center rounded border px-3 py-1.5 transition ${
                  active ? f.activeClass : `bg-white ${f.idleClass}`
                }`}
              >
                <span className="text-lg font-bold leading-tight">{loading ? '—' : counts[f.id]}</span>
                <span className="text-[0.6rem] font-bold tracking-wide">{f.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Purple collapse bar */}
      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        className="flex w-full items-center justify-center py-0.5 text-white"
        style={{ backgroundColor: PURPLE }}
      >
        <svg className={`h-3 w-3 transition ${filtersOpen ? '' : 'rotate-180'}`} viewBox="0 0 12 8" fill="currentColor">
          <path d="M6 0l6 8H0z" />
        </svg>
        <svg className={`h-3 w-3 -mt-1 transition ${filtersOpen ? '' : 'rotate-180'}`} viewBox="0 0 12 8" fill="currentColor">
          <path d="M6 8L0 0h12z" />
        </svg>
      </button>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border border-gray-300 border-b-0 bg-white px-3 py-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-48 rounded border border-gray-300 py-1.5 pl-8 pr-3 text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400 sm:w-64"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs text-black focus:outline-none"
          >
            <option value={10}>No of Rows</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button
            type="button"
            onClick={loadVehicles}
            disabled={loading}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs text-black hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1.5 text-xs text-black hover:bg-gray-50"
          >
            Column Visibility
            <svg className="h-3 w-3" viewBox="0 0 12 8" fill="currentColor"><path d="M6 8L0 0h12z" /></svg>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-300">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr style={{ backgroundColor: PURPLE }}>
              {COLUMNS.map((col) => (
                <th key={col.key} className={thClass}>
                  {col.key === 'vehicleNo' ? (
                    <div className="flex items-center justify-center gap-1">
                      <span>{col.label}</span>
                      <button
                        type="button"
                        onClick={() => setVehicleToggle((t) => !t)}
                        className={`relative h-4 w-7 rounded-full transition ${vehicleToggle ? 'bg-green-500' : 'bg-gray-400'}`}
                      >
                        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${vehicleToggle ? 'left-3.5' : 'left-0.5'}`} />
                      </button>
                      {col.sortable && <SortIcon />}
                    </div>
                  ) : col.sortable ? (
                    <button type="button" onClick={() => handleSort(col.key)} className="inline-flex items-center justify-center w-full">
                      {col.label}
                      <SortIcon />
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && vehicles.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-gray-500">
                  No vehicles found
                </td>
              </tr>
            ) : (
              paginated.map((v, i) => (
                <tr
                  key={v.ouid || v.deviceId}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f4f8]'}
                >
                  <td className={tdClass}>{(page - 1) * rowsPerPage + i + 1}</td>
                  <td className={tdClass}>
                    <button type="button" className="font-medium text-blue-600 hover:underline">
                      {v.vehicleNo}
                    </button>
                  </td>
                  <td className={tdClass}>{v.state || '--'}</td>
                  <td className={`${tdClass} capitalize`}>{v.vehicleType || '--'}</td>
                  <td className={tdClass}>{v.lu || '--'}</td>
                  <td className={tdClass}>{formatSince(v.since)}</td>
                  <td className={tdClass}>{v.overspeed ?? '--'}</td>
                  <td className={tdClass}>{v.mileage ?? '--'}</td>
                  <td className={tdClass}>{v.odometer ?? '--'}</td>
                  <td className={tdClass}>{v.alias || ''}</td>
                  <td className={tdClass}>--</td>
                  <td className={tdClass}>{v.subscriptionStart || '--'}</td>
                  <td className={tdClass}>{v.subscriptionDue || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between border border-t-0 border-gray-300 bg-white px-3 py-2 text-xs text-gray-600">
          <span>
            Showing {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
