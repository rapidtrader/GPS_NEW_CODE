import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createUser,
  fetchSavedVehicles,
  fetchUsers,
  fetchVehicleNumbers,
  updateUser,
} from '../api';
import { DEFAULT_USER_MODULES, USER_MODULES } from '../config/modules';
import { getModuleLabel } from '../utils/access';
import { PURPLE } from '../utils/vehicleUtils';

const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'phoneNumber', label: 'Phone', sortable: true },
  { key: 'username', label: 'Username', sortable: true },
  { key: 'role', label: 'Role', sortable: true },
  { key: 'vehicleNo', label: 'Vehicle No.', sortable: true },
  { key: 'modules', label: 'Modules', sortable: true },
  { key: 'created', label: 'Created', sortable: true },
  { key: 'action', label: 'Action', sortable: false },
];

function SortIcon() {
  return (
    <span className="ml-1 inline-flex flex-col leading-none opacity-70">
      <svg className="h-2 w-2" viewBox="0 0 8 5" fill="currentColor"><path d="M4 0l4 5H0z" /></svg>
      <svg className="h-2 w-2 -mt-0.5" viewBox="0 0 8 5" fill="currentColor"><path d="M4 5L0 0h8z" /></svg>
    </span>
  );
}

function VehicleNoDropdown({ options, value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function toggleOption(vehicleNo) {
    if (value.includes(vehicleNo)) {
      onChange(value.filter((v) => v !== vehicleNo));
    } else {
      onChange([...value, vehicleNo]);
    }
  }

  const label =
    value.length === 0
      ? 'Select Vehicle No.'
      : value.length === 1
        ? value[0]
        : `${value.length} vehicles selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm text-black focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        <span className={value.length === 0 ? 'text-gray-400' : 'text-black'}>{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-500 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-10 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg">
          {options.map((vehicleNo) => {
            const checked = value.includes(vehicleNo);
            return (
              <button
                key={vehicleNo}
                type="button"
                onClick={() => toggleOption(vehicleNo)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-gray-50 ${
                  checked ? 'bg-blue-50' : ''
                }`}
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white'
                  }`}
                >
                  {checked && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="font-medium text-black">{vehicleNo}</span>
              </button>
            );
          })}
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {value.map((vehicleNo) => (
            <span
              key={vehicleNo}
              className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
            >
              {vehicleNo}
              <button
                type="button"
                onClick={() => toggleOption(vehicleNo)}
                className="text-blue-500 hover:text-blue-700"
                aria-label={`Remove ${vehicleNo}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleAccessCheckboxes({ value, onChange, disabled }) {
  function toggleModule(moduleKey) {
    if (value.includes(moduleKey)) {
      onChange(value.filter((key) => key !== moduleKey));
    } else {
      onChange([...value, moduleKey]);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {USER_MODULES.map(({ key, label }) => {
        const checked = value.includes(key);
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
            } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggleModule(key)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="font-medium text-black">{label}</span>
          </label>
        );
      })}
    </div>
  );
}

