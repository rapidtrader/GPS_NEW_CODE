import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createMachine, fetchMachine, fetchProjects, updateMachine } from '../api';

const PURPLE = '#4a3569';

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const EMPTY_FORM = {
  machineId: '',
  vehicleNumber: '',
  machineName: '',
  projectId: '',
  sweepingKmPerDay: '',
  workingStart: '08:00',
  workingEnd: '17:00',
  status: 'active',
};

export default function MachineCreate() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [form, setForm]         = useState({ ...EMPTY_FORM });
  const [errors, setErrors]     = useState({});
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingMachine, setLoadingMachine]   = useState(isEdit);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState(null);

  function showToast(msg, type = 'success') { setToast({ message: msg, type }); }

  // Load projects
  useEffect(() => {
    fetchProjects()
      .then((res) => setProjects(Array.isArray(res.data) ? res.data.filter((p) => p.status === 'active') : []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  // Load machine for edit
  useEffect(() => {
    if (!isEdit) return;
    setLoadingMachine(true);
    fetchMachine(id)
      .then((res) => {
        const m = res.data;
        setForm({
          machineId:        m.machineId        || '',
          vehicleNumber:    m.vehicleNumber    || '',
          machineName:      m.machineName      || '',
          projectId:        m.projectId        || '',
          sweepingKmPerDay: String(m.sweepingKmPerDay ?? ''),
          workingStart:     m.workingHours?.start || '08:00',
          workingEnd:       m.workingHours?.end   || '17:00',
          status:           m.status           || 'active',
        });
      })
      .catch((err) => showToast(err.message || 'Failed to load machine', 'error'))
      .finally(() => setLoadingMachine(false));
  }, [isEdit, id]);

  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setErrors((e) => ({ ...e, [key]: '' }));
  }

  function validate() {
    const errs = {};
    if (!form.machineId.trim())       errs.machineId       = 'Machine ID is required';
    if (!form.vehicleNumber.trim())   errs.vehicleNumber   = 'Vehicle number is required';
    if (!form.machineName.trim())     errs.machineName     = 'Machine name is required';
    if (!form.projectId)              errs.projectId       = 'Project is required';
    const km = Number(form.sweepingKmPerDay);
    if (!form.sweepingKmPerDay || isNaN(km) || km <= 0)
      errs.sweepingKmPerDay = 'Daily capacity must be greater than 0';
    if (!form.workingStart || !TIME_RE.test(form.workingStart))
      errs.workingStart = 'Enter valid time in HH:MM format';
    if (!form.workingEnd || !TIME_RE.test(form.workingEnd))
      errs.workingEnd = 'Enter valid time in HH:MM format';
    if (
      TIME_RE.test(form.workingStart) &&
      TIME_RE.test(form.workingEnd)
    ) {
      const [sh, sm] = form.workingStart.split(':').map(Number);
      const [eh, em] = form.workingEnd.split(':').map(Number);
      if (eh * 60 + em <= sh * 60 + sm) {
        errs.workingEnd = 'End time must be after start time';
      }
    }
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    const payload = {
      machineId:       form.machineId.trim(),
      vehicleNumber:   form.vehicleNumber.trim(),
      machineName:     form.machineName.trim(),
      projectId:       form.projectId,
      sweepingKmPerDay: Number(form.sweepingKmPerDay),
      workingHours: { start: form.workingStart, end: form.workingEnd },
      status: form.status,
    };

    setSaving(true);
    try {
      if (isEdit) {
        const { machineId, ...updatePayload } = payload;
        await updateMachine(id, updatePayload);
        showToast('Machine updated successfully');
        setTimeout(() => navigate(`/machines/${id}`), 1200);
      } else {
        const res = await createMachine(payload);
        showToast('Machine created successfully');
        setTimeout(() => navigate(`/machines/${res.data.machineId}`), 1200);
      }
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loadingMachine) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        <svg className="mr-2 h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
        </svg>
        Loading machine…
      </div>
    );
  }

  const inp = (err) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 transition-colors ${
      err ? 'border-red-400 focus:border-red-400' : 'border-gray-300 focus:border-violet-500'
    }`;
  const lbl = 'mb-1 block text-xs font-semibold text-gray-600';
  const err = 'mt-1 text-xs text-red-500';

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/machines')}
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Machine' : 'Add Machine'}</h1>
          <p className="text-xs text-gray-500">
            {isEdit ? `Editing: ${form.machineId}` : 'Create a new sweeping machine'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="rounded-t-xl px-5 py-3"
            style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
            <h2 className="text-sm font-bold text-white">Machine Details</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">

            {/* Machine ID */}
            <div>
              <label className={lbl}>Machine ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={`${inp(errors.machineId)} ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                placeholder="e.g. SW-01"
                value={form.machineId}
                onChange={(e) => setField('machineId', e.target.value)}
                disabled={isEdit}
                readOnly={isEdit}
              />
              {errors.machineId && <p className={err}>{errors.machineId}</p>}
              {isEdit && <p className="mt-1 text-[0.7rem] text-gray-400">Machine ID cannot be changed.</p>}
            </div>

            {/* Vehicle Number */}
            <div>
              <label className={lbl}>Vehicle Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={inp(errors.vehicleNumber)}
                placeholder="e.g. DL01AB1234"
                value={form.vehicleNumber}
                onChange={(e) => setField('vehicleNumber', e.target.value.toUpperCase())}
              />
              {errors.vehicleNumber && <p className={err}>{errors.vehicleNumber}</p>}
            </div>

            {/* Machine Name */}
            <div className="sm:col-span-2">
              <label className={lbl}>Machine Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={inp(errors.machineName)}
                placeholder="e.g. Sweeper Machine 01"
                value={form.machineName}
                onChange={(e) => setField('machineName', e.target.value)}
              />
              {errors.machineName && <p className={err}>{errors.machineName}</p>}
            </div>

            {/* Project */}
            <div className="sm:col-span-2">
              <label className={lbl}>Project <span className="text-red-500">*</span></label>
              {isEdit ? (
                <input
                  type="text"
                  className={`${inp(false)} bg-gray-50 text-gray-500 cursor-not-allowed`}
                  value={form.projectId}
                  disabled
                />
              ) : (
                <select
                  className={inp(errors.projectId)}
                  value={form.projectId}
                  onChange={(e) => setField('projectId', e.target.value)}
                  disabled={loadingProjects}
                >
                  <option value="">{loadingProjects ? 'Loading projects…' : '— Select Project —'}</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.projectName} ({p.projectId})
                    </option>
                  ))}
                </select>
              )}
              {errors.projectId && <p className={err}>{errors.projectId}</p>}
            </div>

            {/* Sweeping KM/Day */}
            <div>
              <label className={lbl}>Sweeping KM/Day <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type="number"
                  min="0.001"
                  step="0.1"
                  className={`${inp(errors.sweepingKmPerDay)} pr-16`}
                  placeholder="e.g. 80"
                  value={form.sweepingKmPerDay}
                  onChange={(e) => setField('sweepingKmPerDay', e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">KM/day</span>
              </div>
              {errors.sweepingKmPerDay && <p className={err}>{errors.sweepingKmPerDay}</p>}
              <p className="mt-1 text-[0.7rem] text-gray-400">Used for future Daily Plan capacity validation.</p>
            </div>

            {/* Status */}
            <div>
              <label className={lbl}>Status</label>
              <select className={inp(false)} value={form.status} onChange={(e) => setField('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Working Hours */}
            <div className="sm:col-span-2">
              <label className={lbl}>Working Hours <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[0.7rem] text-gray-500">Start Time</label>
                  <input
                    type="time"
                    className={inp(errors.workingStart)}
                    value={form.workingStart}
                    onChange={(e) => setField('workingStart', e.target.value)}
                  />
                  {errors.workingStart && <p className={err}>{errors.workingStart}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-[0.7rem] text-gray-500">End Time</label>
                  <input
                    type="time"
                    className={inp(errors.workingEnd)}
                    value={form.workingEnd}
                    onChange={(e) => setField('workingEnd', e.target.value)}
                  />
                  {errors.workingEnd && <p className={err}>{errors.workingEnd}</p>}
                </div>
              </div>
              <p className="mt-1 text-[0.7rem] text-gray-400">24-hour format. End time must be after start time.</p>
            </div>

          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 pb-6">
          <button type="button" onClick={() => navigate('/machines')} disabled={saving}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
            {saving && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
            )}
            {saving ? 'Saving…' : isEdit ? 'Update Machine' : 'Save Machine'}
          </button>
        </div>
      </form>
    </div>
  );
}
