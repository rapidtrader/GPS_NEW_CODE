import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchDriverList } from '../api';

const PURPLE = '#4a3569';
const PAGE_SIZE = 10;

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'transUsername', label: 'Transporter' },
  { key: 'vehicleNo', label: 'Vehicle' },
  { key: 'enabled', label: 'Active', type: 'active' },
  { key: 'assigned', label: 'Assigned', type: 'assigned' },
  { key: 'dateOfJoining', label: 'D.O.J' },
  { key: 'dateOfLeaving', label: 'D.O.L' },
  { key: 'insuranceNo', label: 'Insurance No' },
  { key: 'insuranceExpiry', label: 'Insurance Expiry Date' },
  { key: 'licenseAvailable', label: 'License Available', type: 'license' },
  { key: 'licenseNumber', label: 'License Number' },
  { key: 'licenseType', label: 'License Type' },
  { key: 'licenseIssue', label: 'License Issue' },
  { key: 'licenseExpiry', label: 'License Expiry Date' },
  { key: 'mediclaimNo', label: 'Mediclaim No' },
  { key: 'mediclaimExpiry', label: 'Mediclaim Expiry Date' },
  { key: 'experience', label: 'Experience', numeric: true },
  { key: 'age', label: 'Age', numeric: true },
  { key: 'phoneNo', label: 'Phone No' },
  { key: 'address', label: 'Address' },
  { key: 'bloodGroup', label: 'Blood Group', nullable: true },
  { key: 'supervisorName', label: 'Supervisor Name', nullable: true },
  { key: 'supervisorPhone', label: 'Supervisor Phone No.', nullable: true },
];

function SortArrows() {
  return (
    <span className="ml-1 inline-flex flex-col text-[0.5rem] leading-none opacity-80">
      <span>▲</span>
      <span>▼</span>
    </span>
  );
}

function driverName(row) {
  const name = `${(row.firstName || '').trim()} ${(row.lastName || '').trim()}`.trim();
  return name || '—';
}

function cellValue(row, col) {
  if (col.key === 'name') return driverName(row);
  const value = row[col.key];
  if (col.nullable && (value == null || value === '')) return '--';
  if (value == null || value === '') return '';
  return value;
}

function ActiveBadge({ enabled }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[0.65rem] font-bold text-white ${
        enabled ? 'bg-emerald-500' : 'bg-gray-400'
      }`}
      title={enabled ? 'Active' : 'Inactive'}
    >
      {enabled ? 'A' : 'I'}
    </span>
  );
}

function AssignedBadge({ assigned }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[0.65rem] font-bold text-white ${
        assigned ? 'bg-emerald-500' : 'bg-orange-400'
      }`}
      title={assigned ? 'Assigned' : 'Not assigned'}
    >
      {assigned ? 'Y' : 'N'}
    </span>
  );
}

