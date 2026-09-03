import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { createRoad, fetchMachines, fetchProjects, fetchRoad, fetchRoads, updateRoad } from '../api';

// ─── Haversine distance (km) between two lat/lng points ──────────────────────
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Calculate total polyline length from points array ───────────────────────
function calcTotalLength(pts) {
  const valid = pts.filter((p) => p.lat !== '' && p.lng !== '');
  if (valid.length < 2) return null;
  let total = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    total += haversineKm(
      Number(valid[i].lat),   Number(valid[i].lng),
      Number(valid[i + 1].lat), Number(valid[i + 1].lng),
    );
  }
  return isNaN(total) ? null : total;
}

// ─── Generate next Road ID from existing roads list ───────────────────────────
function generateRoadId(projectId, existingRoads) {
  if (!projectId) return '';
  // Find the highest numeric suffix among existing IDs like PRJ-RD-001
  const prefix = `${projectId}-RD-`;
  let maxNum = 0;
  for (const r of existingRoads) {
    if (r.roadId && r.roadId.toUpperCase().startsWith(prefix.toUpperCase())) {
      const num = parseInt(r.roadId.slice(prefix.length), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const next = maxNum + 1;
  return `${projectId}-RD-${String(next).padStart(3, '0')}`;
}

const PURPLE = '#4a3569';
const DEFAULT_CENTER = [28.6139, 77.2090]; // New Delhi

// ─── Leaflet default icon fix ─────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function makeIcon(seq, type) {
  const color =
    type === 'start' ? '#16a34a' :
    type === 'end'   ? '#dc2626' : '#2563eb';
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      color:#fff;
      width:26px;height:26px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      font-size:10px;font-weight:700;
    "><span style="transform:rotate(45deg)">${seq}</span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  });
}

// ─── Map click + mousemove/touchmove handler (rubber-band preview) ───────────
function MapClickHandler({ onMapClick, enabled, previewEnabled, onMouseMove, onMouseLeave }) {
  const map = useMapEvents({
    click(e) {
      if (!enabled) return;
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    mousemove(e) {
      if (!enabled || !previewEnabled) return;
      onMouseMove(e.latlng.lat, e.latlng.lng);
    },
    mouseout() {
      onMouseLeave();
    },
  });

  // ── Touch support for rubber-band preview ──────────────────────────────────
  useEffect(() => {
    const container = map.getContainer();

    function onTouchMove(e) {
      if (!enabled || !previewEnabled) return;
      if (e.touches.length !== 1) return; // ignore pinch-zoom
      e.preventDefault(); // prevent page scroll while drawing
      const touch = e.touches[0];
      const latlng = map.containerPointToLatLng(
        L.point(
          touch.clientX - container.getBoundingClientRect().left,
          touch.clientY - container.getBoundingClientRect().top,
        ),
      );
      onMouseMove(latlng.lat, latlng.lng);
    }

    function onTouchEnd() {
      onMouseLeave();
    }

    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', onTouchEnd);
    return () => {
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [map, enabled, previewEnabled, onMouseMove, onMouseLeave]);

  return null;
}

// ─── Map fit helper ───────────────────────────────────────────────────────────
function FitBoundsOnLoad({ points }) {
  const map = useMapEvents({});
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || points.length < 2) return;
    const valid = points.filter((p) => p.lat !== '' && p.lng !== '');
    if (valid.length < 2) return;
    try {
      const bounds = L.latLngBounds(valid.map((p) => [Number(p.lat), Number(p.lng)]));
      map.fitBounds(bounds, { padding: [40, 40] });
      fitted.current = true;
    } catch (_) {}
  }, [map, points]);
  return null;
}

// ─── Frequency sub-form ───────────────────────────────────────────────────────
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function FrequencyForm({ freq, onChange }) {
  function setType(type) {
    onChange({ type, startDate: '', days: [] });
  }
  function toggleDay(day) {
    const days = freq.days.includes(day)
      ? freq.days.filter((d) => d !== day)
      : [...freq.days, day];
    onChange({ ...freq, days });
  }

  return (
    <div className="space-y-2">
      <select
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        value={freq.type}
        onChange={(e) => setType(e.target.value)}
      >
        <option value="daily">Daily</option>
        <option value="alternate">Alternate Day</option>
        <option value="specific">Specific Days</option>
      </select>

      {freq.type === 'alternate' && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">Start Date</label>
          <input
            type="date"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            value={freq.startDate || ''}
            onChange={(e) => onChange({ ...freq, startDate: e.target.value })}
          />
        </div>
      )}

      {freq.type === 'specific' && (
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                freq.days.includes(day)
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {DAY_LABELS[day]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── GPS Point Row ────────────────────────────────────────────────────────────
function GpsPointRow({ point, index, total, onChange, onDelete }) {
  const inputCls =
    'w-full rounded border border-gray-300 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200';

  // Derive type from position if auto-mode; allow manual override
  function handleTypeChange(val) {
    onChange(index, { ...point, type: val });
  }
  function handleLatChange(val) {
    onChange(index, { ...point, lat: val });
  }
  function handleLngChange(val) {
    onChange(index, { ...point, lng: val });
  }

  return (
    <tr className="even:bg-gray-50 hover:bg-violet-50 transition-colors">
      <td className="border border-gray-300 px-2 py-1.5 text-center text-xs font-semibold text-gray-700">
        {point.sequence}
      </td>
      <td className="border border-gray-300 px-1 py-1">
        <select
          className={inputCls}
          value={point.type}
          onChange={(e) => handleTypeChange(e.target.value)}
        >
          <option value="start">Start</option>
          <option value="turn">Turn</option>
          <option value="end">End</option>
        </select>
      </td>
      <td className="border border-gray-300 px-1 py-1">
        <input
          type="number"
          step="any"
          className={inputCls}
          placeholder="e.g. 28.6139"
          value={point.lat}
          onChange={(e) => handleLatChange(e.target.value)}
        />
      </td>
      <td className="border border-gray-300 px-1 py-1">
        <input
          type="number"
          step="any"
          className={inputCls}
          placeholder="e.g. 77.2090"
          value={point.lng}
          onChange={(e) => handleLngChange(e.target.value)}
        />
      </td>
      <td className="border border-gray-300 px-2 py-1 text-center">
        <button
          type="button"
          onClick={() => onDelete(index)}
          className="rounded p-1 text-red-500 hover:bg-red-50 transition-colors"
          title="Delete point"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      <span>{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100">✕</button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function autoType(index, total) {
  if (total === 1) return 'start';
  if (index === 0) return 'start';
  if (index === total - 1) return 'end';
  return 'turn';
}

function recalcSequences(pts) {
  return pts.map((p, i) => ({
    ...p,
    sequence: i + 1,
    type: autoType(i, pts.length),
  }));
}

function pointsToApiFormat(pts) {
  return pts.map((p) => ({
    sequence: p.sequence,
    type: p.type,
    // GeoJSON: [longitude, latitude]
    coordinates: [parseFloat(p.lng), parseFloat(p.lat)],
  }));
}

function apiPointsToFormPoints(apiPts) {
  const sorted = [...apiPts].sort((a, b) => a.sequence - b.sequence);
  return sorted.map((p) => ({
    sequence: p.sequence,
    type: p.type,
    // GeoJSON [lng, lat] → display lat, lng separately
    lat: String(p.coordinates[1]),
    lng: String(p.coordinates[0]),
  }));
}

const EMPTY_FREQ = { type: 'daily', startDate: '', days: [] };
const EMPTY_FORM = {
  projectId: '',
  roadId: '',
  areaName: '',
  colonyName: '',
  roadName: '',
  totalLength: '',
  assignedMachineId: '',
  status: 'active',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RoadCreate() {
  const navigate = useNavigate();
  const { id } = useParams(); // present → edit mode
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [freq, setFreq] = useState({ ...EMPTY_FREQ });
  const [points, setPoints] = useState([]); // { sequence, type, lat, lng }
  const [formErrors, setFormErrors] = useState({});
  const [ptsError, setPtsError] = useState('');

  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [machines, setMachines]   = useState([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [loadingRoad, setLoadingRoad] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Auto-generation tracking
  const [roadIdAutoGenerated, setRoadIdAutoGenerated] = useState(false);  // true = current value was auto-set
  const [lengthAutoCalculated, setLengthAutoCalculated] = useState(false); // true = current value was auto-calc'd
  const [loadingRoadId, setLoadingRoadId] = useState(false);

  // Map click mode toggle
  const [mapClickEnabled, setMapClickEnabled] = useState(true);
  // Route line visibility toggle
  const [showRouteLine, setShowRouteLine] = useState(true);
  // Rubber-band: cursor position while hovering the map
  const [cursorPos, setCursorPos] = useState(null); // { lat, lng } | null

  function showToast(msg, type = 'success') { setToast({ message: msg, type }); }

  // ── Load projects dropdown ─────────────────────────────────────────────────
  useEffect(() => {
    fetchProjects()
      .then((res) => setProjects(Array.isArray(res.data) ? res.data.filter((p) => p.status === 'active') : []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, []);

  // ── Load road for edit mode ────────────────────────────────────────────────
  useEffect(() => {
    if (!isEdit) return;
    setLoadingRoad(true);
    fetchRoad(id)
      .then((res) => {
        const r = res.data;
        setForm({
          projectId:         r.projectId         || '',
          roadId:            r.roadId            || '',
          areaName:          r.areaName          || '',
          colonyName:        r.colonyName        || '',
          roadName:          r.roadName          || '',
          totalLength:       String(r.totalLength || ''),
          assignedMachineId: r.assignedMachineId || '',
          status:            r.status            || 'active',
        });
        setFreq({
          type:      r.sweepingFrequency?.type      || 'daily',
          startDate: r.sweepingFrequency?.startDate
            ? r.sweepingFrequency.startDate.slice(0, 10)
            : '',
          days: r.sweepingFrequency?.days || [],
        });
        setPoints(apiPointsToFormPoints(r.gpsPoints || []));
        // Allow auto-recalculation from loaded GPS points in edit mode
        setLengthAutoCalculated(true);
      })
      .catch((err) => showToast(err.message || 'Failed to load road', 'error'))
      .finally(() => setLoadingRoad(false));
  }, [isEdit, id]);

  // ── Auto-generate Road ID when project is selected (create mode only) ────────
  useEffect(() => {
    if (isEdit || !form.projectId) return;
    // Only auto-generate if the field is still empty or was previously auto-generated
    // (don't overwrite a value the user manually typed)
    if (form.roadId !== '' && !roadIdAutoGenerated) return;
    setLoadingRoadId(true);
    fetchRoads({ projectId: form.projectId })
      .then((res) => {
        const existing = Array.isArray(res.data) ? res.data : [];
        const suggested = generateRoadId(form.projectId, existing);
        setForm((f) => ({ ...f, roadId: suggested }));
        setRoadIdAutoGenerated(true);
        setFormErrors((e) => ({ ...e, roadId: '' }));
      })
      .catch(() => {
        // On error just leave the field as-is
      })
      .finally(() => setLoadingRoadId(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId, isEdit]);

  // ── Load machines for selected project (used in Assigned Machine dropdown) ──
  useEffect(() => {
    if (!form.projectId) { setMachines([]); return; }
    setLoadingMachines(true);
    fetchMachines({ projectId: form.projectId, status: 'active' })
      .then((res) => setMachines(Array.isArray(res.data) ? res.data : []))
      .catch(() => setMachines([]))
      .finally(() => setLoadingMachines(false));
  }, [form.projectId]);

  // ── Auto-calculate Total Length from GPS points ───────────────────────────
  useEffect(() => {
    if (!lengthAutoCalculated && form.totalLength !== '') return; // user typed a value → don't overwrite
    const km = calcTotalLength(points);
    if (km !== null) {
      setForm((f) => ({ ...f, totalLength: km.toFixed(3) }));
      setLengthAutoCalculated(true);
      setFormErrors((e) => ({ ...e, totalLength: '' }));
    } else if (points.filter((p) => p.lat !== '' && p.lng !== '').length === 0) {
      // All points removed → clear auto value but only if it was auto-set
      if (lengthAutoCalculated) {
        setForm((f) => ({ ...f, totalLength: '' }));
        setLengthAutoCalculated(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // ── Form field helpers ─────────────────────────────────────────────────────
  function setField(key, val) {
    setForm((f) => ({ ...f, [key]: val }));
    setFormErrors((e) => ({ ...e, [key]: '' }));
    // If user manually edits roadId or totalLength, stop auto-overwriting them
    if (key === 'roadId')      setRoadIdAutoGenerated(false);
    if (key === 'totalLength') setLengthAutoCalculated(false);
  }

  // ── Map click → add point ──────────────────────────────────────────────────
  function handleMapClick(lat, lng) {
    setPoints((prev) => {
      const next = [
        ...prev,
        { sequence: 0, type: 'turn', lat: lat.toFixed(6), lng: lng.toFixed(6) },
      ];
      return recalcSequences(next);
    });
    setPtsError('');
  }

  // ── Table edit ─────────────────────────────────────────────────────────────
  function handlePointChange(index, updated) {
    setPoints((prev) => {
      const next = prev.map((p, i) => (i === index ? updated : p));
      // Only recalc sequences, preserve manual types
      return next.map((p, i) => ({ ...p, sequence: i + 1 }));
    });
  }

  // ── Delete point ───────────────────────────────────────────────────────────
  function handleDeletePoint(index) {
    setPoints((prev) => recalcSequences(prev.filter((_, i) => i !== index)));
  }

  // ── Add blank point row ────────────────────────────────────────────────────
  function handleAddBlankPoint() {
    setPoints((prev) => {
      const next = [...prev, { sequence: 0, type: 'turn', lat: '', lng: '' }];
      return recalcSequences(next);
    });
  }

  // ── Validation ─────────────────────────────────────────────────────────────
  function validate() {
    const errs = {};
    if (!form.projectId)                errs.projectId        = 'Project is required';
    if (!form.roadId.trim())            errs.roadId           = 'Road ID is required';
    if (!form.areaName.trim())          errs.areaName         = 'Area name is required';
    if (!form.colonyName.trim())        errs.colonyName       = 'Colony name is required';
    if (!form.roadName.trim())          errs.roadName         = 'Road name is required';
    if (!form.assignedMachineId)        errs.assignedMachineId = 'Assigned machine is required';
    const len = Number(form.totalLength);
    if (!form.totalLength || isNaN(len) || len <= 0) errs.totalLength = 'Total length must be > 0';

    if (freq.type === 'specific' && freq.days.length === 0) {
      errs.freq = 'Select at least one day for specific frequency';
    }

    // GPS points
    const validPts = points.filter((p) => p.lat !== '' && p.lng !== '');
    if (validPts.length < 2) {
      setPtsError('At least 2 GPS points with coordinates are required');
      return errs;
    }
    for (const p of validPts) {
      const lat = Number(p.lat), lng = Number(p.lng);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        setPtsError(`Point ${p.sequence}: latitude must be between -90 and 90`);
        return errs;
      }
      if (isNaN(lng) || lng < -180 || lng > 180) {
        setPtsError(`Point ${p.sequence}: longitude must be between -180 and 180`);
        return errs;
      }
    }
    setPtsError('');
    return errs;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length || ptsError) {
      setFormErrors(errs);
      return;
    }

    const validPts = points.filter((p) => p.lat !== '' && p.lng !== '');

    const payload = {
      projectId:         form.projectId,
      roadId:            form.roadId.trim(),
      areaName:          form.areaName.trim(),
      colonyName:        form.colonyName.trim(),
      roadName:          form.roadName.trim(),
      totalLength:       Number(form.totalLength),
      assignedMachineId: form.assignedMachineId,
      status:            form.status,
      sweepingFrequency: {
        type:      freq.type,
        startDate: freq.startDate || null,
        days:      freq.days,
      },
      gpsPoints: pointsToApiFormat(validPts),
    };

    setSaving(true);
    try {
      if (isEdit) {
        // roadId immutable in edit mode; projectId is now editable
        const { roadId, ...updatePayload } = payload;
        await updateRoad(id, updatePayload);
        showToast('Road updated successfully');
        setTimeout(() => navigate(`/roads/${id}`), 1200);
      } else {
        const res = await createRoad(payload);
        showToast('Road created successfully');
        setTimeout(() => navigate(`/roads/${res.data.roadId}`), 1200);
      }
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Map markers from points ────────────────────────────────────────────────
  const mapMarkers = points
    .filter((p) => p.lat !== '' && p.lng !== '')
    .map((p) => ({
      seq:  p.sequence,
      type: p.type,
      lat:  Number(p.lat),
      lng:  Number(p.lng),
    }))
    .filter((p) => !isNaN(p.lat) && !isNaN(p.lng));

  const polylinePositions = mapMarkers.map((p) => [p.lat, p.lng]);

  // ── Loading states ─────────────────────────────────────────────────────────
  if (loadingRoad) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        <svg className="mr-2 h-5 w-5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading road…
      </div>
    );
  }

  const inputCls = (err) =>
    `w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 transition-colors ${
      err ? 'border-red-400 focus:border-red-400' : 'border-gray-300 focus:border-violet-500'
    }`;
  const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';
  const errCls   = 'mt-1 text-xs text-red-500';

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/roads')}
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Edit Road' : 'Add Road'}</h1>
          <p className="text-xs text-gray-500">
            {isEdit ? `Editing: ${form.roadId}` : 'Create a new road with GPS route'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-5">

        {/* ── Road Details Card ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div
            className="rounded-t-xl px-5 py-3"
            style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
          >
            <h2 className="text-sm font-bold text-white">Road Details</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">

            {/* Project */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Project <span className="text-red-500">*</span></label>
              <select
                className={inputCls(formErrors.projectId)}
                value={form.projectId}
                onChange={(e) => setField('projectId', e.target.value)}
                disabled={loadingProjects}
              >
                <option value="">
                  {loadingProjects ? 'Loading projects…' : '— Select Project —'}
                </option>
                {projects.map((p) => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.projectName} ({p.projectId})
                  </option>
                ))}
              </select>
              {formErrors.projectId && <p className={errCls}>{formErrors.projectId}</p>}
            </div>

            {/* Area Name */}
            <div>
              <label className={labelCls}>Area Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={inputCls(formErrors.areaName)}
                placeholder="e.g. Sector 10"
                value={form.areaName}
                onChange={(e) => setField('areaName', e.target.value)}
              />
              {formErrors.areaName && <p className={errCls}>{formErrors.areaName}</p>}
            </div>

            {/* Colony Name */}
            <div>
              <label className={labelCls}>Colony Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={inputCls(formErrors.colonyName)}
                placeholder="e.g. ABC Colony"
                value={form.colonyName}
                onChange={(e) => setField('colonyName', e.target.value)}
              />
              {formErrors.colonyName && <p className={errCls}>{formErrors.colonyName}</p>}
            </div>

            {/* Road Name */}
            <div>
              <label className={labelCls}>Road Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                className={inputCls(formErrors.roadName)}
                placeholder="e.g. Main Road"
                value={form.roadName}
                onChange={(e) => setField('roadName', e.target.value)}
              />
              {formErrors.roadName && <p className={errCls}>{formErrors.roadName}</p>}
            </div>

            {/* Road ID */}
            <div>
              <label className={labelCls}>
                Road ID <span className="text-red-500">*</span>
                {!isEdit && roadIdAutoGenerated && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[0.65rem] font-semibold text-violet-700">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Auto-generated
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  className={`${inputCls(formErrors.roadId)} ${isEdit ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} pr-8`}
                  placeholder={form.projectId ? 'Generating…' : 'Select a project first'}
                  value={form.roadId}
                  onChange={(e) => setField('roadId', e.target.value)}
                  disabled={isEdit}
                  readOnly={isEdit}
                />
                {loadingRoadId && (
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
                    <svg className="h-3.5 w-3.5 animate-spin text-violet-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </span>
                )}
              </div>
              {formErrors.roadId && <p className={errCls}>{formErrors.roadId}</p>}
              {isEdit
                ? <p className="mt-1 text-[0.7rem] text-gray-400">Road ID cannot be changed.</p>
                : roadIdAutoGenerated
                  ? <p className="mt-1 text-[0.7rem] text-gray-400">Auto-generated — you can edit this.</p>
                  : !form.projectId
                    ? <p className="mt-1 text-[0.7rem] text-gray-400">Select a project to auto-generate.</p>
                    : null
              }
            </div>

            {/* Total Length */}
            <div>
              <label className={labelCls}>
                Total Length <span className="text-red-500">*</span>
                {lengthAutoCalculated && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Auto-calculated
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  className={`${inputCls(formErrors.totalLength)} pr-10`}
                  placeholder={points.filter((p) => p.lat !== '' && p.lng !== '').length >= 2 ? 'Calculating…' : 'Add ≥ 2 GPS points'}
                  value={form.totalLength}
                  onChange={(e) => setField('totalLength', e.target.value)}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">KM</span>
              </div>
              {formErrors.totalLength && <p className={errCls}>{formErrors.totalLength}</p>}
              {lengthAutoCalculated
                ? <p className="mt-1 text-[0.7rem] text-gray-400">Calculated from GPS points — you can override.</p>
                : <p className="mt-1 text-[0.7rem] text-gray-400">Will auto-fill when ≥ 2 GPS points are added.</p>
              }
            </div>

            {/* Status */}
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls(false)}
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Assigned Machine */}
            <div>
              <label className={labelCls}>
                Assigned Machine <span className="text-red-500">*</span>
              </label>
              <select
                className={inputCls(formErrors.assignedMachineId)}
                value={form.assignedMachineId}
                onChange={(e) => setField('assignedMachineId', e.target.value)}
                disabled={!form.projectId || loadingMachines}
              >
                <option value="">
                  {!form.projectId
                    ? 'Select a project first'
                    : loadingMachines
                      ? 'Loading machines…'
                      : '— Select Machine —'}
                </option>
                {machines.map((m) => (
                  <option key={m.machineId} value={m.machineId}>
                    {m.machineName} ({m.machineId})
                  </option>
                ))}
              </select>
              {formErrors.assignedMachineId && <p className={errCls}>{formErrors.assignedMachineId}</p>}
              {form.assignedMachineId && (
                <p className="mt-1 text-[0.7rem] text-gray-400">
                  Daily plan will always assign this road to <strong>{form.assignedMachineId}</strong>.
                </p>
              )}
            </div>

            {/* Sweeping Frequency */}
            <div className="sm:col-span-2">
              <label className={labelCls}>Sweeping Frequency <span className="text-red-500">*</span></label>
              <FrequencyForm freq={freq} onChange={setFreq} />
              {formErrors.freq && <p className={errCls}>{formErrors.freq}</p>}
            </div>

          </div>
        </div>

        {/* ── GPS Route Points Card ── */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div
            className="flex items-center justify-between rounded-t-xl px-5 py-3"
            style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
          >
            <h2 className="text-sm font-bold text-white">
              GPS Route Points
              {points.length > 0 && (
                <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">{points.length}</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRouteLine((v) => !v)}
                className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold transition-colors ${
                  showRouteLine
                    ? 'bg-violet-300 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {showRouteLine ? '~ Preview ON' : '~ Preview OFF'}
              </button>
              <button
                type="button"
                onClick={() => setMapClickEnabled((v) => !v)}
                className={`rounded-full px-2.5 py-1 text-[0.65rem] font-semibold transition-colors ${
                  mapClickEnabled
                    ? 'bg-emerald-400 text-white'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                {mapClickEnabled ? '● Map Click ON' : '○ Map Click OFF'}
              </button>
            </div>
          </div>

          {/* Map */}
          <div className="relative" style={{ height: 'clamp(280px, 50vw, 420px)' }}>
            <MapContainer
              center={
                mapMarkers.length > 0
                  ? [mapMarkers[0].lat, mapMarkers[0].lng]
                  : DEFAULT_CENTER
              }
              zoom={14}
              className="h-full w-full"
              style={{ zIndex: 0 }}
              tap={true}
              tapTolerance={15}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapClickHandler
                onMapClick={handleMapClick}
                enabled={mapClickEnabled}
                previewEnabled={showRouteLine}
                onMouseMove={(lat, lng) => setCursorPos({ lat, lng })}
                onMouseLeave={() => setCursorPos(null)}
              />
              {isEdit && points.length >= 2 && <FitBoundsOnLoad points={points} />}

              {/* Route polyline — always visible */}
              {polylinePositions.length >= 2 && (
                <Polyline
                  positions={polylinePositions}
                  pathOptions={{ color: PURPLE, weight: 3, opacity: 0.85 }}
                />
              )}

              {/* Rubber-band preview line: last point → cursor (toggled by Line button) */}
              {showRouteLine && mapClickEnabled && cursorPos && mapMarkers.length >= 1 && (
                <Polyline
                  positions={[
                    [mapMarkers[mapMarkers.length - 1].lat, mapMarkers[mapMarkers.length - 1].lng],
                    [cursorPos.lat, cursorPos.lng],
                  ]}
                  pathOptions={{ color: PURPLE, weight: 2, opacity: 0.5, dashArray: '6 6' }}
                />
              )}

              {/* Markers — draggable to reposition points (mouse + touch) */}
              {mapMarkers.map((p) => (
                <Marker
                  key={p.seq}
                  position={[p.lat, p.lng]}
                  icon={makeIcon(p.seq, p.type)}
                  draggable
                  autoPan
                  eventHandlers={{
                    dragstart(e) {
                      // Prevent map scroll/zoom interfering with drag on touch
                      e.target._map.dragging.disable();
                    },
                    dragend(e) {
                      e.target._map.dragging.enable();
                      const { lat, lng } = e.target.getLatLng();
                      setPoints((prev) =>
                        prev.map((pt) =>
                          pt.sequence === p.seq
                            ? { ...pt, lat: lat.toFixed(6), lng: lng.toFixed(6) }
                            : pt,
                        ),
                      );
                    },
                  }}
                />
              ))}
            </MapContainer>

            {/* Map hint overlay */}
            {points.length === 0 && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 z-[500] -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-xs text-white whitespace-nowrap">
                Tap / Click on map to add GPS points
              </div>
            )}
          </div>

          {/* GPS Point Table */}
          <div className="p-4">
            {ptsError && (
              <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">
                {ptsError}
              </div>
            )}

            {points.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-300 text-xs">
                  <thead>
                    <tr style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}>
                      <th className="border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white w-14">Seq</th>
                      <th className="border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white w-24">Type</th>
                      <th className="border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white">Latitude</th>
                      <th className="border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white">Longitude</th>
                      <th className="border border-[#6b5489] px-2 py-2 text-center text-xs font-semibold text-white w-12">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((point, index) => (
                      <GpsPointRow
                        key={index}
                        point={point}
                        index={index}
                        total={points.length}
                        onChange={handlePointChange}
                        onDelete={handleDeletePoint}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center text-sm text-gray-400">
                No GPS points yet. Click on the map above or use the button below.
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddBlankPoint}
                className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add GPS Point
              </button>
              {points.length > 0 && (
                <span className="text-xs text-gray-400">
                  {points.length} point{points.length !== 1 ? 's' : ''} — GeoJSON [lng, lat] order
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex items-center justify-end gap-3 pb-6">
          <button
            type="button"
            onClick={() => navigate('/roads')}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60 transition-opacity hover:opacity-90"
            style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {saving ? 'Saving…' : isEdit ? 'Update Road' : 'Save Road'}
          </button>
        </div>

      </form>
    </div>
  );
}
