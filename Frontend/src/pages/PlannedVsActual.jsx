/**
 * PlannedVsActual.jsx
 *
 * Planned vs Actual GPS Route + Road Completion page.
 *
 * SOURCE: vehicleroutehistories (via /api/planned-vs-actual)
 * NOTE:   No hardware sweeping signal — coverage based on GPS proximity to road geometry.
 *         Ignition ON ≠ Sweeping ON. sweepingStatus = 'unknown' where signal unavailable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchMachines, fetchPlannedVsActual, fetchProjects } from '../api';

const PURPLE = '#4a3569';

const MACHINE_COLORS = [
  { base: '#ef4444', light: '#fca5a5', name: 'Red' },
  { base: '#3b82f6', light: '#93c5fd', name: 'Blue' },
  { base: '#10b981', light: '#6ee7b7', name: 'Emerald' },
  { base: '#f59e0b', light: '#fcd34d', name: 'Amber' },
  { base: '#8b5cf6', light: '#c4b5fd', name: 'Violet' },
  { base: '#ec4899', light: '#f9a8d4', name: 'Pink' },
  { base: '#14b8a6', light: '#5eead4', name: 'Teal' },
  { base: '#f97316', light: '#fdba74', name: 'Orange' },
  { base: '#06b6d4', light: '#67e8f9', name: 'Cyan' },
  { base: '#6366f1', light: '#a5b4fc', name: 'Indigo' },
  { base: '#d946ef', light: '#f0abfc', name: 'Fuchsia' },
  { base: '#84cc16', light: '#bef264', name: 'Lime' },
];

function getMachineColor(index) {
  return MACHINE_COLORS[index % MACHINE_COLORS.length];
}

const _machineIconCache = new Map();
function getMachineIcon(color, labelText, index) {
  const key = `${color.base}|${labelText}|${index}`;
  if (_machineIconCache.has(key)) return _machineIconCache.get(key);

  const badge = String(labelText || (index + 1)).slice(0, 3).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
      <defs>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <path filter="url(#s)" d="M17 0C7.6 0 0 7.2 0 16.1c0 10.7 15 24.9 15.8 25.6a1.2 1.2 0 0 0 2.4 0C19 41 34 26.8 34 16.1 34 7.2 26.4 0 17 0Z" fill="${color.base}" stroke="#fff" stroke-width="2"/>
      <circle cx="17" cy="14.5" r="9" fill="#fff" opacity="0.95"/>
      <text x="17" y="18.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="800" fill="${color.base}">${badge}</text>
    </svg>`;

  const icon = L.divIcon({
    className: 'machine-map-icon',
    html: svg,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42],
    tooltipAnchor: [0, -40],
  });

  _machineIconCache.set(key, icon);
  return icon;
}

function getMachineBadgeText(machine, index) {
  if (machine.machineId && /^\d/.test(machine.machineId)) {
    const m = String(machine.machineId).match(/\d{1,3}/);
    if (m) return m[0];
  }
  const id = machine.machineId || machine.machineName || '';
  if (id) return id.slice(0, 3).toUpperCase();
  return String(index + 1);
}

// ── Haversine distance (meters) between two [lat, lng] points ────────────────
function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Min distance from a point to nearest in pts array (meters) ────────────────
function minDistanceToAny(pt, pts, maxMeters = Infinity) {
  let best = maxMeters;
  for (let i = 0; i < pts.length; i++) {
    const d = haversineMeters(pt, pts[i]);
    if (d < best) {
      best = d;
      if (best <= 0) return 0;
    }
  }
  return best;
}

// ── Total length of a polyline (array of [lat, lng]) in KM ────────────────────
function polylineLengthKm(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += haversineMeters(pts[i], pts[i + 1]);
  }
  return total / 1000;
}

// ── Flatten array of segments [[lat,lng]...] into flat [[lat,lng]] ────────────
function flattenOneLevel(segments) {
  return segments.reduce((acc, seg) => acc.concat(seg), []);
}

// ── Road coverage metrics — uses the EXACT SAME logic as visual map ────────────
// (vertex 20m-proximity; segment covered = start OR end vertex covered)
// This guarantees table values match the green / yellow visual on the map.
function calcRoadCoverage(plannedRoute, actualFlat, radiusM = 200) {
  const planned = plannedRoute || [];
  const plannedKm = polylineLengthKm(planned);
  if (planned.length < 2 || plannedKm <= 0) {
    return { plannedKm: 0, coveredKm: 0, missedKm: 0, coveragePercent: 100, status: 'completed' };
  }
  // No actual GPS data → everything missed
  if (!Array.isArray(actualFlat) || actualFlat.length === 0) {
    return { plannedKm: round2(plannedKm), coveredKm: 0, missedKm: round2(plannedKm), coveragePercent: 0, status: 'not_completed' };
  }
  const { covered, missed } = splitPlannedByProximity(planned, actualFlat, radiusM);
  const coveredKm = covered.reduce((s, seg) => s + polylineLengthKm(seg), 0);
  const missedKm  = missed.reduce((s, seg)  => s + polylineLengthKm(seg),  0);
  // Use actual segment sums — more accurate than plannedKm - coveredKm
  const total = coveredKm + missedKm;
  const coveragePercent = total > 0 ? Math.min((coveredKm / total) * 100, 100) : 100;
  let status;
  if (coveragePercent >= 99) status = 'completed';
  else if (coveragePercent >= 50) status = 'partially_completed';
  else                            status = 'not_completed';
  return {
    plannedKm:       round2(plannedKm),
    coveredKm:       round2(coveredKm),
    missedKm:        round2(missedKm),
    coveragePercent: round2(coveragePercent),
    status,
  };
}

// ── Split a planned polyline into COVERED / MISSED segments ───────────────────
// Algorithm:
//   For each planned segment A→B:
//     1. Sample the segment at ~10m intervals (interpolated points)
//     2. If ANY sampled point is within radiusM of ANY actual GPS point → covered
//   This handles sparse planned waypoints correctly.

function interpolateSegment(a, b, stepMeters = 10) {
  // Returns array of [lat,lng] points along A→B spaced ~stepMeters apart
  const totalM = haversineMeters(a, b);
  if (totalM <= stepMeters) return [a, b];
  const steps = Math.ceil(totalM / stepMeters);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
  }
  return pts;
}

function splitPlannedByProximity(planned, actualFlat, radiusM = 200) {
  if (!Array.isArray(planned) || planned.length < 2) return { covered: [], missed: [] };
  if (!Array.isArray(actualFlat) || actualFlat.length === 0) {
    return { covered: [], missed: [planned] };
  }

  // Build a dense set of actual GPS points by interpolating between consecutive GPS points.
  // GPS polls every ~30-60s; at sweeper speed (~20-30 km/h) gaps can be 200-500m.
  // Without interpolation, planned segments between two GPS points get missed.
  const denseActual = [];
  for (let i = 0; i < actualFlat.length - 1; i++) {
    const pts = interpolateSegment(actualFlat[i], actualFlat[i + 1], 15);
    for (const p of pts) denseActual.push(p);
  }
  if (actualFlat.length > 0) denseActual.push(actualFlat[actualFlat.length - 1]);

  // For each planned segment, sample it and check proximity to dense actual GPS
  function segmentCovered(a, b) {
    const samples = interpolateSegment(a, b, 10);
    for (const sample of samples) {
      for (let i = 0; i < denseActual.length; i++) {
        if (haversineMeters(sample, denseActual[i]) <= radiusM) return true;
      }
    }
    return false;
  }

  const covered = [];
  const missed  = [];
  let current   = null;

  for (let i = 0; i < planned.length - 1; i++) {
    const a   = planned[i];
    const b   = planned[i + 1];
    const cls = segmentCovered(a, b);

    if (!current || current.cls !== cls) {
      if (current && current.arr.length >= 2) {
        if (current.cls) covered.push(current.arr); else missed.push(current.arr);
      }
      current = { cls, arr: [[a[0], a[1]]] };
    }
    current.arr.push([b[0], b[1]]);
  }
  if (current && current.arr.length >= 2) {
    if (current.cls) covered.push(current.arr); else missed.push(current.arr);
  }
  return { covered, missed };
}

// ── Zoomable Marker wrapper (click → pan + zoom to coords) ─────────────────────────────
function ZoomableMarker({ position, icon, zIndexOffset, zoomCoords, children }) {
  const map = useMap();
  const handleClick = useCallback(() => {
    if (!zoomCoords || zoomCoords.length < 2) {
      try { map.panTo(position, { animate: true, duration: 0.6 }); } catch (_) {}
      return;
    }
    try {
      map.fitBounds(L.latLngBounds(zoomCoords), {
      padding: [60, 60],
      maxZoom: 16,
      animate: true,
      duration: 0.6,
    });
    } catch (_) {}
  }, [map, zoomCoords, position]);

  return (
    <Marker
      position={position}
      icon={icon}
      zIndexOffset={zIndexOffset}
      title="Click to zoom to this machine"
      eventHandlers={{ click: handleClick }}
    >
      {children}
    </Marker>
  );
}

// ── Leaflet fix ───────────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── GPS dot coord tooltip style (injected once) ────────────────────────────────
(function injectGpsDotStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gps-dot-coord-style')) return;
  const el = document.createElement('style');
  el.id = 'gps-dot-coord-style';
  el.textContent = `
    .leaflet-tooltip.gps-dot-coord {
      box-shadow: none !important;
      padding: 0 !important;
      margin: 0 !important;
      background: transparent !important;
      border: none !important;
      pointer-events: none !important;
      z-index: 500 !important;
      max-width: none !important;
      width: auto !important;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.18));
    }
    .leaflet-tooltip.gps-dot-coord::before { display: none !important; }
    .leaflet-tooltip-pane { z-index: 480 !important; }
  `;
  document.head.appendChild(el);
})();

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
// Uses stable JSON-stringified signature so new array references with identical
// content (e.g. from cursor hover re-renders) do NOT re-trigger fitBounds.
function FlyToCoords({ coords }) {
  const map = useMap();
  const lastSig = useRef('');
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    const sig = `${coords.length}|${JSON.stringify(coords[0])}|${JSON.stringify(coords[coords.length - 1])}`;
    if (sig === lastSig.current) return; // skip — no real change
    lastSig.current = sig;
    try { map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17, animate: true }); } catch (_) {}
  }, [coords, map]);
  return null;
}

// ── Road map panel ────────────────────────────────────────────────────────────
// Signature-stable FitBounds — ignores new array references if content is identical.
// This prevents cursor hover (cursorLatLng updates) from resetting user's zoom level.
function FitBounds({ coords }) {
  const map = useMap();
  const lastSig = useRef('');
  useEffect(() => {
    if (coords.length < 2) return;
    const sig = `${coords.length}|${JSON.stringify(coords[0])}|${JSON.stringify(coords[coords.length - 1])}`;
    if (sig === lastSig.current) return; // skip — same data, just a new array ref
    lastSig.current = sig;
    try { map.fitBounds(L.latLngBounds(coords), { padding: [40, 40], maxZoom: 17 }); } catch (_) {}
  }, [coords, map]);
  return null;
}

function RoadMapPanel({ selectedRoad, actualSegments }) {
  const planned = selectedRoad?.plannedRoute || [];
  const actual  = actualSegments || [];
  const [flyTarget, setFlyTarget] = useState(null);
  const [cursorLatLng, setCursorLatLng] = useState(null);
  const [showGpsDots, setShowGpsDots] = useState(false);

  const actualAllPts = useMemo(() => actual.flat(), [actual]);
  const totalActualPts = actualAllPts.length;

  const { covered: coveredSegs, missed: missedSegs } = useMemo(
    () => splitPlannedByProximity(planned, actualAllPts, 200),
    [planned, actualAllPts]
  );

  const allCoords = useMemo(() => [...planned, ...actualAllPts], [planned, actualAllPts]);
  const center = allCoords.length > 0 ? allCoords[0] : [28.6139, 77.2090];

  const flyCoords = useMemo(
    () => (flyTarget === 'planned' ? planned : flyTarget === 'actual' ? actualAllPts : null),
    [flyTarget, planned, actualAllPts]
  );

  const hoverHandlers = useMemo(() => ({
    mousemove: (e) => setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng }),
    mouseout:  () => setCursorLatLng(null),
  }), []);

  function LatLngFooter() {
    if (!cursorLatLng) return null;
    const { lat, lng } = cursorLatLng;
    return (
      <div style={{
        marginTop: 6,
        padding: '3px 6px',
        background: '#f3f4f6',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 10.5,
        color: '#374151',
        whiteSpace: 'nowrap',
        textAlign: 'left',
      }}>
        📍 {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      {/* Header with clickable Planned / Actual buttons */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
        <h3 className="text-sm font-bold text-white">
          Route Map — {selectedRoad?.roadName || 'All Roads'}
        </h3>
        <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={() => setShowGpsDots((v) => !v)}
            disabled={totalActualPts === 0}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors disabled:opacity-40 ${
              showGpsDots ? 'bg-white/90 text-violet-800 shadow-inner' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            {showGpsDots ? '●● Coords' : '○○ Coords'}
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
        <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
          <span className="inline-block h-1.5 w-5 rounded" style={{ background: '#22c55e' }}/>
          <span className="font-semibold text-emerald-700">Covered (200m)</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
          <span className="inline-block h-1.5 w-5 rounded" style={{ background: '#eab308' }}/>
          <span className="font-semibold text-yellow-700">Missed (200m)</span>
        </div>
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
          {allCoords.length >= 2 && <FitBounds coords={allCoords} />}
          {flyCoords && flyCoords.length >= 2 && <FlyToCoords coords={flyCoords} />}

          {missedSegs.map((seg, idx) =>
            seg.length >= 2 ? (
              <Polyline
                key={`missed-${idx}`}
                positions={seg}
                pathOptions={{ color: '#eab308', weight: 8, opacity: 0.9, dashArray: '12, 7' }}
                eventHandlers={hoverHandlers}
              >
                <Tooltip sticky>
                  <div>
                    ⚠️ MISSED: Planned segment outside 200m of actual GPS
                    <LatLngFooter />
                  </div>
                </Tooltip>
              </Polyline>
            ) : null
          )}
          {coveredSegs.map((seg, idx) =>
            seg.length >= 2 ? (
              <Polyline
                key={`covered-${idx}`}
                positions={seg}
                pathOptions={{ color: '#22c55e', weight: 8, opacity: 0.95 }}
                eventHandlers={hoverHandlers}
              >
                <Tooltip sticky>
                  <div>
                    ✅ COVERED: Planned segment within 200m of actual GPS
                    <LatLngFooter />
                  </div>
                </Tooltip>
              </Polyline>
            ) : null
          )}

          {planned.length >= 2 && (coveredSegs.length === 0 && missedSegs.length === 0) && (
            <Polyline
              positions={planned}
              pathOptions={{ color: '#3b82f6', weight: 5, opacity: 0.85 }}
              eventHandlers={hoverHandlers}
            >
              <Tooltip sticky>
                <div>
                  📋 Planned: {selectedRoad?.roadName}
                  <LatLngFooter />
                </div>
              </Tooltip>
            </Polyline>
          )}

          {actual.map((seg, idx) =>
            seg.length >= 2 ? (
              <Polyline
                key={`actual-${idx}`}
                positions={seg}
                pathOptions={{ color: '#10b981', weight: 3, opacity: 0.9 }}
                eventHandlers={hoverHandlers}
              >
                <Tooltip sticky>
                  <div>
                    🛣 Actual GPS Track (segment {idx + 1})
                    <LatLngFooter />
                  </div>
                </Tooltip>
              </Polyline>
            ) : null
          )}

          {showGpsDots && actual.map((seg, sidx) =>
            seg && seg.map((pt, pidx) => {
              const side = (pidx + (sidx % 2)) % 2 === 0 ? 'right' : 'left';
              return (
                <CircleMarker
                  key={`gdot-${sidx}-${pidx}`}
                  center={pt}
                  radius={2.5}
                  pathOptions={{ color: '#059669', fillColor: '#059669', fillOpacity: 1, weight: 0 }}
                  eventHandlers={hoverHandlers}
                >
                  <Tooltip
                    permanent
                    direction="top"
                    offset={[side === 'right' ? 6 : -6, -2]}
                    opacity={1}
                    className="gps-dot-coord"
                  >
                    <div style={{
                      padding: '3px 6px',
                      background: '#f3f4f6',
                      borderRadius: 6,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 10.5,
                      color: '#374151',
                      whiteSpace: 'nowrap',
                      textAlign: 'left',
                    }}>
                      📍 {pt[0].toFixed(6)}, {pt[1].toFixed(6)}
                    </div>
                  </Tooltip>
                </CircleMarker>
              );
            })
          )}

          {showGpsDots && planned.map((pt, pidx) => {
            const side = (pidx + 1) % 2 === 0 ? 'right' : 'left';
            return (
              <CircleMarker
                key={`pdot-${pidx}`}
                center={pt}
                radius={2.5}
                pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1, weight: 0 }}
                eventHandlers={hoverHandlers}
              >
                <Tooltip
                  permanent
                  direction="top"
                  offset={[side === 'right' ? 6 : -6, -2]}
                  opacity={1}
                  className="gps-dot-coord"
                >
                  <div style={{
                    padding: '3px 6px',
                    background: '#eff6ff',
                    borderRadius: 6,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 10.5,
                    color: '#1e3a8a',
                    whiteSpace: 'nowrap',
                    textAlign: 'left',
                    border: '1px solid #2563eb',
                  }}>
                    📋 {pt[0].toFixed(6)}, {pt[1].toFixed(6)}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}

// ── Combined (all machines) map ───────────────────────────────────────────────
function CombinedMapPanel({ machines }) {
  const [showPlanned, setShowPlanned] = useState(true);
  const [showActual,  setShowActual]  = useState(true);
  const [showGpsDots, setShowGpsDots] = useState(false); // per-point GPS dot markers
  const [flyTarget, setFlyTarget] = useState(null);
  const [cursorLatLng, setCursorLatLng] = useState(null);

  const allCoords = useMemo(() => {
    const acc = [];
    machines.forEach((m) => {
      (m.roads || []).forEach((r) => {
        if (r.plannedRoute && r.plannedRoute.length > 0) acc.push(...r.plannedRoute);
      });
      (m.actualRouteSegments || []).forEach((seg) => {
        if (seg && seg.length > 0) acc.push(...seg);
      });
    });
    return acc;
  }, [machines]);

  const center = allCoords.length > 0 ? allCoords[0] : [28.6139, 77.2090];

  const flyCoords = useMemo(() => (
    flyTarget === 'planned'
      ? machines.flatMap((m) => (m.roads || []).flatMap((r) => r.plannedRoute || []))
      : flyTarget === 'actual'
        ? machines.flatMap((m) => (m.actualRouteSegments || []).flat())
        : null
  ), [flyTarget, machines]);

  // "Fit All" also uses the combined allCoords — treat `all` as a sentinel by
  // mapping it into the coords-prop signature used by FlyToCoords.
  const flyCoordsEffective = flyTarget === 'all' ? allCoords : flyCoords;

  const totalActualPts = useMemo(
    () => machines.reduce((s, m) => s + (m.actualRouteSegments || []).reduce((a, seg) => a + seg.length, 0), 0),
    [machines]
  );
  const totalPlannedRoads = useMemo(
    () => machines.reduce((s, m) => s + (m.roads || []).length, 0),
    [machines]
  );

  const hoverHandlers = useMemo(() => ({
    mousemove: (e) => setCursorLatLng({ lat: e.latlng.lat, lng: e.latlng.lng }),
    mouseout:  () => setCursorLatLng(null),
  }), []);

  // Helper: renders a mono font Lat/Lng footer if cursorLatLng is available
  function LatLngFooter() {
    if (!cursorLatLng) return null;
    const { lat, lng } = cursorLatLng;
    return (
      <div style={{
        marginTop: 6,
        padding: '3px 6px',
        background: '#f3f4f6',
        borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 10.5,
        color: '#374151',
        whiteSpace: 'nowrap',
        textAlign: 'left',
      }}>
        📍 {lat.toFixed(6)}, {lng.toFixed(6)}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5"
        style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
        <h3 className="text-sm font-bold text-white">
          🗺 Combined Route Map — All Machines ({machines.length})
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPlanned((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
              showPlanned ? 'bg-white/90 text-violet-800 shadow-inner' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Planned
          </button>
          <button
            type="button"
            onClick={() => setShowActual((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
              showActual ? 'bg-white/90 text-violet-800 shadow-inner' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            Actual GPS
          </button>
          <button
            type="button"
            onClick={() => setShowGpsDots((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.65rem] font-semibold transition-colors ${
              showGpsDots ? 'bg-white/90 text-violet-800 shadow-inner' : 'bg-white/15 text-white hover:bg-white/25'
            }`}
          >
            {showGpsDots ? '●● Coords' : '○○ Coords'}
          </button>
          <button
            type="button"
            onClick={() => setFlyTarget(flyTarget === 'all' ? null : 'all')}
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[0.65rem] font-semibold text-white hover:bg-white/25 transition-colors"
          >
            🔍 Fit All
          </button>
        </div>
      </div>

      {/* Legend + Stats */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs">
        <div className="flex flex-wrap gap-4">
          {/* Global coverage legend */}
          <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
            <span className="inline-block h-1.5 w-5 rounded" style={{ background: '#22c55e' }}/>
            <span className="font-semibold text-emerald-700">Covered (Planned)</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-gray-200">
            <span className="inline-block h-1.5 w-5 rounded" style={{ background: '#eab308' }}/>
            <span className="font-semibold text-yellow-700">Missed (Planned)</span>
          </div>
          <span className="mx-1 h-4 w-px bg-gray-300" />
          {/* Per-machine actual GPS legend */}
          {machines.map((m, i) => {
            const color = getMachineColor(i);
            return (
              <div key={m.machineId} className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-5 rounded" style={{ background: color.base }}/>
                <span className="font-semibold text-gray-700">{m.machineId}</span>
                <span className="text-gray-400 font-mono text-[0.6rem]">{m.vehicleNumber}</span>
              </div>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-4 text-gray-600">
          <span>
            <span className="font-medium text-gray-500">Planned Roads: </span>
            <span className="font-semibold text-gray-700">{totalPlannedRoads}</span>
          </span>
          <span>
            <span className="font-medium text-gray-500">GPS Points: </span>
            <span className="font-semibold text-gray-700">{totalActualPts}</span>
          </span>
        </div>
      </div>

      {/* Map */}
      <div style={{ height: 480 }}>
        <MapContainer center={center} zoom={13} className="h-full w-full" style={{ zIndex: 0 }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Default (no flyTarget): auto fit to all coords on first render only */}
          {!flyTarget && allCoords.length >= 2 && <FitBounds coords={allCoords} />}
          {/* Fit All button: use animated FlyToCoords + key to force re-run on click */}
          {flyTarget === 'all' && allCoords.length >= 2 && (
            <FlyToCoords key={`fitall-${Date.now()}`} coords={allCoords} />
          )}
          {flyCoordsEffective && flyCoordsEffective.length >= 2 && flyTarget !== 'all' && (
            <FlyToCoords coords={flyCoordsEffective} />
          )}

          {/* Draw each machine's planned + actual routes */}
          {machines.flatMap((m, i) => {
            const color = getMachineColor(i);
            const label = `${m.machineId}${m.machineName ? ' — ' + m.machineName : ''}`;
            const badgeText = getMachineBadgeText(m, i);
            const icon = getMachineIcon(color, badgeText, i);
            const elements = [];

            const hoverTitle = `${label}${m.vehicleNumber ? '  ·  ' + m.vehicleNumber : ''}`;
            const machineZoomCoords = [];
            (m.roads || []).forEach((r) => {
              if (r.plannedRoute) machineZoomCoords.push(...r.plannedRoute);
            });
            (m.actualRouteSegments || []).forEach((seg) => {
              if (seg) machineZoomCoords.push(...seg);
            });

            // Flatten all actual GPS points for this machine — used for 20m proximity check
            const actualFlat = (m.actualRouteSegments || []).flat();

            if (showPlanned) {
              const firstPlannedRoad = (m.roads || []).find((r) => r.plannedRoute && r.plannedRoute.length >= 1);
              if (firstPlannedRoad) {
                const pStart = firstPlannedRoad.plannedRoute[0];
                elements.push(
                  <ZoomableMarker
                    key={`${m.machineId}-icon-p`}
                    position={pStart}
                    icon={icon}
                    zIndexOffset={1000 - i}
                    zoomCoords={machineZoomCoords}
                  >
                    <Tooltip direction="top" offset={[0, -38]} opacity={1} permanent={false}>
                      <div style={{ textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                        <div style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#dbeafe',
                          color: '#1d4ed8',
                          fontSize: 11,
                          fontWeight: 800,
                          marginBottom: 4,
                          letterSpacing: 0.3,
                        }}>
                          📋 PLANNED ROUTE
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{hoverTitle}</div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>
                          Start of planned sequence · {m.roads?.length ?? 0} road{m.roads?.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </Tooltip>
                  </ZoomableMarker>
                );
              }

              (m.roads || []).forEach((r, ridx) => {
                // Re-compute covered / missed visual segments using 20m proximity check
                // (any planned vertex within 20m of ANY actual GPS point → covered)
                const { covered: coveredSegs, missed: missedSegs } = splitPlannedByProximity(
                  r.plannedRoute || [],
                  actualFlat,
                  200
                );

                if (coveredSegs.length > 0 || missedSegs.length > 0) {
                  missedSegs.forEach((seg, s2) => {
                    if (seg && seg.length >= 2) {
                      elements.push(
                        <Polyline
                          key={`${m.machineId}-m-${ridx}-${s2}`}
                          positions={seg}
                          pathOptions={{
                            color: '#eab308',
                            weight: 8,
                            opacity: 0.9,
                            dashArray: '12, 7',
                          }}
                          eventHandlers={hoverHandlers}
                        >
                          <Tooltip sticky>
                            <div>
                              ⚠️ [{label}] MISSED (200m-proximity): {r.roadName} ({round2(r.missedKm ?? r.plannedKm)} KM missed)
                              <LatLngFooter />
                            </div>
                          </Tooltip>
                        </Polyline>
                      );
                    }
                  });
                  coveredSegs.forEach((seg, s1) => {
                    if (seg && seg.length >= 2) {
                      elements.push(
                        <Polyline
                          key={`${m.machineId}-c-${ridx}-${s1}`}
                          positions={seg}
                          pathOptions={{
                            color: '#22c55e',
                            weight: 8,
                            opacity: 0.95,
                          }}
                          eventHandlers={hoverHandlers}
                        >
                          <Tooltip sticky>
                            <div>
                              ✅ [{label}] COVERED (within 200m): {r.roadName} ({round2(r.actualKm)} KM covered)
                              <LatLngFooter />
                            </div>
                          </Tooltip>
                        </Polyline>
                      );
                    }
                  });
                } else if (r.plannedRoute && r.plannedRoute.length >= 2) {
                  elements.push(
                    <Polyline
                      key={`${m.machineId}-p-${ridx}`}
                      positions={r.plannedRoute}
                      pathOptions={{
                        color: '#eab308',
                        weight: 8,
                        opacity: 0.9,
                        dashArray: '12, 7',
                      }}
                      eventHandlers={hoverHandlers}
                    >
                      <Tooltip sticky>
                        <div>
                          📋 [{label}] Planned: {r.roadName} ({round2(r.plannedKm)} KM)
                          <LatLngFooter />
                        </div>
                      </Tooltip>
                    </Polyline>
                  );
                }

                // Planned vertex coord labels (only when showGpsDots ON)
                if (showGpsDots && r.plannedRoute) {
                  r.plannedRoute.forEach((pt, pidx) => {
                    const side = (pidx + ridx + 1) % 2 === 0 ? 'right' : 'left';
                    const labelBg = color.light + '70';
                    elements.push(
                      <CircleMarker
                        key={`${m.machineId}-pd-${ridx}-${pidx}`}
                        center={pt}
                        radius={2.2}
                        pathOptions={{
                          color: '#6d28d9',
                          fillColor: '#6d28d9',
                          fillOpacity: 1,
                          weight: 0,
                        }}
                      >
                        <Tooltip
                          permanent
                          direction="top"
                          offset={[side === 'right' ? 6 : -6, -2]}
                          opacity={1}
                          className="gps-dot-coord"
                        >
                          <div style={{
                            padding: '3px 6px',
                            background: '#f5f3ff',
                            borderRadius: 6,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            fontSize: 10,
                            color: '#4c1d95',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                            border: '1px solid #6d28d9',
                          }}>
                            📋 {pt[0].toFixed(6)}, {pt[1].toFixed(6)}
                          </div>
                        </Tooltip>
                      </CircleMarker>
                    );
                  });
                }
              });
            }

            if (showActual) {
              const allActualPts = (m.actualRouteSegments || []).flat();

              if (allActualPts.length > 0) {
                const midActual = allActualPts[Math.floor(allActualPts.length / 2)];
                elements.push(
                  <ZoomableMarker
                    key={`${m.machineId}-icon-a`}
                    position={midActual}
                    icon={icon}
                    zIndexOffset={1000 - i}
                    zoomCoords={machineZoomCoords}
                  >
                    <Tooltip direction="top" offset={[0, -38]} opacity={1} permanent={false}>
                      <div style={{ textAlign: 'center', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                        <div style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#d1fae5',
                          color: '#047857',
                          fontSize: 11,
                          fontWeight: 800,
                          marginBottom: 4,
                          letterSpacing: 0.3,
                        }}>
                          🛣 ACTUAL GPS
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{hoverTitle}</div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginTop: 2 }}>
                          Midpoint of real travel · {allActualPts.length} GPS point{allActualPts.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </Tooltip>
                  </ZoomableMarker>
                );

                elements.push(
                  <CircleMarker
                    key={`${m.machineId}-start`}
                    center={allActualPts[0]}
                    radius={7}
                    pathOptions={{ color: color.base, fillColor: color.base, fillOpacity: 1, weight: 2 }}
                    eventHandlers={hoverHandlers}
                  >
                    <Tooltip sticky>
                      <div>
                        🚦 [{label}] Start Point
                        <LatLngFooter />
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              }
              if (allActualPts.length > 1) {
                elements.push(
                  <CircleMarker
                    key={`${m.machineId}-end`}
                    center={allActualPts[allActualPts.length - 1]}
                    radius={7}
                    pathOptions={{
                      color: color.base,
                      fillColor: '#ffffff',
                      fillOpacity: 1,
                      weight: 3,
                      dashArray: '3, 2',
                    }}
                    eventHandlers={hoverHandlers}
                  >
                    <Tooltip sticky>
                      <div>
                        🏁 [{label}] End Point
                        <LatLngFooter />
                      </div>
                    </Tooltip>
                  </CircleMarker>
                );
              }

              (m.actualRouteSegments || []).forEach((seg, sidx) => {
                if (seg && seg.length >= 2) {
                  elements.push(
                    <Polyline
                      key={`${m.machineId}-a-${sidx}`}
                      positions={seg}
                      pathOptions={{
                        color: color.base,
                        weight: 3.5,
                        opacity: 0.95,
                      }}
                      eventHandlers={hoverHandlers}
                    >
                      <Tooltip sticky>
                        <div>
                          🛣 [{label}] Actual GPS Track (seg {sidx + 1})
                          <LatLngFooter />
                        </div>
                      </Tooltip>
                    </Polyline>
                  );
                }
                // Per-point GPS coordinate dots — ALL dots with labels
                if (showGpsDots && seg) {
                  seg.forEach((pt, pidx) => {
                    const side = (pidx + i + (sidx % 2)) % 2 === 0 ? 'right' : 'left';
                    elements.push(
                      <CircleMarker
                        key={`${m.machineId}-d-${sidx}-${pidx}`}
                        center={pt}
                        radius={2.2}
                        pathOptions={{
                          color: color.base,
                          fillColor: color.base,
                          fillOpacity: 1,
                          weight: 0,
                        }}
                      >
                        <Tooltip
                          permanent
                          direction="top"
                          offset={[side === 'right' ? 6 : -6, -2]}
                          opacity={1}
                          className="gps-dot-coord"
                        >
                          <div style={{
                            padding: '3px 6px',
                            background: '#f3f4f6',
                            borderRadius: 6,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            fontSize: 10,
                            color: '#374151',
                            whiteSpace: 'nowrap',
                            textAlign: 'left',
                          }}>
                            📍 {pt[0].toFixed(6)}, {pt[1].toFixed(6)}
                          </div>
                        </Tooltip>
                      </CircleMarker>
                    );
                  });
                }
              });
            }

            return elements;
          })}
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

  // ── Enrich result with CLIENT-SIDE coverage metrics using the EXACT SAME
  //    vertex-based 20m-proximity logic used to render green / yellow segments.
  //    This guarantees the numbers in the tables always match what you see on the map.
  const enrichedResult = useMemo(() => {
    if (!result) return null;
    const rawMachines = result.machines || [];

    const machines = rawMachines.map((m) => {
      const actualFlat = flattenOneLevel(m.actualRouteSegments || []);

      const roads = (m.roads || []).map((road) => {
        const cm = calcRoadCoverage(road.plannedRoute, actualFlat);
        return {
          ...road,
          plannedKm: cm.plannedKm,
          actualKm:  cm.coveredKm,
          missedKm:  cm.missedKm,
          coveragePercent: cm.coveragePercent,
          status: cm.status,
        };
      });

      const totalPlannedKm = round2(roads.reduce((s, r) => s + r.plannedKm, 0));
      const totalActualKm  = round2(roads.reduce((s, r) => s + r.actualKm,  0));
      const totalMissedKm = round2(roads.reduce((s, r) => s + r.missedKm, 0));
      const overallCoveragePercent = round2(totalPlannedKm > 0 ? (totalActualKm / totalPlannedKm) * 100 : 100);
      const completedCount            = roads.filter((r) => r.status === 'completed').length;
      const partiallyCompletedCount   = roads.filter((r) => r.status === 'partially_completed').length;
      const notCompletedCount         = roads.filter((r) => r.status === 'not_completed').length;

      return {
        ...m,
        roads,
        totalPlannedKm,
        totalActualKm,
        totalMissedKm,
        overallCoveragePercent,
        completedCount,
        partiallyCompletedCount,
        notCompletedCount,
      };
    });

    // ── Top-level summary from enriched machine numbers
    const totalPlannedKm = round2(machines.reduce((s, m) => s + m.totalPlannedKm, 0));
    const totalActualKm  = round2(machines.reduce((s, m) => s + m.totalActualKm,  0));
    const totalMissedKm = round2(machines.reduce((s, m) => s + m.totalMissedKm, 0));
    const overallCoveragePercent = round2(totalPlannedKm > 0 ? (totalActualKm / totalPlannedKm) * 100 : 100);
    const totalRoads = machines.reduce((s, m) => s + (m.roads?.length || 0), 0);
    const completedCount            = machines.reduce((s, m) => s + m.completedCount, 0);
    const partiallyCompletedCount   = machines.reduce((s, m) => s + m.partiallyCompletedCount, 0);
    const notCompletedCount         = machines.reduce((s, m) => s + m.notCompletedCount, 0);

    return {
      ...result,
      machines,
      summary: {
        ...(result.summary || {}),
        totalPlannedKm,
        totalActualKm,
        totalMissedKm,
        overallCoveragePercent,
        totalRoads,
        completedCount,
        partiallyCompletedCount,
        notCompletedCount,
      },
    };
  }, [result]);

  // Derived — find selected road data for individual map
  const selectedRoadData = useMemo(() => {
    if (!selectedRoadId || !enrichedResult) return null;
    for (const m of enrichedResult.machines || []) {
      const r = (m.roads || []).find((rd) => rd.roadId === selectedRoadId);
      if (r) return { road: r, actualSegments: m.actualRouteSegments || [] };
    }
    return null;
  }, [selectedRoadId, enrichedResult]);

  const hasResults = enrichedResult && (enrichedResult.machines || []).length > 0;

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

          {/* Combined map — all machines */}
          <CombinedMapPanel machines={result.machines} />

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
