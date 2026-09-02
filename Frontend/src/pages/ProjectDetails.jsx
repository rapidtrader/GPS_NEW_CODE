import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchProject, updateProject } from '../api';

const PURPLE = '#4a3569';

function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
      }`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}
      />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-[0.7rem] text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div
      className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Quick Edit Modal ─────────────────────────────────────────────────────────

function EditModal({ project, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    projectName: project.projectName || '',
    status: project.status || 'active',
    sweepingSpeedLimit: String(project.settings?.sweepingSpeedLimit ?? 8),
    completionThreshold: String(project.settings?.completionThreshold ?? 90),
  });
  const [errors, setErrors] = useState({});

  function set(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.projectName.trim()) errs.projectName = 'Project name is required';
    const speed = Number(form.sweepingSpeedLimit);
    if (form.sweepingSpeedLimit !== '' && (isNaN(speed) || speed < 0))
      errs.sweepingSpeedLimit = 'Must be a valid non-negative number';
    const threshold = Number(form.completionThreshold);
    if (
      form.completionThreshold !== '' &&
      (isNaN(threshold) || threshold < 0 || threshold > 100)
    )
      errs.completionThreshold = 'Must be between 0 and 100';
    return errs;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      projectName: form.projectName.trim(),
      status: form.status,
      settings: {
        sweepingSpeedLimit: form.sweepingSpeedLimit !== '' ? Number(form.sweepingSpeedLimit) : 8,
        completionThreshold: form.completionThreshold !== '' ? Number(form.completionThreshold) : 90,
      },
    });
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200 transition-colors';
  const labelClass = 'mb-1 block text-xs font-semibold text-gray-600';
  const errClass = 'mt-1 text-xs text-red-500';

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div
          className="flex items-center justify-between rounded-t-2xl px-5 py-4"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
        >
          <h2 className="text-base font-bold text-white">Edit Project</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-4 px-5 py-5">
            {/* Project ID — read only */}
            <div>
              <label className={labelClass}>Project ID</label>
              <input
                type="text"
                className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
                value={project.projectId}
                disabled
              />
              <p className="mt-1 text-[0.7rem] text-gray-400">Project ID cannot be changed.</p>
            </div>

            <div>
              <label className={labelClass}>
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`${inputClass} ${errors.projectName ? 'border-red-400' : ''}`}
                placeholder="e.g. Delhi Road Sweeping"
                value={form.projectName}
                onChange={(e) => set('projectName', e.target.value)}
              />
              {errors.projectName && <p className={errClass}>{errors.projectName}</p>}
            </div>

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
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">KM/H</span>
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
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                {errors.completionThreshold && <p className={errClass}>{errors.completionThreshold}</p>}
              </div>
            </div>
          </div>

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
              {saving ? 'Saving…' : 'Update Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchProject(id);
      setProject(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(formData) {
    setSaving(true);
    try {
      await updateProject(project.projectId, formData);
      showToast('Project updated successfully');
      setEditOpen(false);
      await load();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        <svg className="mr-2 h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading project…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
        <button
          onClick={() => navigate('/projects')}
          className="text-sm font-medium text-violet-600 hover:underline"
        >
          ← Back to Projects
        </button>
      </div>
    );
  }

  if (!project) return null;

  const speedLimit = project.settings?.sweepingSpeedLimit ?? '—';
  const threshold = project.settings?.completionThreshold ?? '—';
  const createdDate = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—';
  const updatedDate = project.updatedAt
    ? new Date(project.updatedAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      })
    : '—';

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* Toast */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* Edit Modal */}
      {editOpen && (
        <EditModal
          project={project}
          onSave={handleSave}
          onClose={() => !saving && setEditOpen(false)}
          saving={saving}
        />
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <button
          onClick={() => navigate('/projects')}
          className="hover:text-violet-600 transition-colors font-medium"
        >
          Projects
        </button>
        <span>›</span>
        <span className="font-medium text-gray-600">{project.projectId}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{project.projectName}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{project.projectId}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={project.status} />
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Project ID</p>
          <p className="mt-1 font-mono text-lg font-bold text-gray-900">{project.projectId}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Status</p>
          <div className="mt-1.5">
            <StatusBadge status={project.status} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Created</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{createdDate}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Last Updated</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">{updatedDate}</p>
        </div>
      </div>

      {/* Project Settings */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="rounded-t-xl px-5 py-3"
          style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
        >
          <h2 className="text-sm font-bold text-white">Project Settings</h2>
        </div>
        <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 px-0">
          <div className="flex items-center gap-4 p-5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Sweeping Speed Limit</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900">
                {speedLimit}
                <span className="ml-1 text-sm font-medium text-gray-500">KM/H</span>
              </p>
              <p className="mt-0.5 text-[0.7rem] text-gray-400">
                GPS speed ≤ this value + sweeping ON → counted as sweeping
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Completion Threshold</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900">
                {threshold}
                <span className="ml-0.5 text-sm font-medium text-gray-500">%</span>
              </p>
              <p className="mt-0.5 text-[0.7rem] text-gray-400">
                Actual KM / Planned KM ≥ this → road marked Completed
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Future Modules — Placeholder Stats */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-700">Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Roads" value="0" sub="Coming soon" />
          <StatCard label="Total Machines" value="0" sub="Coming soon" />
          <StatCard label="Today's Planned KM" value="0" sub="Coming soon" />
          <StatCard label="Today's Actual KM" value="0" sub="Coming soon" />
        </div>
      </div>

      {/* Back link */}
      <button
        onClick={() => navigate('/projects')}
        className="text-sm font-medium text-violet-600 hover:underline"
      >
        ← Back to Projects
      </button>
    </div>
  );
}
