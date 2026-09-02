/**
 * MachineTracking.jsx
 *
 * Live GPS tracking for sweeping machines.
 * Source: vehicleroutehistories (via /api/gps/live)
 * Mapping: Machine.vehicleNumber → vehicleroutehistories.vehicleNo
 *
 * IMPORTANT NOTE on sweepingStatus:
 *   No hardware sweeping signal exists in current GPS data.
 *   status field only has "Ignition on" / "Ignition off".
 *   sweepingStatus = 'not_sweeping' when speed > limit OR ignition=OFF.
 *   sweepingStatus = 'unknown' otherwise (signal unavailable).
 *   This is NOT inferred as "sweeping ON" from ignition alone.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchLiveMachines, fetchProjects } from '../api';

const PURPLE = '#4a3569';
const REFRESH_INTERVAL_MS = 30000; // 30 seconds

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeMachineIcon(ignition, selected) {
  const fill = ignition === true ? '#16a34a' : ignition === false ? '#6b7280' : '#d97706';
  const border = selected ? '#ffffff' : '#fff';
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${fill};color:#fff;
      width:${selected ? 32 : 26}px;height:${selected ? 32 : 26}px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      border:2.5px solid ${border};
      box-shadow:0 2px 8px rgba(0,0,0,${selected ? '.5' : '.3'});
      display:flex;align-items:center;justify-content:center;
    "><svg style="transform:rotate(45deg);width:14px;height:14px" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a49.902 49.902 0 00-2.654-.816M17.25 18.75V7.5a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25v11.25" />
    </svg></div>`,
    iconSize: [selected ? 32 : 26, selected ? 32 : 26],
    iconAnchor: [selected ? 16 : 13, selected ? 32 : 26],
  });
}

// ── Auto-fit map to markers ───────────────────────────────────────────────────
function MapFitBounds({ machines }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current) return;
    const valid = machines.filter((m) => m.latitude != null && m.longitude != null);
    if (valid.length === 0) return;
    try {
      const bounds = L.latLngBounds(valid.map((m) => [m.latitude, m.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
      fitted.current = true;
    } catch (_) {}
  }, [machines, map]);
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata',
  }).replace(',', '').replace(/\bam\b/, 'AM').replace(/\bpm\b/, 'PM');
}

function IgnitionBadge({ ignition }) {
  if (ignition === true)  return <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">ON</span>;
  if (ignition === false) return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">OFF</span>;
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-600">?</span>;
}

function SweepingBadge({ status }) {
  if (status === 'not_sweeping') return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">Not Sweeping</span>;
  return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-600">Unknown</span>;
}

function GpsBadge({ available }) {
  if (available) return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[0.65rem] font-semibold text-blue-600"><span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />Live</span>;
  return <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-400">No GPS</span>;
}

// ── Summary Cards ─────────────────────────────────────────────────────────────
function SummaryBar({ summary, loading }) {
  if (!summary) return null;
  const cards = [
    { label: 'Total', value: summary.totalMachines, color: 'text-gray-900' },
    { label: 'GPS Reporting', value: summary.gpsReporting, color: 'text-blue-700' },
    { label: 'Ignition ON', value: summary.ignitionOn, color: 'text-emerald-700' },
    { label: 'Ignition OFF', value: summary.ignitionOff, color: 'text-gray-500' },
    { label: 'Status Unknown', value: summary.sweepingUnknown, color: 'text-amber-600' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
          <p className="text-[0.65rem] font-medium text-gray-500">{c.label}</p>
          <p className={`text-xl font-bold ${c.color} ${loading ? 'opacity-50' : ''}`}>{c.value ?? '—'}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MachineTracking() {
  const [projects, setProjects]     = useState([]);
  const [projectId, setProjectId]   = useState('');
  const [machines, setMachines]     = useState([]);
  const [summary, setSummary]       = useState(null);
  const [selected, setSelected]     = useState(null); // selected machineId
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [countdown, setCountdown]   = useState(REFRESH_INTERVAL_MS / 1000);

  const intervalRef   = useRef(null);
  const countdownRef  = useRef(null);
  const loadingRef    = useRef(false); // prevent overlapping polls

  // Load projects
  useEffect(() => {
    fetchProjects()
      .then((r) => setProjects(Array.isArray(r.data) ? r.data.filter((p) => p.status === 'active') : []))
      .catch(() => {});
  }, []);

  // Load live data
  const load = useCallback(async (quiet = false) => {
    if (!projectId || loadingRef.current) return;
    loadingRef.current = true;
    if (!quiet) setLoading(true);
    setError('');
    try {
      const res = await fetchLiveMachines(projectId);
      setMachines(Array.isArray(res.data) ? res.data : []);
      setSummary(res.summary || null);
      setLastRefresh(new Date());
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    } catch (err) {
      setError(err.message || 'Failed to load live data');
    } finally {
      loadingRef.current = false;
      if (!quiet) setLoading(false);
    }
  }, [projectId]);

  // Setup polling + countdown when projectId changes
  useEffect(() => {
    // Clear previous intervals
    if (intervalRef.current)  clearInterval(intervalRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setMachines([]);
    setSummary(null);
    setSelected(null);

    if (!projectId) return;

    load(false);

    // Auto-refresh every 30s
    intervalRef.current = setInterval(() => load(true), REFRESH_INTERVAL_MS);

    // Countdown ticker
    countdownRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL_MS / 1000 : c - 1));
    }, 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearInterval(countdownRef.current);
    };
  }, [load, projectId]);

  // Derived
  const mapMachines = machines.filter((m) => m.latitude != null && m.longitude != null);
  const selectedMachine = machines.find((m) => m.machineId === selected) || null;

  const thCls = 'border border-[#6b5489] px-3 py-2 text-center text-xs font-semibold text-white whitespace-nowrap';
  const tdCls = 'border border-gray-300 px-3 py-2 text-xs text-black whitespace-nowrap';

  return (
    <div className="space-y-4 p-4 sm:p-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Machine Tracking</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Live GPS status from <span className="font-mono font-semibold">vehicleroutehistories</span>
          </p>
        </div>
        {lastRefresh && (
          <div className="text-right text-xs text-gray-400">
            <p>Updated: {lastRefresh.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</p>
            <p>Refresh in <span className="font-semibold text-violet-600">{countdown}s</span></p>
          </div>
        )}
      </div>

      {/* Project selector */}
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Project</label>
          <select
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">— Select Project —</option>
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>{p.projectName} ({p.projectId})</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => load(false)}
          disabled={loading || !projectId}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:opacity-90"
          style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
        >
          <svg className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>



      {/* Error */}
      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Empty states */}
      {!projectId && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          Select a project to view live machine tracking.
        </div>
      )}

      {projectId && !loading && machines.length === 0 && !error && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          No active machines found for this project.
        </div>
      )}

      {/* Summary */}
      {summary && <SummaryBar summary={summary} loading={loading} />}

      {/* Live Map */}
      {machines.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
          <div className="px-4 py-2.5" style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
            <h2 className="text-sm font-bold text-white">
              Live Map
              {mapMachines.length < machines.length && (
                <span className="ml-2 text-xs font-normal text-white/70">
                  ({machines.length - mapMachines.length} machine{machines.length - mapMachines.length !== 1 ? 's' : ''} without GPS data)
                </span>
              )}
            </h2>
          </div>
          <div style={{ height: 400 }}>
            <MapContainer
              center={mapMachines.length > 0 ? [mapMachines[0].latitude, mapMachines[0].longitude] : [28.6139, 77.2090]}
              zoom={13}
              className="h-full w-full"
              style={{ zIndex: 0 }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFitBounds machines={mapMachines} />
              {mapMachines.map((m) => (
                <Marker
                  key={m.machineId}
                  position={[m.latitude, m.longitude]}
                  icon={makeMachineIcon(m.ignition, selected === m.machineId)}
                  eventHandlers={{ click: () => setSelected(m.machineId) }}
                >
                  <Popup>
                    <div className="text-xs space-y-1 min-w-[160px]">
                      <p className="font-bold text-sm text-gray-900">{m.machineId}</p>
                      <p className="text-gray-600">{m.machineName}</p>
                      <p className="font-mono text-gray-500">{m.vehicleNumber}</p>
                      <hr className="my-1" />
                      <p><span className="font-medium">Speed:</span> {m.speed ?? '—'} KM/H</p>
                      <p><span className="font-medium">Ignition:</span> {m.ignition === true ? 'ON' : m.ignition === false ? 'OFF' : 'Unknown'}</p>
                      <p><span className="font-medium">Sweeping:</span> {m.sweepingStatus === 'not_sweeping' ? 'Not Sweeping' : 'Unknown'}</p>
                      {m.address && <p className="text-gray-500 text-[0.65rem]">{m.address}</p>}
                      <p className="text-gray-400 text-[0.65rem]">{fmtTime(m.timestamp)}</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      )}

      {/* Machine Table */}
      {machines.length > 0 && (
        <div>
          {/* Desktop */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse border border-gray-300 bg-white text-xs">
              <thead>
                <tr style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
                  <th className={thCls}>Machine ID</th>
                  <th className={thCls}>Machine Name</th>
                  <th className={thCls}>Vehicle No</th>
                  <th className={thCls}>GPS</th>
                  <th className={thCls}>Speed</th>
                  <th className={thCls}>Ignition</th>
                  <th className={thCls}>Sweeping</th>
                  <th className={thCls}>Last Update</th>
                  <th className={thCls}>Location</th>
                  <th className={thCls}>Action</th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m) => (
                  <tr
                    key={m.machineId}
                    className={`cursor-pointer even:bg-gray-50 transition-colors ${selected === m.machineId ? 'bg-violet-50 ring-1 ring-inset ring-violet-300' : 'hover:bg-violet-50'}`}
                    onClick={() => setSelected(m.machineId === selected ? null : m.machineId)}
                  >
                    <td className={`${tdCls} font-mono font-semibold`}>{m.machineId}</td>
                    <td className={`${tdCls} font-medium`}>{m.machineName}</td>
                    <td className={`${tdCls} font-mono`}>{m.vehicleNumber}</td>
                    <td className={`${tdCls} text-center`}><GpsBadge available={m.gpsAvailable} /></td>
                    <td className={`${tdCls} text-center`}>{m.speed != null ? `${m.speed} KM/H` : '—'}</td>
                    <td className={`${tdCls} text-center`}><IgnitionBadge ignition={m.ignition} /></td>
                    <td className={`${tdCls} text-center`}><SweepingBadge status={m.sweepingStatus} /></td>
                    <td className={tdCls}>{fmtTime(m.timestamp)}</td>
                    <td className={`${tdCls} font-mono text-[0.65rem]`}>
                      {m.latitude != null ? `${m.latitude.toFixed(5)}, ${m.longitude.toFixed(5)}` : '—'}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelected(m.machineId); }}
                        className="rounded px-2 py-1 text-[0.65rem] font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50 transition-colors"
                      >
                        Focus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 lg:hidden">
            {machines.map((m) => (
              <article
                key={m.machineId}
                className={`rounded-xl border bg-white p-4 shadow-sm cursor-pointer transition-colors ${selected === m.machineId ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}
                onClick={() => setSelected(m.machineId === selected ? null : m.machineId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{m.machineName}</p>
                    <p className="font-mono text-xs text-gray-500">{m.machineId} · {m.vehicleNumber}</p>
                  </div>
                  <GpsBadge available={m.gpsAvailable} />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="font-medium text-gray-500">Speed</dt><dd>{m.speed != null ? `${m.speed} KM/H` : '—'}</dd></div>
                  <div><dt className="font-medium text-gray-500">Ignition</dt><dd><IgnitionBadge ignition={m.ignition} /></dd></div>
                  <div><dt className="font-medium text-gray-500">Sweeping</dt><dd><SweepingBadge status={m.sweepingStatus} /></dd></div>
                  <div><dt className="font-medium text-gray-500">Updated</dt><dd className="text-[0.65rem]">{fmtTime(m.timestamp)}</dd></div>
                </dl>
                {m.latitude != null && (
                  <p className="mt-2 font-mono text-[0.65rem] text-gray-400">{m.latitude.toFixed(5)}, {m.longitude.toFixed(5)}</p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
