import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSavedVehicles } from '../api';
import { parseLocation } from '../components/VehicleCard';
import {
  PURPLE,
  STATUS_FILTERS,
  formatSince,
  matchStatusFilter,
} from '../utils/vehicleUtils';

const COLUMNS = [
  { key: 'sn', label: 'SN', sortable: false },
  { key: 'vehicleNo', label: 'Vehicle No.', sortable: true },
  { key: 'state', label: 'State', sortable: true },
  { key: 'vehicleType', label: 'V_Type', sortable: true },
  { key: 'address', label: 'Address', sortable: true },
  { key: 'lu', label: 'Last Update', sortable: true },
  { key: 'since', label: 'Since', sortable: true },
  { key: 'odometer', label: 'Odometer', sortable: true },
  { key: 'deviceType', label: 'Device', sortable: true },
  { key: 'vehicleStatus', label: 'Status', sortable: true },
  { key: 'battery', label: 'Battery', sortable: true },
  { key: 'gsmSignals', label: 'GSM Signal', sortable: true },
  { key: 'satellites', label: 'Satellites', sortable: true },
  { key: 'location', label: 'Location', sortable: false },
];

function SortIcon() {
  return (
    <span className="ml-1 inline-flex flex-col leading-none opacity-70">
      <svg className="h-2 w-2" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0l4 5H0z" /></svg>
      <svg className="h-2 w-2 -mt-0.5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z" /></svg>
    </span>
  );
}

function getCellValue(v, key) {
  const meta = v.terminalPacketMeta || {};
  const { lat, lng } = parseLocation(meta.pLoc);

  switch (key) {
    case 'vehicleNo': return v.vehicleNo || '';
    case 'state': return v.state || '';
    case 'vehicleType': return v.vehicleType || '';
    case 'address': return v.address || '';
    case 'lu': return v.lu || '';
    case 'since': return v.since || '';
    case 'odometer': return v.odometer ?? '';
    case 'deviceType': return v.deviceType || '';
    case 'vehicleStatus': return v.vehicleStatus || '';
    case 'battery': return meta.battery ?? '';
    case 'gsmSignals': return meta.gsmSignals ?? '';
    case 'satellites': return meta.satellites ?? '';
    case 'location': return lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '';
    default: return '';
  }
}

function renderCell(v, key) {
  const meta = v.terminalPacketMeta || {};
  const { lat, lng } = parseLocation(meta.pLoc);

  switch (key) {
    case 'since':
      return formatSince(v.since);
    case 'odometer':
      return v.odometer != null ? `${v.odometer} km` : '--';
    case 'battery':
      return meta.battery != null ? `${meta.battery}%` : '--';
    case 'gsmSignals':
      return meta.gsmSignals != null ? `${meta.gsmSignals}/4` : '--';
    case 'satellites':
      return meta.satellites ?? '--';
    case 'location':
      return lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '--';
    case 'address':
      return v.address || '--';
    default:
      return getCellValue(v, key) || '--';
  }
}

export default function SavedVehicles() {
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

  const loadSaved = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSavedVehicles();
      setVehicles(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

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
          v.address?.toLowerCase().includes(q) ||
          v.deviceType?.toLowerCase().includes(q)
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
  const tdClass = 'border border-gray-300 px-2 py-1.5 text-center text-xs text-black';

  return (
    <div className="space-y-0">
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

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
          <span className="text-xs text-gray-500">MongoDB saved data</span>
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
            onClick={loadSaved}
            disabled={loading}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs text-black hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-300">
        <table className="w-full min-w-[1200px] border-collapse text-sm">
          <thead>
            <tr style={{ backgroundColor: PURPLE }}>
              {COLUMNS.map((col) => (
                <th key={col.key} className={thClass}>
                  {col.sortable ? (
                    <button type="button" onClick={() => handleSort(col.key)} className="inline-flex w-full items-center justify-center">
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
                  Loading saved data...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-gray-500">
                  No saved data yet. Open Live Vehicles to sync data to database.
                </td>
              </tr>
            ) : (
              paginated.map((v, i) => (
                <tr
                  key={v.ouid || v.deviceId}
                  className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f4f8]'}
                >
                  <td className={tdClass}>{(page - 1) * rowsPerPage + i + 1}</td>
                  {COLUMNS.slice(1).map((col) => (
                    <td
                      key={col.key}
                      className={`${tdClass} ${col.key === 'address' ? 'max-w-[200px] truncate text-left' : ''} ${col.key === 'vehicleType' ? 'capitalize' : ''}`}
                      title={col.key === 'address' ? v.address : undefined}
                    >
                      {col.key === 'vehicleNo' ? (
                        <span className="font-medium text-blue-600">{v.vehicleNo || '--'}</span>
                      ) : (
                        renderCell(v, col.key)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
