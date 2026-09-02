import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchMachine } from '../api';

const PURPLE = '#4a3569';

function StatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function InfoCard({ label, value, mono = false }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
    </div>
  );
}

function FuturePlaceholder({ label }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-medium text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-gray-300">—</p>
      <p className="mt-0.5 text-[0.65rem] text-gray-300">Coming soon</p>
    </div>
  );
}

export default function MachineDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [machine, setMachine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchMachine(id);
      setMachine(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load machine');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
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

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
        <button onClick={() => navigate('/machines')} className="text-sm font-medium text-violet-600 hover:underline">
          ← Back to Machines
        </button>
      </div>
    );
  }

  if (!machine) return null;

  const createdDate = machine.createdAt
    ? new Date(machine.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const updatedDate = machine.updatedAt
    ? new Date(machine.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-5 p-4 sm:p-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/machines')} className="hover:text-violet-600 font-medium transition-colors">
          Machines
        </button>
        <span>›</span>
        <span className="font-medium text-gray-600">{machine.machineId}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{machine.machineName}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{machine.machineId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={machine.status} />
          <button
            onClick={() => navigate(`/machines/${machine.machineId}/edit`)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Edit
          </button>
        </div>
      </div>

      {/* Core Info Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Machine ID"     value={machine.machineId}     mono />
        <InfoCard label="Vehicle Number" value={machine.vehicleNumber} mono />
        <InfoCard label="Project"        value={machine.projectId} />
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Status</p>
          <div className="mt-1.5"><StatusBadge status={machine.status} /></div>
        </div>
      </div>

      {/* Capacity Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="rounded-t-xl px-5 py-3"
          style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
          <h2 className="text-sm font-bold text-white">Machine Settings</h2>
        </div>
        <div className="grid grid-cols-1 gap-0 divide-y divide-gray-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">

          {/* Daily Capacity */}
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Daily Sweeping Capacity</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900">
                {machine.sweepingKmPerDay}
                <span className="ml-1 text-sm font-medium text-gray-500">KM/day</span>
              </p>
              <p className="mt-0.5 text-[0.7rem] text-gray-400">
                Used for Daily Plan capacity validation
              </p>
            </div>
          </div>

          {/* Working Hours */}
          <div className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white"
              style={{ background: 'linear-gradient(135deg, #0d9488, #0891b2)' }}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Working Hours</p>
              <p className="mt-0.5 text-2xl font-bold text-gray-900 font-mono">
                {machine.workingHours?.start}
                <span className="mx-1 text-base text-gray-400">–</span>
                {machine.workingHours?.end}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-gray-400">24-hour format</p>
            </div>
          </div>
        </div>
      </div>

      {/* Timestamps */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="Created"      value={createdDate} />
        <InfoCard label="Last Updated" value={updatedDate} />
      </div>

      {/* Future GPS/Live Data Placeholders */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-700">Live Status (Coming Soon)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <FuturePlaceholder label="Current Location" />
          <FuturePlaceholder label="Current Speed" />
          <FuturePlaceholder label="Sweeping Status" />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-700">Today's Sweeping (Coming Soon)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FuturePlaceholder label="Today's Planned KM" />
          <FuturePlaceholder label="Today's Actual KM" />
          <FuturePlaceholder label="Completion %" />
          <FuturePlaceholder label="Current Road" />
        </div>
      </div>

      {/* Back */}
      <button onClick={() => navigate('/machines')} className="text-sm font-medium text-violet-600 hover:underline">
        ← Back to Machines
      </button>
    </div>
  );
}
