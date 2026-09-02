import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelSweepingPlan,
  fetchProjects,
  fetchSweepingPlans,
  generateSweepingPlan,
  updateSweepingPlan,
} from '../api';

const PURPLE = '#4a3569';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d}-${months[Number(m) - 1]}-${y}`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    planned:     'bg-blue-50 text-blue-700',
    in_progress: 'bg-amber-50 text-amber-700',
    completed:   'bg-emerald-100 text-emerald-700',
    cancelled:   'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${cfg[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  const cards = [
    { label: 'Scheduled Roads', value: summary.scheduledRoads, color: 'text-violet-700' },
    { label: 'Total Planned KM', value: `${summary.totalPlannedKm} KM`, color: 'text-blue-700' },
    { label: 'Machines Used', value: summary.machinesUsed, color: 'text-teal-700' },
    { label: 'Capacity Warnings', value: summary.capacityExceededMachines, color: summary.capacityExceededMachines > 0 ? 'text-red-600' : 'text-emerald-700' },
    { label: 'Unassigned Roads', value: summary.unassignedRoads, color: summary.unassignedRoads > 0 ? 'text-red-600' : 'text-emerald-700' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm text-center">
          <p className="text-[0.65rem] font-medium text-gray-500 mb-1">{c.label}</p>
          <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Machine Plan Card (view + edit) ─────────────────────────────────────────
function MachinePlanCard({ plan, onSave, onCancel, saving, cancelling }) {
  const [editing, setEditing] = useState(false);
  const [roads, setRoads]     = useState(plan.roads || []);

  // Reset local state when plan prop changes (after save)
  useEffect(() => { setRoads(plan.roads || []); }, [plan.roads]);

  const totalKm = useMemo(
    () => Math.round(roads.reduce((s, r) => s + (Number(r.plannedKm) || 0), 0) * 1000) / 1000,
    [roads]
  );
  const exceeded = totalKm > plan.capacityKm + 0.001;

  // Move road up/down in sequence
  function move(idx, dir) {
    setRoads((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((r, i) => ({ ...r, sequence: i + 1 }));
    });
  }

  function removeRoad(idx) {
    setRoads((prev) => prev.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sequence: i + 1 })));
  }

  async function handleSave() {
    await onSave(plan._id, roads);
    setEditing(false);
  }

  function handleCancelEdit() {
    setRoads(plan.roads || []);
    setEditing(false);
  }

  const isCancelled = plan.status === 'cancelled';

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${exceeded ? 'border-red-300' : 'border-gray-200'}`}>
      {/* Machine Header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ background: exceeded ? 'linear-gradient(90deg,#dc2626,#b91c1c)' : `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
      >
        <div>
          <h3 className="text-sm font-bold text-white">{plan.machineId} — {plan.machineName}</h3>
          <p className="text-[0.65rem] text-white/70">{plan.vehicleNumber}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={plan.status} />
          {!isCancelled && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-[0.65rem] font-semibold text-white hover:bg-white/20 transition-colors"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Capacity Bar */}
      <div className="border-b border-gray-100 px-5 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="font-medium text-gray-500">Capacity </span>
            <span className="font-bold text-gray-900">{plan.capacityKm} KM</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Assigned </span>
            <span className={`font-bold ${exceeded ? 'text-red-600' : 'text-emerald-700'}`}>{totalKm} KM</span>
          </div>
          <div>
            <span className="font-medium text-gray-500">Remaining </span>
            <span className={`font-bold ${exceeded ? 'text-red-600' : 'text-gray-900'}`}>
              {Math.round((plan.capacityKm - totalKm) * 1000) / 1000} KM
            </span>
          </div>
          {exceeded && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
              ⚠ Capacity Exceeded
            </span>
          )}
          {!exceeded && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ Within Capacity
            </span>
          )}
        </div>

        {/* Visual capacity bar */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${exceeded ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min((totalKm / plan.capacityKm) * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Road Sequence Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50">
              <th className="border-b border-gray-200 px-4 py-2 text-center font-semibold text-gray-600 w-12">Seq</th>
              <th className="border-b border-gray-200 px-4 py-2 text-left font-semibold text-gray-600">Road</th>
              <th className="border-b border-gray-200 px-4 py-2 text-center font-semibold text-gray-600">Area / Colony</th>
              <th className="border-b border-gray-200 px-4 py-2 text-center font-semibold text-gray-600 w-20">Planned KM</th>
              {editing && (
                <th className="border-b border-gray-200 px-4 py-2 text-center font-semibold text-gray-600 w-24">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {roads.length === 0 ? (
              <tr>
                <td colSpan={editing ? 5 : 4} className="px-4 py-6 text-center text-gray-400">
                  No roads assigned
                </td>
              </tr>
            ) : (
              roads.map((r, idx) => (
                <tr key={`${r.roadId}-${idx}`} className="even:bg-gray-50/50 hover:bg-violet-50 transition-colors">
                  <td className="border-b border-gray-100 px-4 py-2 text-center">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-white" style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
                      {r.sequence}
                    </span>
                  </td>
                  <td className="border-b border-gray-100 px-4 py-2">
                    <p className="font-semibold text-gray-900">{r.roadName || r.roadId}</p>
                    <p className="text-[0.65rem] font-mono text-gray-400">{r.roadId}</p>
                  </td>
                  <td className="border-b border-gray-100 px-4 py-2 text-center text-gray-600">
                    {r.areaName}{r.colonyName ? ` / ${r.colonyName}` : ''}
                  </td>
                  <td className="border-b border-gray-100 px-4 py-2 text-center font-semibold text-gray-900">
                    {r.plannedKm} KM
                  </td>
                  {editing && (
                    <td className="border-b border-gray-100 px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => move(idx, -1)}
                          disabled={idx === 0}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                          title="Move up"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => move(idx, 1)}
                          disabled={idx === roads.length - 1}
                          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                          title="Move down"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </button>
                        <button
                          onClick={() => removeRoad(idx)}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                          title="Remove road"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit actions */}
      {editing && (
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button onClick={handleCancelEdit} disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Discard
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
            {saving && <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {/* Cancel plan button */}
      {!isCancelled && !editing && (
        <div className="flex justify-end border-t border-gray-100 px-5 py-2">
          <button onClick={() => onCancel(plan._id)} disabled={cancelling}
            className="text-[0.65rem] font-medium text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50">
            {cancelling ? 'Cancelling…' : 'Cancel Plan'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DailySweepingPlan() {
  const [projects, setProjects]   = useState([]);
  const [projectId, setProjectId] = useState('');
  const [planDate, setPlanDate]   = useState(today());

  const [generating, setGenerating] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [saving,     setSaving]     = useState(null); // planId being saved
  const [cancelling, setCancelling] = useState(null); // planId being cancelled

  const [plans,   setPlans]   = useState([]);
  const [summary, setSummary] = useState(null);
  const [error,   setError]   = useState('');
  const [toast,   setToast]   = useState(null);

  // Confirm regeneration dialog
  const [confirmRegen, setConfirmRegen] = useState(false);

  function showToast(msg, type = 'success') { setToast({ message: msg, type }); }

  // Load projects on mount
  useEffect(() => {
    fetchProjects()
      .then((r) => setProjects(Array.isArray(r.data) ? r.data.filter((p) => p.status === 'active') : []))
      .catch(() => {});
  }, []);

  // Load existing plans when project + date change
  const loadPlans = useCallback(async () => {
    if (!projectId || !planDate) return;
    setLoading(true); setError('');
    try {
      const res = await fetchSweepingPlans({ projectId, planDate });
      setPlans(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.message || 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [projectId, planDate]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  // Generate plan
  async function doGenerate() {
    if (!projectId) { showToast('Please select a project', 'error'); return; }
    if (!planDate)  { showToast('Please select a date', 'error'); return; }
    setGenerating(true); setError('');
    try {
      const res = await generateSweepingPlan({ projectId, planDate });
      setSummary(res.summary);
      setPlans(Array.isArray(res.plans) ? res.plans : []);
      showToast(res.message || 'Plan generated successfully');
    } catch (err) {
      showToast(err.message || 'Generation failed', 'error');
    } finally {
      setGenerating(false);
      setConfirmRegen(false);
    }
  }

  function handleGenerateClick() {
    const activePlans = plans.filter((p) => p.status !== 'cancelled');
    if (activePlans.length > 0) {
      setConfirmRegen(true);
    } else {
      doGenerate();
    }
  }

  // Save edited plan roads
  async function handleSavePlan(planId, roads) {
    setSaving(planId);
    try {
      await updateSweepingPlan(planId, { roads });
      showToast('Plan updated successfully');
      await loadPlans();
    } catch (err) {
      showToast(err.message || 'Update failed', 'error');
    } finally {
      setSaving(null);
    }
  }

  // Cancel a plan
  async function handleCancelPlan(planId) {
    setCancelling(planId);
    try {
      await cancelSweepingPlan(planId);
      showToast('Plan cancelled');
      await loadPlans();
    } catch (err) {
      showToast(err.message || 'Cancel failed', 'error');
    } finally {
      setCancelling(null);
    }
  }

  const activePlans    = plans.filter((p) => p.status !== 'cancelled');
  const cancelledPlans = plans.filter((p) => p.status === 'cancelled');
  const hasPlans       = activePlans.length > 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Regeneration confirm modal */}
      {confirmRegen && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
            <div className="px-5 py-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-gray-900">Regenerate Plan?</h3>
              <p className="mt-2 text-sm text-gray-500">
                A daily plan already exists for <strong>{fmtDate(planDate)}</strong>. Regenerating will replace all existing machine plans for this date.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button onClick={() => setConfirmRegen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={doGenerate} disabled={generating}
                className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60">
                {generating && <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>}
                {generating ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Daily Sweeping Plan</h1>
        <p className="text-xs text-gray-500 mt-0.5">Auto-generate machine-wise road assignment for a selected project and date</p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="rounded-t-xl px-5 py-3" style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
          <h2 className="text-sm font-bold text-white">Generate Plan</h2>
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end">
          {/* Project */}
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Project</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setSummary(null); }}
            >
              <option value="">— Select Project —</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>{p.projectName} ({p.projectId})</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="sm:w-48">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={planDate}
              onChange={(e) => { setPlanDate(e.target.value); setSummary(null); }}
            />
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerateClick}
            disabled={generating || !projectId || !planDate}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            {generating
              ? <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg> Generating…</>
              : <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg> Generate Daily Plan</>
            }
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Summary (shown after generation) */}
      {summary && <SummaryCards summary={summary} />}

      {/* No project selected */}
      {!projectId && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          Select a project to view or generate its daily plan.
        </div>
      )}

      {/* Loading */}
      {projectId && loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
          <svg className="h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading plans…
        </div>
      )}

      {/* No plans yet */}
      {projectId && !loading && plans.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm font-medium text-gray-500">No plan exists for {fmtDate(planDate)}</p>
          <p className="mt-1 text-xs text-gray-400">Click "Generate Daily Plan" to auto-assign roads to machines.</p>
        </div>
      )}

      {/* Active Plans */}
      {!loading && activePlans.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-700">
              Plans for {fmtDate(planDate)}
              <span className="ml-2 text-gray-400 font-normal">({activePlans.length} machine{activePlans.length !== 1 ? 's' : ''})</span>
            </h2>
          </div>
          {activePlans.map((plan) => (
            <MachinePlanCard
              key={plan._id}
              plan={plan}
              onSave={handleSavePlan}
              onCancel={handleCancelPlan}
              saving={saving === plan._id}
              cancelling={cancelling === plan._id}
            />
          ))}
        </div>
      )}

      {/* Cancelled Plans (collapsed) */}
      {!loading && cancelledPlans.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-gray-500 hover:text-gray-700">
            Cancelled Plans ({cancelledPlans.length})
          </summary>
          <div className="space-y-3 p-4">
            {cancelledPlans.map((plan) => (
              <MachinePlanCard
                key={plan._id}
                plan={plan}
                onSave={handleSavePlan}
                onCancel={handleCancelPlan}
                saving={saving === plan._id}
                cancelling={cancelling === plan._id}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