function LicenseBadge({ available }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-sm text-[0.65rem] font-bold text-white ${
        available ? 'bg-lime-500' : 'bg-red-400'
      }`}
      title={available ? 'License available' : 'No license'}
    >
      {available ? 'Y' : 'N'}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}

function DriverCard({ row }) {
  const primaryFields = [
    { label: 'Transporter', value: row.transUsername },
    { label: 'Vehicle', value: row.vehicleNo },
    { label: 'Phone', value: row.phoneNo },
    { label: 'Experience', value: row.experience != null ? `${row.experience} yrs` : '' },
    { label: 'Age', value: row.age },
    { label: 'Blood Group', value: row.bloodGroup || '--' },
  ];

  const licenseFields = [
    { label: 'License No.', value: row.licenseNumber },
    { label: 'License Type', value: row.licenseType },
    { label: 'License Issue', value: row.licenseIssue },
    { label: 'License Expiry', value: row.licenseExpiry },
  ];

  const otherFields = [
    { label: 'D.O.J', value: row.dateOfJoining },
    { label: 'D.O.L', value: row.dateOfLeaving },
    { label: 'Insurance No.', value: row.insuranceNo },
    { label: 'Insurance Expiry', value: row.insuranceExpiry },
    { label: 'Mediclaim No.', value: row.mediclaimNo },
    { label: 'Mediclaim Expiry', value: row.mediclaimExpiry },
    { label: 'Supervisor', value: row.supervisorName || '--' },
    { label: 'Supervisor Phone', value: row.supervisorPhone || '--' },
  ];

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-blue-600">{driverName(row)}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{row.vehicleNo || 'No vehicle assigned'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ActiveBadge enabled={row.enabled} />
          <AssignedBadge assigned={row.assigned} />
          <LicenseBadge available={row.licenseAvailable} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        {primaryFields.map(({ label, value }) => (
          <div key={label}>
            <dt className="font-medium text-gray-500">{label}</dt>
            <dd className="text-black">{value || '--'}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400">License</p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {licenseFields.map(({ label, value }) => (
            <div key={label}>
              <dt className="font-medium text-gray-500">{label}</dt>
              <dd className="text-black">{value || '--'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          {otherFields.map(({ label, value }) => (
            <div key={label}>
              <dt className="font-medium text-gray-500">{label}</dt>
              <dd className="text-black">{value || '--'}</dd>
            </div>
          ))}
        </dl>
      </div>

      {row.address && (
        <div className="mt-3 border-t border-gray-100 pt-3 text-xs">
          <dt className="font-medium text-gray-500">Address</dt>
          <dd className="mt-1 text-black">{row.address}</dd>
        </div>
      )}
    </article>
  );
}

export default function DriverList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchDriverList();
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load driver list');
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
      COLUMNS.some((col) => String(cellValue(row, col)).toLowerCase().includes(q))
        || driverName(row).toLowerCase().includes(q)
    );
  }, [rows, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const col = COLUMNS.find((c) => c.key === sortKey);
    list.sort((a, b) => {
      let av = sortKey === 'name' ? driverName(a) : a[sortKey];
      let bv = sortKey === 'name' ? driverName(b) : b[sortKey];
      if (col?.numeric) {
        const diff = Number(av) - Number(bv);
        return sortDir === 'asc' ? diff : -diff;
      }
      if (typeof av === 'boolean') av = av ? '1' : '0';
      if (typeof bv === 'boolean') bv = bv ? '1' : '0';
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
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

  function renderCell(row, col) {
    if (col.type === 'active') return <ActiveBadge enabled={row.enabled} />;
    if (col.type === 'assigned') return <AssignedBadge assigned={row.assigned} />;
    if (col.type === 'license') return <LicenseBadge available={row.licenseAvailable} />;
    if (col.key === 'name') {
      return (
        <span className="cursor-pointer font-medium text-blue-600 hover:underline">
          {driverName(row)}
        </span>
      );
    }
    return cellValue(row, col) || '\u00A0';
  }

  const thClass =
    'border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdClass = 'border border-gray-300 px-2 py-1.5 text-center text-xs text-black whitespace-nowrap';

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
          <div className="py-8 text-center text-sm text-gray-500">Loading driver list…</div>
        ) : pageRows.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">No drivers found.</div>
        ) : (
          pageRows.map((row, idx) => (
            <DriverCard key={row.id || idx} row={row} />
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto border border-gray-300 lg:block">
        <table className="w-full min-w-[2200px] border-collapse text-sm">
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
              <th className={thClass}>
                <span className="inline-flex items-center justify-center">
                  <SortArrows />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className={`${tdClass} py-8 text-gray-500`}>
                  Loading driver list…
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className={`${tdClass} py-8 text-gray-500`}>
                  No drivers found.
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`${tdClass}${col.key === 'address' ? ' max-w-[160px] truncate' : ''}`}
                      title={col.key === 'address' ? row.address : undefined}
                    >
                      {renderCell(row, col)}
                    </td>
                  ))}
                  <td className={tdClass}>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center text-blue-600 hover:text-blue-800"
                      title="Delete (read-only)"
                      disabled
                    >
                      <TrashIcon />
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
    </div>
  );
}
