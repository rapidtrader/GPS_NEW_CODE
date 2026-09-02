import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../api';
import { ROUTES } from '../routes/paths';

const PURPLE = '#4a3569';
const PAGE_SIZE = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status) {
  return status === 'active' ? 'Active' : 'Inactive';
}

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        isActive
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-gray-100 text-gray-500'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors =
    type === 'success'
      ? 'bg-emerald-600 text-white'
      : 'bg-red-600 text-white';

  return (
    <div
      className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${colors}`}
    >
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Modal Form ──────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  projectId: '',
  projectName: '',
  status: 'active',
  sweepingSpeedLimit: '8',
  completionThreshold: '90',
};

function ProjectModal({ mode, initial, onSave, onClose, saving }) {
  const [form, setForm] = useState(() =>
    mode === 'edit' && initial
      ? {
          projectId: initial.projectId || '',
          projectName: initial.projectName || '',
          status: initial.status || 'active',
          sweepingSpeedLimit: String(initial.settings?.sweepingSpeedLimit ?? 8),
          completionThreshold: String(initial.settings?.completionThreshold ?? 90),
        }
      : { ...EMPTY_FORM }
  );
  const [errors, setErrors] = useState({});

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.projectId.trim()) errs.projectId = 'Project ID is required';
    if (!form.projectName.trim()) errs.projectName = 'Project name is required';
    const speed = Number(form.sweepingSpeedLimit);
    if (form.sweepingSpeedLimit !== '' && (isNaN(speed) || speed < 0))
      errs.sweepingSpeedLimit = 'Must be a valid non-negative number';
    const threshold = Number(form.completionThreshold);
    if (form.completionThreshold !== '' && (isNaN(threshold) || threshold < 0 || threshold > 100))
      errs.completionThreshold = 'Must be between 0 and 100';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    onSave({
      projectId: form.projectId.trim(),
      projectName: form.projectName.trim(),
      status: form.status,
      settings: {
        sweepingSpeedLimit: form.sweepingSpeedLimit !== '' ? Number(form.sweepingSpeedLimit) : 8,
        completionThreshold: form.completionThreshold !== '' ? Number(form.completionThreshold) : 90,
      },
    });
  }

  const isEdit = mode === 'edit';
  const title = isEdit ? 'Edit Project' : 'Add Project';

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 transition-colors';
  const labelClass = 'mb-1 block text-xs font-semibold text-gray-600';
  const errClass = 'mt-1 text-xs text-red-500';

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div
          className="flex items-center justify-between rounded-t-2xl px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
        >
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-5 py-5">

            {/* Project ID */}
            <div>
              <label className={labelClass}>
                Project ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`${inputClass} ${errors.projectId ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''} ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                placeholder="e.g. PRJ-001"
                value={form.projectId}
                onChange={(e) => set('projectId', e.target.value)}
                disabled={isEdit}
                readOnly={isEdit}
              />
              {errors.projectId && <p className={errClass}>{errors.projectId}</p>}
              {isEdit && (
                <p className="mt-1 text-[0.7rem] text-gray-400">
                  Project ID cannot be changed after creation.
                </p>
              )}
            </div>

            {/* Project Name */}
            <div>
              <label className={labelClass}>
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`${inputClass} ${errors.projectName ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}`}
                placeholder="e.g. Delhi Road Sweeping"
                value={form.projectName}
                onChange={(e) => set('projectName', e.target.value)}
              />
              {errors.projectName && <p className={errClass}>{errors.projectName}</p>}
            </div>

            {/* Status */}
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Speed Limit</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    className={`${inputClass} pr-14 ${errors.sweepingSpeedLimit ? 'border-red-400' : ''}`}
                    placeholder="8"
                    value={form.sweepingSpeedLimit}
                    onChange={(e) => set('sweepingSpeedLimit', e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    KM/H
                  </span>
                </div>
                {errors.sweepingSpeedLimit && <p className={errClass}>{errors.sweepingSpeedLimit}</p>}
              </div>
              <div>
                <label className={labelClass}>Completion %</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className={`${inputClass} pr-7 ${errors.completionThreshold ? 'border-red-400' : ''}`}
                    placeholder="90"
                    value={form.completionThreshold}
                    onChange={(e) => set('completionThreshold', e.target.value)}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    %
                  </span>
                </div>
                {errors.completionThreshold && <p className={errClass}>{errors.completionThreshold}</p>}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60"
              style={{ background: saving ? '#9b8ab0' : `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
            >
              {saving && (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              )}
              {saving ? 'Saving…' : isEdit ? 'Update Project' : 'Save Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ project, onConfirm, onClose, deleting }) {
  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="px-5 py-5">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-base font-bold text-gray-900">Delete Project</h3>
          <p className="mt-2 text-sm text-gray-500">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-gray-800">{project.projectName}</span>{' '}
            ({project.projectId})? This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
          >
            {deleting && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  // Modal state
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', project }
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState(null); // { message, type }

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProjects();
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load projects');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Filter ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.projectId?.toLowerCase().includes(q) ||
          r.projectName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // ── Save (Add / Edit) ─────────────────────────────────────────────────────

  async function handleSave(formData) {
    setSaving(true);
    try {
      if (modal.mode === 'add') {
        await createProject(formData);
        showToast('Project created successfully');
      } else {
        await updateProject(modal.project.projectId, {
          projectName: formData.projectName,
          status: formData.status,
          settings: formData.settings,
        });
        showToast('Project updated successfully');
      }
      setModal(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Operation failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProject(deleteTarget.projectId);
      showToast('Project deleted successfully');
      setDeleteTarget(null);
      await load();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    } finally {
      setDeleting(false);
    }
  }

  // ── UI Helpers ────────────────────────────────────────────────────────────

  const thClass =
    'border border-[#6b5489] px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdClass =
    'border border-gray-300 px-3 py-2 text-center text-xs text-black whitespace-nowrap';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Modals */}
      {modal && (
        <ProjectModal
          mode={modal.mode}
          initial={modal.project}
          onSave={handleSave}
          onClose={() => !saving && setModal(null)}
          saving={saving}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          project={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onClose={() => !deleting && setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      {/* Error Banner */}
      {error && (
        <div className="mb-3 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 border border-gray-300 border-b-0 bg-white px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-auto sm:min-w-[16rem] sm:flex-1 sm:max-w-md">
          <svg
            className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Search by ID or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {/* Status filter + refresh + add */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>

          <button
            onClick={() => setModal({ mode: 'add' })}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Project
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse border border-gray-300 bg-white text-xs">
          <thead>
            <tr style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
              <th className={thClass}>#</th>
              <th className={thClass}>Project ID</th>
              <th className={thClass}>Project Name</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Speed Limit</th>
              <th className={thClass}>Completion %</th>
              <th className={thClass}>Created</th>
              <th className={thClass}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Loading projects…
                  </div>
                </td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-gray-400">
                  {search || statusFilter !== 'all'
                    ? 'No projects match your search.'
                    : 'No projects yet. Click "Add Project" to create one.'}
                </td>
              </tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr
                  key={row._id}
                  className="even:bg-gray-50 hover:bg-violet-50 transition-colors"
                >
                  <td className={tdClass}>{(safePage - 1) * PAGE_SIZE + idx + 1}</td>
                  <td className={`${tdClass} font-mono font-medium`}>{row.projectId}</td>
                  <td className={`${tdClass} text-left font-medium`}>{row.projectName}</td>
                  <td className={tdClass}>
                    <StatusBadge status={row.status} />
                  </td>
                  <td className={tdClass}>{row.settings?.sweepingSpeedLimit ?? '—'} KM/H</td>
                  <td className={tdClass}>{row.settings?.completionThreshold ?? '—'}%</td>
                  <td className={tdClass}>
                    {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className={tdClass}>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => navigate(`/projects/${row.projectId}`)}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        View
                      </button>
                      <button
                        onClick={() => setModal({ mode: 'edit', project: row })}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-blue-700 ring-1 ring-blue-300 hover:bg-blue-50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(row)}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-red-600 ring-1 ring-red-300 hover:bg-red-50 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="lg:hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
            <svg className="h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Loading…
          </div>
        ) : pageRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {search || statusFilter !== 'all'
              ? 'No projects match your search.'
              : 'No projects yet. Click "Add Project" to create one.'}
          </div>
        ) : (
          <div className="space-y-3 p-3">
            {pageRows.map((row) => (
              <article
                key={row._id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-gray-900">{row.projectName}</h3>
                    <p className="mt-0.5 font-mono text-xs text-gray-500">{row.projectId}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="font-medium text-gray-500">Speed Limit</dt>
                    <dd className="text-black">{row.settings?.sweepingSpeedLimit ?? '—'} KM/H</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Completion</dt>
                    <dd className="text-black">{row.settings?.completionThreshold ?? '—'}%</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-500">Created</dt>
                    <dd className="text-black">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString('en-IN') : '—'}
                    </dd>
                  </div>
                </dl>

                <div className="mt-3 flex gap-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => navigate(`/projects/${row.projectId}`)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50 transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setModal({ mode: 'edit', project: row })}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(row)}
                    className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-300 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between border border-gray-300 border-t-0 bg-white px-3 py-2 text-xs text-gray-500">
          <span>
            Showing {filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              ‹
            </button>
            <span className="px-2 py-1 font-medium">
              {safePage} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="rounded border border-gray-300 px-2 py-1 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