function Chip({ children, tone = 'blue' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    purple: 'bg-purple-50 text-purple-700 ring-purple-200',
    gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${tones[tone] || tones.blue}`}
    >
      {children}
    </span>
  );
}

function ChipList({ items, tone = 'blue', empty = '--', align = 'center' }) {
  if (!items?.length) {
    return <span className="text-gray-400">{empty}</span>;
  }

  return (
    <div className={`flex flex-wrap gap-1 py-0.5 ${align === 'start' ? 'justify-start' : 'justify-center'}`}>
      {items.map((item) => (
        <Chip key={item} tone={tone}>
          {item}
        </Chip>
      ))}
    </div>
  );
}

function UserCard({ user, ouidToNo, onEdit }) {
  const numbers = resolveVehicleNumbers(user.vehicleAccess, ouidToNo);
  const modules = user.moduleAccess || DEFAULT_USER_MODULES;

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-black">{user.name || '--'}</h3>
          <p className="mt-0.5 truncate text-xs text-gray-500">{user.username}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
            {user.role}
          </span>
          {user.role === 'user' && (
            <button
              type="button"
              onClick={() => onEdit(user)}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-black hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <dl className="mt-3 space-y-2 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <div>
            <dt className="font-medium text-gray-500">Phone</dt>
            <dd className="text-black">{user.phoneNumber || '--'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Created</dt>
            <dd className="text-black">
              {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '--'}
            </dd>
          </div>
        </div>

        <div>
          <dt className="mb-1 font-medium text-gray-500">Vehicles</dt>
          <dd>
            {user.role === 'admin' ? (
              <ChipList items={['All vehicles']} tone="gray" align="start" />
            ) : (
              <ChipList items={numbers} tone="blue" align="start" />
            )}
          </dd>
        </div>

        <div>
          <dt className="mb-1 font-medium text-gray-500">Modules</dt>
          <dd>
            {user.role === 'admin' ? (
              <ChipList items={['All modules']} tone="gray" align="start" />
            ) : (
              <div className="flex flex-wrap gap-1">
                {modules.map((key) => (
                  <Chip key={key} tone="purple">
                    {getModuleLabel(key)}
                  </Chip>
                ))}
              </div>
            )}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function resolveVehicleNumbers(vehicleAccess, ouidToNo) {
  if (!vehicleAccess?.length) return [];
  return vehicleAccess.map((item) => ouidToNo.get(item) || item);
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [vehicleNumbers, setVehicleNumbers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [editingUser, setEditingUser] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    username: '',
    name: '',
    phoneNumber: '',
    password: '',
    vehicleAccess: [],
    moduleAccess: [...DEFAULT_USER_MODULES],
  });
  const [search, setSearch] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const vehicleNoList = useMemo(() => {
    if (vehicleNumbers.length > 0) return vehicleNumbers;
    const seen = new Set();
    return vehicles
      .map((v) => v.vehicleNo)
      .filter((no) => {
        if (!no || seen.has(no)) return false;
        seen.add(no);
        return true;
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [vehicleNumbers, vehicles]);

  const ouidToNo = useMemo(() => {
    const map = new Map();
    vehicles.forEach((v) => {
      if (v.ouid && v.vehicleNo) map.set(v.ouid, v.vehicleNo);
    });
    return map;
  }, [vehicles]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchUsers();
      setUsers(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    try {
      const [numbersResult, savedResult] = await Promise.all([
        fetchVehicleNumbers().catch(() => ({ data: [] })),
        fetchSavedVehicles().catch(() => ({ data: [] })),
      ]);
      setVehicleNumbers(numbersResult.data || []);
      setVehicles(savedResult.data || []);
    } catch (err) {
      setError(err.message);
      setVehicleNumbers([]);
      setVehicles([]);
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadVehicles();
  }, [loadUsers, loadVehicles]);

  function openAddModal() {
    setModalMode('add');
    setEditingUser(null);
    setForm({
      username: '',
      name: '',
      phoneNumber: '',
      password: '',
      vehicleAccess: [],
      moduleAccess: [...DEFAULT_USER_MODULES],
    });
    setError('');
    setSuccess('');
    setModalOpen(true);
    loadVehicles();
  }

  function openEditModal(user) {
    if (user.role === 'admin') return;
    setModalMode('edit');
    setEditingUser(user);
    setForm({
      username: user.username,
      name: user.name || '',
      phoneNumber: user.phoneNumber || '',
      password: '',
      vehicleAccess: resolveVehicleNumbers(user.vehicleAccess, ouidToNo),
      moduleAccess: user.moduleAccess?.length ? [...user.moduleAccess] : [...DEFAULT_USER_MODULES],
    });
    setError('');
    setSuccess('');
    setModalOpen(true);
    loadVehicles();
  }

  function closeModal() {
    if (submitting) return;
    setModalOpen(false);
    setEditingUser(null);
  }

  function getCellValue(user, key, ouidToNoMap) {
    const numbers = resolveVehicleNumbers(user.vehicleAccess, ouidToNoMap);
    switch (key) {
      case 'name': return user.name || '';
      case 'phoneNumber': return user.phoneNumber || '';
      case 'username': return user.username || '';
      case 'role': return user.role || '';
      case 'vehicleNo':
        return user.role === 'admin' ? 'All vehicles' : numbers.join(', ');
      case 'modules':
        return user.role === 'admin'
          ? 'All modules'
          : (user.moduleAccess || DEFAULT_USER_MODULES).map(getModuleLabel).join(', ');
      case 'created':
        return user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '';
      default: return '';
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = users.map((u) => ({
      ...u,
      _vehicleDisplay: resolveVehicleNumbers(u.vehicleAccess, ouidToNo).join(', '),
    }));

    if (q) {
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.phoneNumber?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q) ||
          u._vehicleDisplay.toLowerCase().includes(q) ||
          (u.moduleAccess || DEFAULT_USER_MODULES).map(getModuleLabel).join(', ').toLowerCase().includes(q)
      );
    }

    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = getCellValue(a, sortKey, ouidToNo);
        const bv = getCellValue(b, sortKey, ouidToNo);
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [users, search, sortKey, sortDir, ouidToNo]);

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

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (modalMode === 'add') {
        await createUser({
          username: form.username,
          password: form.password,
          name: form.name,
          phoneNumber: form.phoneNumber,
          vehicleAccess: form.vehicleAccess,
          moduleAccess: form.moduleAccess,
        });
        setSuccess(`User "${form.name || form.username}" created successfully`);
      } else {
        const payload = {
          name: form.name,
          phoneNumber: form.phoneNumber,
          vehicleAccess: form.vehicleAccess,
          moduleAccess: form.moduleAccess,
        };
        if (form.password.trim()) payload.password = form.password;
        await updateUser(editingUser._id || editingUser.id, payload);
        setSuccess(`User "${form.name || editingUser.username}" updated successfully`);
      }
      setModalOpen(false);
      setForm({
        username: '',
        name: '',
        phoneNumber: '',
        password: '',
        vehicleAccess: [],
        moduleAccess: [...DEFAULT_USER_MODULES],
      });
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="-mx-2 space-y-0 sm:mx-0">
      {error && !modalOpen && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}
      {success && (
        <div className="mb-3 rounded border border-green-400 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3 border border-gray-300 border-b-0 bg-white px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-auto sm:min-w-[16rem] sm:flex-1 sm:max-w-md">
          <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Search users..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full rounded border border-gray-300 py-2 pl-8 pr-3 text-sm text-black placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
            className="w-full rounded border border-gray-300 px-2 py-2 text-xs text-black focus:outline-none sm:py-1.5"
          >
            <option value={10}>10 rows</option>
            <option value={25}>25 rows</option>
            <option value={50}>50 rows</option>
            <option value={100}>100 rows</option>
          </select>
          <button
            type="button"
            onClick={loadUsers}
            disabled={loading}
            className="rounded border border-gray-300 px-2 py-2 text-xs text-black hover:bg-gray-50 disabled:opacity-50 sm:py-1.5"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="col-span-2 rounded border border-gray-300 px-2 py-2 text-xs font-semibold text-black hover:bg-gray-50 sm:col-span-1 sm:py-1.5"
          >
            Add User
          </button>
        </div>
      </div>

      <div className="space-y-3 border border-gray-300 p-3 lg:hidden">
        {loading && users.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading users...</div>
        ) : paginated.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No users found</div>
        ) : (
          paginated.map((u) => (
            <UserCard key={u._id || u.id} user={u} ouidToNo={ouidToNo} onEdit={openEditModal} />
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto border border-gray-300 lg:block">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
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
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-gray-500">
                  Loading users...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              paginated.map((u, i) => {
                const numbers = resolveVehicleNumbers(u.vehicleAccess, ouidToNo);
                return (
                  <tr
                    key={u._id || u.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-[#f0f4f8]'}
                  >
                    <td className={tdClass}>
                      <span className="font-medium text-black">{u.name || '--'}</span>
                    </td>
                    <td className={tdClass}>{u.phoneNumber || '--'}</td>
                    <td className={tdClass}>
                      <span className="font-medium text-blue-600">{u.username}</span>
                    </td>
                    <td className={tdClass}>
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-700">
                        {u.role}
                      </span>
                    </td>
                    <td className={`${tdClass} max-w-[260px] whitespace-normal`}>
                      {u.role === 'admin' ? (
                        <ChipList items={['All vehicles']} tone="gray" empty="--" />
                      ) : (
                        <ChipList items={numbers} tone="blue" />
                      )}
                    </td>
                    <td className={`${tdClass} max-w-[260px] whitespace-normal`}>
                      {u.role === 'admin' ? (
                        <ChipList items={['All modules']} tone="gray" empty="--" />
                      ) : (
                        <div className="flex flex-wrap justify-center gap-1 py-0.5">
                          {(u.moduleAccess || DEFAULT_USER_MODULES).map((key) => (
                            <Chip key={key} tone="purple">
                              {getModuleLabel(key)}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={tdClass}>
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '--'}
                    </td>
                    <td className={tdClass}>
                      {u.role === 'user' ? (
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-black hover:bg-gray-50"
                        >
                          Edit
                        </button>
                      ) : (
                        '--'
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-col gap-3 border border-t-0 border-gray-300 bg-white px-3 py-3 text-xs text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-center sm:text-left">
            Showing {(page - 1) * rowsPerPage + 1}–{Math.min(page * rowsPerPage, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-gray-200 bg-white shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="flex shrink-0 items-start justify-between border-b border-gray-200 px-4 py-4 sm:px-5">
              <div className="min-w-0 pr-3">
                <h3 className="text-lg font-semibold text-black">
                  {modalMode === 'add' ? 'Add User' : 'Edit User'}
                </h3>
                <p className="text-sm text-gray-500">
                  {modalMode === 'add'
                    ? 'Select vehicles and modules for this user.'
                    : `Update details for ${editingUser?.name || editingUser?.username}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="shrink-0 rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-black">Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Enter full name"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-black">Phone Number</span>
                <input
                  type="tel"
                  value={form.phoneNumber}
                  onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                  required
                  placeholder="10 digit mobile number"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:border-blue-500 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-black">Username</span>
                <input
                  type="text"
                  value={form.username}
                  readOnly={modalMode === 'edit'}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  required
                  placeholder="Enter username"
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:border-blue-500 focus:outline-none ${
                    modalMode === 'edit' ? 'bg-gray-50 text-gray-600' : ''
                  }`}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-black">
                  Password{modalMode === 'edit' ? ' (optional)' : ''}
                </span>
                <input
                  type="password"
                  placeholder={modalMode === 'edit' ? 'Leave blank to keep current' : 'Min 6 characters'}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required={modalMode === 'add'}
                  minLength={modalMode === 'add' ? 6 : undefined}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black focus:border-blue-500 focus:outline-none"
                />
              </label>

              <div>
                <span className="mb-1 block text-sm font-medium text-black">Vehicle No.</span>
                {vehiclesLoading ? (
                  <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                    Loading vehicle numbers from database...
                  </p>
                ) : vehicleNoList.length === 0 ? (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-4 text-sm text-amber-800">
                    No vehicle numbers found in database. Sync data from Live Vehicles page first.
                  </p>
                ) : (
                  <VehicleNoDropdown
                    options={vehicleNoList}
                    value={form.vehicleAccess}
                    onChange={(selected) => setForm((prev) => ({ ...prev, vehicleAccess: selected }))}
                    disabled={vehiclesLoading}
                  />
                )}
              </div>

              <div>
                <span className="mb-1 block text-sm font-medium text-black">Module Access</span>
                <p className="mb-2 text-xs text-gray-500">
                  User ko sirf selected modules dikhenge. Har module mein sirf assigned vehicles ka data milega.
                </p>
                <ModuleAccessCheckboxes
                  value={form.moduleAccess}
                  onChange={(selected) => setForm((prev) => ({ ...prev, moduleAccess: selected }))}
                  disabled={submitting}
                />
              </div>

              {error && modalOpen && (
                <div className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-200 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-black hover:bg-gray-50 disabled:opacity-60 sm:w-auto"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    vehicleNoList.length === 0 ||
                    form.vehicleAccess.length === 0 ||
                    form.moduleAccess.length === 0 ||
                    !form.name.trim() ||
                    !form.phoneNumber.trim()
                  }
                  className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60 sm:w-auto"
                >
                  {submitting
                    ? modalMode === 'add'
                      ? 'Creating...'
                      : 'Saving...'
                    : modalMode === 'add'
                      ? 'Create User'
                      : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
