/**
 * PlannedVsActual.jsx
 *
 * Planned vs Actual GPS Route + Road Completion page.
 *
 * SOURCE: vehicleroutehistories (via /api/planned-vs-actual)
 * NOTE:   No hardware sweeping signal — coverage based on GPS proximity to road geometry.
 *         Ignition ON ≠ Sweeping ON. sweepingStatus = 'unknown' where signal unavailable.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchMachines, fetchPlannedVsActual, fetchProjects } from '../api';

const PURPLE = '#4a3569';

// ── Leaflet fix ───────────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function round2(n) { return Math.round((n ?? 0) * 100) / 100; }

// ── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  completed:           { label: 'Completed',         cls: 'bg-emerald-100 text-emerald-700' },
  partially_completed: { label: 'Partial',            cls: 'bg-amber-100  text-amber-700'  },
  not_completed:       { label: 'Not Completed',     cls: 'bg-red-100    text-red-700'    },
};
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Coverage bar ─────────────────────────────────────────────────────────────
function CoverageBar({ pct }) {
  const color = pct >= 90 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-semibold ${pct >= 90 ? 'text-emerald-700' : pct >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
        {round2(pct)}%
      </span>
    </div>
  );
}

// ── Summary cards ─────────────────────────────────────────────────────────────
function SummaryCards({ summary }) {
  const cards = [
    { label: 'Planned KM',        value: `${round2(summary.totalPlannedKm)} KM`,  color: 'text-gray-900' },
    { label: 'Actual Swept KM',   value: `${round2(summary.totalActualKm)} KM`,   color: 'text-emerald-700' },
    { label: 'Missed KM',         value: `${round2(summary.totalMissedKm)} KM`,   color: summary.totalMissedKm > 0 ? 'text-red-600' : 'text-gray-400' },
    { label: 'Overall Coverage',  value: `${round2(summary.overallCoveragePercent)}%`, color: summary.overallCoveragePercent >= 90 ? 'text-emerald-700' : summary.overallCoveragePercent >= 50 ? 'text-amber-700' : 'text-red-600' },
    { label: 'Completed Roads',   value: summary.completedRoads,       color: 'text-emerald-700' },
    { label: 'Partial Roads',     value: summary.partiallyCompletedRoads, color: 'text-amber-700' },
    { label: 'Not Completed',     value: summary.notCompletedRoads,    color: 'text-red-600' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-3 text-center shadow-sm">
          <p className="text-[0.65rem] font-medium text-gray-500 leading-tight">{c.label}</p>
          <p className={`mt-1 text-lg font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Fly-to helper — triggers map pan/zoom to given coords ────────────────────
function FlyToCoords({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    try { map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17, animate: true }); } catch (_) {}
  }, [coords, map]);
  return null;
}

// ── Road map panel ────────────────────────────────────────────────────────────
function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length < 2) return;
    try { map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17 }); } catch (_) {}
  }, [coords, map]);
  return null;
}

function RoadMapPanel({ selectedRoad, actualSegments }) {
  const planned = selectedRoad?.plannedRoute || [];
  const actual  = actualSegments || [];
  const [flyTarget, setFlyTarget] = useState(null); // 'planned' | 'actual' | null

  // Flatten all actual points
  const actualAllPts = actual.flat();
  const totalActualPts = actualAllPts.length;

  const allCoords = [...planned, ...actualAllPts];
  const center = allCoords.length > 0 ? allCoords[0] : [28.6139, 77.2090];

  // Coords to fly to based on button clicked
  const flyCoords =
    flyTarget === 'planned' ? planned :
    flyTarget === 'actual'  ? actualAllPts :
    null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      {/* Header with clickable Planned / Actual buttons */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
        <h3 className="text-sm font-bold text-white">
          Route Map — {selectedRoad?.roadName || 'All Roads'}
        </h3>
        <div className="flex items-center gap-2">
          {/* Planned button */}
          <button
            type="button"
            onClick={() => setFlyTarget(flyTarget === 'planned' ? null : 'planned')}
            disabled={planned.length < 2}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors disabled:opacity-40 ${
              flyTarget === 'planned'
                ? 'bg-blue-500 text-white shadow-inner'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <span className="inline-block h-1 w-4 rounded" style={{ background: '#93c5fd' }} />
            Planned
          </button>
          {/* Actual button */}
          <button
            type="button"
            onClick={() => setFlyTarget(flyTarget === 'actual' ? null : 'actual')}
            disabled={totalActualPts < 2}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors disabled:opacity-40 ${
              flyTarget === 'actual'
                ? 'bg-emerald-500 text-white shadow-inner'
                : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            <span className="inline-block h-1 w-4 rounded" style={{ background: '#6ee7b7' }} />
            Actual GPS
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs">
        <span>
          <span className="font-medium text-gray-500">Planned KM: </span>
          <span className="font-semibold text-blue-700">{selectedRoad?.plannedKm ?? '—'} KM</span>
        </span>
        <span>
          <span className="font-medium text-gray-500">Actual KM: </span>
          <span className={`font-semibold ${(selectedRoad?.actualKm ?? 0) > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
            {selectedRoad?.actualKm ?? 0} KM
          </span>
        </span>
        <span>
          <span className="font-medium text-gray-500">Coverage: </span>
          <span className={`font-semibold ${(selectedRoad?.coveragePercent ?? 0) >= 90 ? 'text-emerald-700' : (selectedRoad?.coveragePercent ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
            {selectedRoad?.coveragePercent ?? 0}%
          </span>
        </span>
        <span>
          <span className="font-medium text-gray-500">GPS points (actual): </span>
          <span className="font-semibold text-gray-700">{totalActualPts}</span>
        </span>
        {totalActualPts === 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
            ⚠ No actual GPS data for this date
          </span>
        )}
      </div>

      {/* Map */}
      <div style={{ height: 400 }}>
        <MapContainer center={center} zoom={14} className="h-full w-full" style={{ zIndex: 0 }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Initial fit to show both planned + actual */}
          {allCoords.length >= 2 && <FitBounds coords={allCoords} />}
          {/* Fly to selected route on button click */}
          {flyCoords && flyCoords.length >= 2 && <FlyToCoords coords={flyCoords} />}

          {/* Planned route — blue, thicker */}
          {planned.length >= 2 && (
            <Polyline
              positions={planned}
              pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }}
            >
              <Tooltip sticky>📋 Planned: {selectedRoad?.roadName}</Tooltip>
            </Polyline>
          )}

          {/* Actual GPS route — green segments */}
          {actual.map((seg, idx) =>
            seg.length >= 2 ? (
              <Polyline
                key={idx}
                positions={seg}
                pathOptions={{ color: '#10b981', weight: 3, opacity: 0.9 }}
              >
                <Tooltip sticky>🛣 Actual GPS Track (segment {idx + 1})</Tooltip>
              </Polyline>
            ) : null
          )}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Machine accordion card ────────────────────────────────────────────────────
function MachineCard({ machine, selectedRoadId, onSelectRoad }) {
  const [expanded, setExpanded] = useState(true);

  const exceeded = machine.totalActualKm > machine.capacityKm + 0.001;

  const thCls = 'border border-[#6b5489] px-3 py-2 text-center text-[0.65rem] font-semibold text-white whitespace-nowrap';
  const tdCls = 'border border-gray-300 px-3 py-2 text-center text-xs text-black whitespace-nowrap';

  return (
    <div className={`rounded-xl border bg-white shadow-sm overflow-hidden ${machine.error ? 'border-red-200' : 'border-gray-200'}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left"
        style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
      >
        <div>
          <span className="text-sm font-bold text-white">{machine.machineId} — {machine.machineName}</span>
          <span className="ml-2 font-mono text-[0.65rem] text-white/60">{machine.vehicleNumber}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Mini summary */}
          <span className="hidden sm:inline text-[0.65rem] text-white/80">
            {round2(machine.totalActualKm)}/{round2(machine.totalPlannedKm)} KM
            · {round2(machine.overallCoveragePercent)}%
          </span>
          <svg className={`h-4 w-4 text-white transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      </button>

      {machine.error && (
        <div className="px-5 py-2 text-xs text-red-600 bg-red-50">{machine.error}</div>
      )}

      {expanded && !machine.error && (
        <>
          {/* Capacity bar */}
          <div className="border-b border-gray-100 px-5 py-3">
            <div className="flex flex-wrap items-center gap-5 text-xs">
              <div>
                <span className="font-medium text-gray-500">Planned </span>
                <span className="font-bold text-gray-900">{round2(machine.totalPlannedKm)} KM</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Actual </span>
                <span className={`font-bold ${machine.totalActualKm > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                  {round2(machine.totalActualKm)} KM
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Missed </span>
                <span className={`font-bold ${machine.totalMissedKm > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {round2(machine.totalMissedKm)} KM
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Coverage </span>
                <span className={`font-bold ${machine.overallCoveragePercent >= 90 ? 'text-emerald-700' : machine.overallCoveragePercent >= 50 ? 'text-amber-700' : 'text-red-600'}`}>
                  {round2(machine.overallCoveragePercent)}%
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-500">GPS pts </span>
                <span className="text-gray-700">{machine.gpsPointsCleaned}/{machine.gpsPointsTotal} cleaned</span>
              </div>
              <div>
                <span className="font-medium text-gray-500">Total GPS Travel </span>
                <span className="font-semibold text-indigo-700">{round2(machine.totalGpsTravelKm ?? 0)} KM</span>
              </div>
              {!machine.sweepingSignalAvailable && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-medium text-amber-700">
                  ⚠ No sweeping signal
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${machine.overallCoveragePercent >= 90 ? 'bg-emerald-500' : machine.overallCoveragePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(machine.overallCoveragePercent, 100)}%` }}
              />
            </div>
          </div>

          {/* Road table — desktop */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
                  <th className={thCls}>Seq</th>
                  <th className={thCls}>Road</th>
                  <th className={thCls}>Area / Colony</th>
                  <th className={thCls}>Planned KM</th>
                  <th className={thCls}>Actual KM</th>
                  <th className={thCls}>Missed KM</th>
                  <th className={thCls}>Coverage</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Map</th>
                </tr>
              </thead>
              <tbody>
                {(machine.roads || []).map((road) => (
                  <tr
                    key={road.roadId}
                    className={`even:bg-gray-50 transition-colors ${selectedRoadId === road.roadId ? 'bg-violet-50 ring-1 ring-inset ring-violet-300' : 'hover:bg-violet-50'}`}
                  >
                    <td className={tdCls}>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}>
                        {road.sequence}
                      </span>
                    </td>
                    <td className={`${tdCls} text-left`}>
                      <p className="font-semibold text-gray-900">{road.roadName}</p>
                      <p className="font-mono text-[0.6rem] text-gray-400">{road.roadId}</p>
                      {road.error && <p className="text-red-500 text-[0.6rem]">{road.error}</p>}
                    </td>
                    <td className={tdCls}>{road.areaName}{road.colonyName ? ` / ${road.colonyName}` : ''}</td>
                    <td className={tdCls}>{round2(road.plannedKm)}</td>
                    <td className={`${tdCls} ${road.actualKm > 0 ? 'text-emerald-700 font-semibold' : 'text-gray-400'}`}>
                      {round2(road.actualKm)}
                    </td>
                    <td className={`${tdCls} ${road.missedKm > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {round2(road.missedKm)}
                    </td>
                    <td className={tdCls}><CoverageBar pct={road.coveragePercent} /></td>
                    <td className={tdCls}><StatusBadge status={road.status} /></td>
                    <td className={tdCls}>
                      <button
                        onClick={() => onSelectRoad(road.roadId === selectedRoadId ? null : road.roadId)}
                        className={`rounded px-2 py-1 text-[0.65rem] font-semibold transition-colors ${
                          selectedRoadId === road.roadId
                            ? 'bg-violet-600 text-white'
                            : 'text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50'
                        }`}
                      >
                        {selectedRoadId === road.roadId ? 'Close' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Road cards — mobile */}
          <div className="space-y-2 p-3 lg:hidden">
            {(machine.roads || []).map((road) => (
              <div key={road.roadId}
                className={`rounded-xl border p-3 ${selectedRoadId === road.roadId ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-900">{road.roadName}</p>
                    <p className="font-mono text-[0.65rem] text-gray-500">{road.roadId}</p>
                  </div>
                  <StatusBadge status={road.status} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><span className="text-gray-500">Planned</span><p className="font-semibold">{round2(road.plannedKm)} KM</p></div>
                  <div><span className="text-gray-500">Actual</span><p className={`font-semibold ${road.actualKm > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{round2(road.actualKm)} KM</p></div>
                  <div><span className="text-gray-500">Missed</span><p className={`font-semibold ${road.missedKm > 0 ? 'text-red-600' : 'text-gray-400'}`}>{round2(road.missedKm)} KM</p></div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <CoverageBar pct={road.coveragePercent} />
                  <button onClick={() => onSelectRoad(road.roadId === selectedRoadId ? null : road.roadId)}
                    className="rounded px-2 py-1 text-[0.65rem] font-semibold text-violet-700 ring-1 ring-violet-300 hover:bg-violet-50">
                    {selectedRoadId === road.roadId ? 'Close' : 'View Map'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function PlannedVsActual() {
  const [projects, setProjects]   = useState([]);
  const [projectId, setProjectId] = useState('');
  const [date, setDate]           = useState(today());
  const [machineId, setMachineId] = useState('');
  const [machines, setMachines]   = useState([]);

  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const [selectedRoadId, setSelectedRoadId] = useState(null);

  // Load projects
  useEffect(() => {
    fetchProjects()
      .then((r) => setProjects(Array.isArray(r.data) ? r.data.filter((p) => p.status === 'active') : []))
      .catch(() => {});
  }, []);

  // Load machines when project changes
  useEffect(() => {
    setMachineId('');
    setMachines([]);
    if (!projectId) return;
    fetchMachines({ projectId, status: 'active' })
      .then((r) => setMachines(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [projectId]);

  // Load calculation
  const load = useCallback(async () => {
    if (!projectId || !date) return;
    setLoading(true); setError(''); setResult(null); setSelectedRoadId(null);
    try {
      const res = await fetchPlannedVsActual({ projectId, date, machineId: machineId || undefined });
      setResult(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [projectId, date, machineId]);

  // Derived — find selected road data for individual map
  const selectedRoadData = useMemo(() => {
    if (!selectedRoadId || !result) return null;
    for (const m of result.machines || []) {
      const r = (m.roads || []).find((rd) => rd.roadId === selectedRoadId);
      if (r) return { road: r, actualSegments: m.actualRouteSegments || [] };
    }
    return null;
  }, [selectedRoadId, result]);

  const hasResults = result && (result.machines || []).length > 0;

  return (
    <div className="space-y-5 p-4 sm:p-6">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Planned vs Actual</h1>
        <p className="mt-0.5 text-xs text-gray-500">
          Compare daily sweeping plan against actual GPS route from{' '}
          <span className="font-mono font-semibold">vehicleroutehistories</span>
        </p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="rounded-t-xl px-5 py-3" style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
          <h2 className="text-sm font-bold text-white">Select Plan</h2>
        </div>
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end sm:flex-wrap">
          {/* Project */}
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Project</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setResult(null); }}
            >
              <option value="">— Select Project —</option>
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>{p.projectName} ({p.projectId})</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="sm:w-44">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Date</label>
            <input
              type="date"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={date}
              onChange={(e) => { setDate(e.target.value); setResult(null); }}
            />
          </div>

          {/* Machine filter */}
          <div className="sm:w-52">
            <label className="mb-1 block text-xs font-semibold text-gray-600">Machine (optional)</label>
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              disabled={!projectId}
            >
              <option value="">All Machines</option>
              {machines.map((m) => (
                <option key={m.machineId} value={m.machineId}>{m.machineName} ({m.machineId})</option>
              ))}
            </select>
          </div>

          {/* Load button */}
          <button
            onClick={load}
            disabled={loading || !projectId || !date}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-60 hover:opacity-90 transition-opacity"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            {loading ? (
              <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Calculating…</>
            ) : (
              <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>Load Report</>
            )}
          </button>
        </div>
      </div>



      {/* Error */}
      {error && (
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Empty states */}
      {!projectId && !loading && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
          Select a project and date to view the planned vs actual report.
        </div>
      )}

      {projectId && !loading && !result && !error && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center text-sm text-gray-400">
          Click "Load Report" to calculate planned vs actual for <strong>{fmtDate(date)}</strong>.
        </div>
      )}

      {/* No plan */}
      {result && !hasResults && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-14 text-center">
          <p className="text-sm font-medium text-gray-500">{result.message || 'No active sweeping plan found.'}</p>
          <p className="mt-1 text-xs text-gray-400">
            Generate a daily plan first from <strong>Sweeping Mgmt → Daily Plan</strong>.
          </p>
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <>
          {/* Summary */}
          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Summary — {fmtDate(result.summary?.date)} · {result.summary?.projectName}
            </p>
            <SummaryCards summary={result.summary} />
          </div>

          {/* Per-road detail map (when a road is selected) */}
          {selectedRoadData && (
            <RoadMapPanel
              selectedRoad={selectedRoadData.road}
              actualSegments={selectedRoadData.actualSegments}
            />
          )}

          {/* Machine cards */}
          <div className="space-y-4">
            <p className="text-sm font-bold text-gray-700">
              Machine-wise Breakdown
              <span className="ml-2 text-gray-400 font-normal">
                ({result.machines.length} machine{result.machines.length !== 1 ? 's' : ''})
              </span>
            </p>
            {result.machines.map((m) => (
              <MachineCard
                key={m.machineId}
                machine={m}
                selectedRoadId={selectedRoadId}
                onSelectRoad={setSelectedRoadId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
