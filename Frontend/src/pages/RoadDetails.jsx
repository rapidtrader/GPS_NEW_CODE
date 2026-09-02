import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoad } from '../api';

const PURPLE = '#4a3569';

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
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
      background:${color};color:#fff;
      width:24px;height:24px;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);border:2px solid #fff;
      box-shadow:0 2px 6px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      font-size:9px;font-weight:700;">
      <span style="transform:rotate(45deg)">${seq}</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  });
}

// ── Map fit-bounds on mount ───────────────────────────────────────────────────
import { useMap } from 'react-leaflet';
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length < 2) return;
    try {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function StatusBadge({ status }) {
  const active = status === 'active';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function InfoCard({ label, value, mono }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-bold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</p>
    </div>
  );
}

function freqLabel(sf) {
  if (!sf) return '—';
  if (sf.type === 'daily')    return 'Daily';
  if (sf.type === 'alternate') {
    const d = sf.startDate ? ` (from ${sf.startDate.slice(0, 10)})` : '';
    return `Alternate Day${d}`;
  }
  if (sf.type === 'specific') {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    return `Specific: ${(sf.days || []).map(cap).join(', ')}`;
  }
  return sf.type;
}

export default function RoadDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [road, setRoad]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetchRoad(id);
      setRoad(res.data);
    } catch (err) {
      setError(err.message || 'Failed to load road');
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
        Loading road…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-700">
          <strong>Error:</strong> {error}
        </div>
        <button onClick={() => navigate('/roads')} className="text-sm font-medium text-violet-600 hover:underline">
          ← Back to Roads
        </button>
      </div>
    );
  }

  if (!road) return null;

  // Build map data from gpsPoints ([lng, lat] → Leaflet [lat, lng])
  const sortedPoints = [...(road.gpsPoints || [])].sort((a, b) => a.sequence - b.sequence);
  const positions    = sortedPoints.map((p) => [p.coordinates[1], p.coordinates[0]]);
  const mapCenter    = positions.length > 0 ? positions[0] : [28.6139, 77.2090];

  const createdDate = road.createdAt
    ? new Date(road.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const updatedDate = road.updatedAt
    ? new Date(road.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-5 p-4 sm:p-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <button onClick={() => navigate('/roads')} className="hover:text-violet-600 font-medium transition-colors">Roads</button>
        <span>›</span>
        <span className="font-medium text-gray-600">{road.roadId}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{road.roadName}</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{road.roadId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={road.status} />
          <button
            onClick={() => navigate(`/roads/${road.roadId}/edit`)}
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

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoCard label="Road ID"   value={road.roadId}  mono />
        <InfoCard label="Project"   value={road.projectId} />
        <InfoCard label="Area"      value={road.areaName} />
        <InfoCard label="Colony"    value={road.colonyName} />
        <InfoCard label="Length"    value={`${road.totalLength} KM`} />
        <InfoCard label="Frequency" value={freqLabel(road.sweepingFrequency)} />
        <InfoCard label="GPS Points" value={sortedPoints.length} />
        <InfoCard label="Created"   value={createdDate} />
      </div>

      {/* Route Map */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div
          className="px-5 py-3"
          style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
        >
          <h2 className="text-sm font-bold text-white">
            GPS Route Map
            {sortedPoints.length > 0 && (
              <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">{sortedPoints.length} points</span>
            )}
          </h2>
        </div>

        {positions.length < 2 ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">
            Not enough GPS points to render route.
          </div>
        ) : (
          <div style={{ height: '380px' }}>
            <MapContainer center={mapCenter} zoom={14} className="h-full w-full" style={{ zIndex: 0 }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds positions={positions} />
              <Polyline
                positions={positions}
                pathOptions={{ color: PURPLE, weight: 4, opacity: 0.85 }}
              />
              {sortedPoints.map((p) => (
                <Marker
                  key={p.sequence}
                  position={[p.coordinates[1], p.coordinates[0]]}
                  icon={makeIcon(p.sequence, p.type)}
                />
              ))}
            </MapContainer>
          </div>
        )}
      </div>

      {/* GPS Points Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div
          className="px-5 py-3"
          style={{ background: `linear-gradient(90deg, ${PURPLE}, #6b4d8a)` }}
        >
          <h2 className="text-sm font-bold text-white">GPS Route Points Sequence</h2>
        </div>

        {sortedPoints.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No GPS points recorded.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Seq</th>
                  <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Type</th>
                  <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Latitude</th>
                  <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-semibold text-gray-600">Longitude</th>
                  <th className="border-b border-gray-200 px-4 py-2.5 text-center text-xs font-semibold text-gray-600">GeoJSON Coords</th>
                </tr>
              </thead>
              <tbody>
                {sortedPoints.map((p, i) => {
                  const lat = p.coordinates[1];
                  const lng = p.coordinates[0];
                  const typeColor =
                    p.type === 'start' ? 'text-emerald-700 bg-emerald-50'  :
                    p.type === 'end'   ? 'text-red-700 bg-red-50'          :
                                         'text-blue-700 bg-blue-50';
                  return (
                    <tr key={i} className="even:bg-gray-50 hover:bg-violet-50 transition-colors">
                      <td className="border-b border-gray-100 px-4 py-2 text-center font-semibold text-gray-700">{p.sequence}</td>
                      <td className="border-b border-gray-100 px-4 py-2 text-center">
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold capitalize ${typeColor}`}>
                          {p.type}
                        </span>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-2 text-center font-mono">{lat.toFixed(6)}</td>
                      <td className="border-b border-gray-100 px-4 py-2 text-center font-mono">{lng.toFixed(6)}</td>
                      <td className="border-b border-gray-100 px-4 py-2 text-center font-mono text-gray-400">
                        [{lng.toFixed(6)}, {lat.toFixed(6)}]
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Future placeholders */}
      <div>
        <h2 className="mb-3 text-sm font-bold text-gray-700">Sweeping Stats (Coming Soon)</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {['Today Planned KM', 'Today Actual KM', 'Completion %', 'Assigned Machine'].map((label) => (
            <div key={label} className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-medium text-gray-400">{label}</p>
              <p className="mt-1 text-lg font-bold text-gray-300">—</p>
              <p className="mt-0.5 text-[0.65rem] text-gray-300">Coming soon</p>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
        <span className="font-semibold text-gray-500">Legend:</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" /> Start</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-blue-500 inline-block" /> Turn</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500 inline-block" /> End</span>
        <span className="ml-auto text-gray-400">GeoJSON: [longitude, latitude]</span>
      </div>

      {/* Back */}
      <button onClick={() => navigate('/roads')} className="text-sm font-medium text-violet-600 hover:underline">
        ← Back to Roads
      </button>
    </div>
  );
}
