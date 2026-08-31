import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchVehicleDetails } from '../api';

const PURPLE = '#4a3569';
const PAGE_SIZE = 10;

const COLUMNS = [
  { key: 'vehicleNo', label: 'Vehicle No.' },
  { key: 'ownerName', label: 'Owner Name' },
  { key: 'ownedBy', label: 'Owned By' },
  { key: 'vehicleBrand', label: 'Vehicle Brand' },
  { key: 'vehicleModel', label: 'Vehicle Model' },
  { key: 'vehicleBody', label: 'Vehicle Body' },
  { key: 'capacity', label: 'Capacity' },
  { key: 'manufactureDate', label: 'Manufacture Date' },
  { key: 'purchaseDate', label: 'Purchase Date' },
];

function SortArrows() {
  return (
    <span className="ml-1 inline-flex flex-col text-[0.5rem] leading-none opacity-80">
      <span>▲</span>
      <span>▼</span>
    </span>
  );
}

function formatCost(value) {
  if (value == null || value === '') return '—';
  return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function VehicleDetailCard({ row, onViewMaintenance }) {
  const detailFields = COLUMNS.filter((col) => col.key !== 'vehicleNo').map((col) => ({
    label: col.label,
    value: col.key === 'capacity' ? (row.capacity ?? 0) : (row[col.key] || '—'),
  }));

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-blue-600">{row.vehicleNo || '—'}</h3>
        <p className="mt-0.5 truncate text-xs text-gray-500">{row.ownerName || '—'}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {detailFields.map(({ label, value }) => (
          <div key={label}>
            <dt className="font-medium text-gray-500">{label}</dt>
            <dd className="text-black">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => onViewMaintenance(row)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-gray-50"
        >
          Service &amp; Maintenance — View
        </button>
      </div>
    </article>
  );
}

export default function VehicleDetails() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('vehicleNo');
  const [sortDir, setSortDir] = useState('asc');
  const [maintenanceRow, setMaintenanceRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchVehicleDetails();
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load vehicle details');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      COLUMNS.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (sortKey === 'capacity') {
        const diff = Number(av) - Number(bv);
        return sortDir === 'asc' ? diff : -diff;
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, total);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const thClass =
    'border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdClass = 'border border-gray-300 px-2 py-1.5 text-center text-xs text-black';

  return (
    <div className="space-y-0">
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="flex flex-col gap-3 border border-gray-300 border-b-0 bg-white px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-auto sm:min-w-[16rem] sm:flex-1 sm:max-w-md">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="search"
            placeholder="Search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded border border-gray-300 py-2 pl-8 pr-3 text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="w-full rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto sm:py-1.5"
          style={{ backgroundColor: PURPLE }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="space-y-3 border border-gray-300 p-3 lg:hidden">
        {loading && pageRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">Loading vehicle details…</div>
        ) : pageRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No vehicle details found.</div>
        ) : (
          pageRows.map((row, idx) => (
            <VehicleDetailCard
              key={row.ouid || row.id || idx}
              row={row}
              onViewMaintenance={setMaintenanceRow}
            />
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto border border-gray-300 lg:block">
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead style={{ backgroundColor: PURPLE }}>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className={thClass}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className="inline-flex w-full items-center justify-center gap-0.5"
                  >
                    {col.label}
                    <SortArrows />
                  </button>
                </th>
              ))}
              <th className={thClass}>Service &amp; Maintenance</th>
            </tr>
          </thead>
          <tbody>
            {loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className={`${tdClass} py-8 text-gray-500`}>
                  Loading vehicle details…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className={`${tdClass} py-8 text-gray-500`}>
                  No vehicle details found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.ouid || row.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className={tdClass}>
                    <span className="cursor-pointer font-medium text-blue-600 hover:underline">
                      {row.vehicleNo || '—'}
                    </span>
                  </td>
                  <td className={`${tdClass} text-left`}>{row.ownerName || '—'}</td>
                  <td className={tdClass}>{row.ownedBy || '—'}</td>
                  <td className={tdClass}>{row.vehicleBrand || '—'}</td>
                  <td className={tdClass}>{row.vehicleModel || '—'}</td>
                  <td className={tdClass}>{row.vehicleBody || '—'}</td>
                  <td className={tdClass}>{row.capacity ?? 0}</td>
                  <td className={tdClass}>{row.manufactureDate || '—'}</td>
                  <td className={tdClass}>{row.purchaseDate || '—'}</td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      onClick={() => setMaintenanceRow(row)}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 border border-gray-300 border-t-0 bg-white px-3 py-3 text-xs text-gray-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span className="text-center sm:text-left">
          Showing {start} to {end} of {total} entries
        </span>
        <div className="flex flex-wrap items-center justify-center gap-1">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              className={`min-w-[28px] rounded border px-2 py-1 ${
                p === safePage ? 'border-transparent text-white' : 'border-gray-300 bg-white'
              }`}
              style={p === safePage ? { backgroundColor: PURPLE } : undefined}
            >
              {p}
            </button>
          ))}
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border border-gray-300 px-2 py-1 disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>

      {maintenanceRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMaintenanceRow(null)}
          onKeyDown={(e) => e.key === 'Escape' && setMaintenanceRow(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="maintenance-title"
          >
            <h3 id="maintenance-title" className="mb-4 text-lg font-semibold text-gray-900">
              Service &amp; Maintenance — {maintenanceRow.vehicleNo || maintenanceRow.ouid}
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <dt className="text-gray-600">Expense Cost</dt>
                <dd className="font-medium text-gray-900">{formatCost(maintenanceRow.expenseCost)}</dd>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <dt className="text-gray-600">Maintenance Cost</dt>
                <dd className="font-medium text-gray-900">{formatCost(maintenanceRow.maintainanceCost)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Vehicle ULIP</dt>
                <dd className="font-medium text-gray-900">{maintenanceRow.vehicleUlip || '—'}</dd>
              </div>
            </dl>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setMaintenanceRow(null)}
                className="rounded px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: PURPLE }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
