import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchRoads, fetchProjects, fetchMachines, deleteRoad, updateRoad } from '../api';

const PURPLE = '#4a3569';
const PAGE_SIZE = 10;

const FREQ_LABELS = { daily: 'Daily', alternate: 'Alternate', specific: 'Specific' };

function StatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      <span className={`mr-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function FreqBadge({ type }) {
  const colors = {
    daily:    'bg-blue-50 text-blue-700',
    alternate:'bg-amber-50 text-amber-700',
    specific: 'bg-violet-50 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[type] || 'bg-gray-100 text-gray-600'}`}>
      {FREQ_LABELS[type] || type}
    </span>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ── Deactivate Confirm Modal ──────────────────────────────────────────────────
function DeactivateModal({ road, onConfirm, onClose, loading }) {
  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="px-5 py-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-gray-900">Deactivate Road</h3>
          <p className="mt-2 text-sm text-gray-500">
            Road <span className="font-semibold text-gray-800">{road.roadName}</span> ({road.roadId}) will be set to <strong>inactive</strong>. It can be reactivated later via Edit.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button onClick={onClose} disabled={loading} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60">
            {loading && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
            {loading ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function RoadList() {
  const navigate = useNavigate();
  const [rows, setRows]           = useState([]);
  const [projects, setProjects]   = useState([]);
  const [machinesByProject, setMachinesByProject] = useState({}); // { projectId: [machine, ...] }
  const [savingMachine, setSavingMachine] = useState({}); // { roadId: true/false }
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [page, setPage]           = useState(1);
  const [toast, setToast]         = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [deactivating, setDeactivating]         = useState(false);

  // Filters
  const [filterProject,  setFilterProject]  = useState('');
  const [filterStatus,   setFilterStatus]   = useState('');
  const [filterArea,     setFilterArea]     = useState('');
  const [filterColony,   setFilterColony]   = useState('');
  const [filterFreq,     setFilterFreq]     = useState('');

  function showToast(msg, type = 'success') { setToast({ message: msg, type }); }

  // ── Inline machine assignment ───────────────────────────────────────────────
  async function handleMachineChange(road, machineId) {
    setSavingMachine((s) => ({ ...s, [road.roadId]: true }));
    try {
      await updateRoad(road.roadId, { assignedMachineId: machineId });
      setRows((prev) =>
        prev.map((r) => r.roadId === road.roadId ? { ...r, assignedMachineId: machineId } : r)
      );
      showToast(`Machine updated for ${road.roadName}`);
    } catch (err) {
      showToast(err.message || 'Failed to update machine', 'error');
    } finally {
      setSavingMachine((s) => ({ ...s, [road.roadId]: false }));
    }
  }

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [roadsRes, projRes] = await Promise.all([
        fetchRoads(),
        fetchProjects(),
      ]);
      const roadList = Array.isArray(roadsRes.data) ? roadsRes.data : [];
      const projList = Array.isArray(projRes.data)  ? projRes.data  : [];
      setRows(roadList);
      setProjects(projList);

      // Fetch machines for every unique project that has roads
      const uniqueProjectIds = [...new Set(roadList.map((r) => r.projectId).filter(Boolean))];
      const machineResults = await Promise.all(
        uniqueProjectIds.map((pid) =>
          fetchMachines({ projectId: pid, status: 'active' })
            .then((res) => ({ pid, machines: Array.isArray(res.data) ? res.data : [] }))
            .catch(() => ({ pid, machines: [] }))
        )
      );
      const byProject = {};
      machineResults.forEach(({ pid, machines }) => { byProject[pid] = machines; });
      setMachinesByProject(byProject);
    } catch (err) {
      setError(err.message || 'Failed to load roads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // project lookup map
  const projectMap = useMemo(() => {
    const m = {};
    projects.forEach((p) => { m[p.projectId] = p.projectName; });
    return m;
  }, [projects]);

  // unique area / colony options from loaded data
  const areaOptions    = useMemo(() => [...new Set(rows.map((r) => r.areaName).filter(Boolean))].sort(), [rows]);
  const colonyOptions  = useMemo(() => [...new Set(rows.map((r) => r.colonyName).filter(Boolean))].sort(), [rows]);

  // ── Client-side filter ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = rows;
    if (filterProject)  list = list.filter((r) => r.projectId  === filterProject);
    if (filterStatus)   list = list.filter((r) => r.status     === filterStatus);
    if (filterArea)     list = list.filter((r) => r.areaName   === filterArea);
    if (filterColony)   list = list.filter((r) => r.colonyName === filterColony);
    if (filterFreq)     list = list.filter((r) => r.sweepingFrequency?.type === filterFreq);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.roadId?.toLowerCase().includes(q)    ||
        r.roadName?.toLowerCase().includes(q)  ||
        r.areaName?.toLowerCase().includes(q)  ||
        r.colonyName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterProject, filterStatus, filterArea, filterColony, filterFreq, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterProject, filterStatus, filterArea, filterColony, filterFreq]);

  // ── Deactivate ─────────────────────────────────────────────────────────────
  async function handleDeactivateConfirm() {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await deleteRoad(deactivateTarget.roadId);
      showToast('Road deactivated successfully');
      setDeactivateTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Deactivate failed', 'error');
    } finally {
      setDeactivating(false);
    }
  }

  function clearFilters() {
    setFilterProject(''); setFilterStatus('');
    setFilterArea('');    setFilterColony('');
    setFilterFreq('');    setSearch('');
  }
  const hasFilters = filterProject || filterStatus || filterArea || filterColony || filterFreq || search;

  // ── Table classes ──────────────────────────────────────────────────────────
  const thCls = 'border border-[#6b5489] px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdCls = 'border border-gray-300 px-3 py-2 text-center text-xs text-black whitespace-nowrap';

  return (
    <div className="space-y-0">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      {deactivateTarget && (
        <DeactivateModal
          road={deactivateTarget}
          onConfirm={handleDeactivateConfirm}
          onClose={() => !deactivating && setDeactivateTarget(null)}
          loading={deactivating}
        />
      )}

      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 border border-gray-300 border-b-0 bg-white px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-auto sm:min-w-[14rem] sm:flex-1 sm:max-w-sm">
          <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Search road…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project filter */}
          <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100">
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
            ))}
          </select>

          <select value={filterArea} onChange={(e) => setFilterArea(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100">
            <option value="">All Areas</option>
            {areaOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select value={filterColony} onChange={(e) => setFilterColony(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100">
            <option value="">All Colonies</option>
            {colonyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterFreq} onChange={(e) => setFilterFreq(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100">
            <option value="">All Frequencies</option>
            <option value="daily">Daily</option>
            <option value="alternate">Alternate</option>
            <option value="specific">Specific</option>
          </select>

          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100">
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {hasFilters && (
            <button onClick={clearFilters}
              className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors">
              Clear ✕
            </button>
          )}

          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>

          <button onClick={() => navigate('/roads/create')}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Road
          </button>
        </div>
      </div>

      {/* ── Desktop Table ── */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse border border-gray-300 bg-white text-xs">
          <thead>
            <tr style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
              <th className={thCls}>#</th>
              <th className={thCls}>Road ID</th>
              <th className={thCls}>Road Name</th>
              <th className={thCls}>Project</th>
              <th className={thCls}>Area</th>
              <th className={thCls}>Colony</th>
              <th className={thCls}>Length</th>
              <th className={thCls}>Frequency</th>
              <th className={thCls}>Machine</th>
              <th className={thCls}>Status</th>
              <th className={thCls}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Loading roads…
                  </div>
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-sm text-gray-400">
                  {hasFilters ? 'No roads match your filters.' : 'No roads yet. Click "Add Road" to create one.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row._id} className="even:bg-gray-50 hover:bg-violet-50 transition-colors">
                  <td className={tdCls}>{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className={`${tdCls} font-mono font-medium`}>{row.roadId}</td>
                  <td className={`${tdCls} text-left font-medium`}>{row.roadName}</td>
                  <td className={tdCls}>{projectMap[row.projectId] || row.projectId}</td>
                  <td className={tdCls}>{row.areaName}</td>
                  <td className={tdCls}>{row.colonyName}</td>
                  <td className={tdCls}>{row.totalLength} KM</td>
                  <td className={tdCls}>
                    <FreqBadge type={row.sweepingFrequency?.type} />
                  </td>
                  {/* Inline Machine dropdown */}
                  <td className={tdCls} style={{ minWidth: '130px' }}>
                    <div className="relative">
                      <select
                        value={row.assignedMachineId || ''}
                        onChange={(e) => handleMachineChange(row, e.target.value)}
                        disabled={savingMachine[row.roadId]}
                        className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-[0.65rem] text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 disabled:opacity-60"
                      >
                        <option value="">— None —</option>
                        {(machinesByProject[row.projectId] || []).map((m) => (
                          <option key={m.machineId} value={m.machineId}>
                            {m.machineId}
                          </option>
                        ))}
                      </select>
                      {savingMachine[row.roadId] && (
                        <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2">
                          <svg className="h-3 w-3 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                        </span>
                      )}
                    </div>
                  </td>
                  <td className={tdCls}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={tdCls}>
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => navigate(`/roads/${row.roadId}`)}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50 transition-colors">
                        View
                      </button>
                      <button onClick={() => navigate(`/roads/${row.roadId}/edit`)}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-blue-700 ring-1 ring-blue-300 hover:bg-blue-50 transition-colors">
                        Edit
                      </button>
                      {row.status === 'active' && (
                        <button onClick={() => setDeactivateTarget(row)}
                          className="rounded px-2 py-1 text-[0.65rem] font-semibold text-amber-600 ring-1 ring-amber-300 hover:bg-amber-50 transition-colors">
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Mobile Cards ── */}
      <div className="lg:hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <svg className="h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
            Loading…
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {hasFilters ? 'No roads match your filters.' : 'No roads yet.'}
          </div>
        ) : (
          <div className="space-y-3 p-3">
            {pageRows.map((row) => (
              <article key={row._id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{row.roadName}</h3>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">{row.roadId}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="font-medium text-gray-500">Project</dt><dd>{projectMap[row.projectId] || row.projectId}</dd></div>
                  <div><dt className="font-medium text-gray-500">Area</dt><dd>{row.areaName}</dd></div>
                  <div><dt className="font-medium text-gray-500">Colony</dt><dd>{row.colonyName}</dd></div>
                  <div><dt className="font-medium text-gray-500">Length</dt><dd>{row.totalLength} KM</dd></div>
                  <div><dt className="font-medium text-gray-500">Frequency</dt><dd><FreqBadge type={row.sweepingFrequency?.type} /></dd></div>
                </dl>
                {/* Inline machine dropdown — mobile */}
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Assigned Machine</label>
                  <div className="relative">
                    <select
                      value={row.assignedMachineId || ''}
                      onChange={(e) => handleMachineChange(row, e.target.value)}
                      disabled={savingMachine[row.roadId]}
                      className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200 disabled:opacity-60"
                    >
                      <option value="">— None —</option>
                      {(machinesByProject[row.projectId] || []).map((m) => (
                        <option key={m.machineId} value={m.machineId}>
                          {m.machineId} — {m.machineName}
                        </option>
                      ))}
                    </select>
                    {savingMachine[row.roadId] && (
                      <span className="pointer-events-none absolute right-7 top-1/2 -translate-y-1/2">
                        <svg className="h-3 w-3 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                  <button onClick={() => navigate(`/roads/${row.roadId}`)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50 transition-colors">View</button>
                  <button onClick={() => navigate(`/roads/${row.roadId}/edit`)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-300 hover:bg-blue-50 transition-colors">Edit</button>
                  {row.status === 'active' && (
                    <button onClick={() => setDeactivateTarget(row)}
                      className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-amber-600 ring-1 ring-amber-300 hover:bg-amber-50 transition-colors">Deactivate</button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between border border-gray-300 border-t-0 bg-white px-3 py-2 text-xs text-gray-500">
          <span>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40">‹</button>
            <span className="px-2 py-1 font-medium">{safePage} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40">›</button>
          </div>
        </div>
      )}
    </div>
  );
}
