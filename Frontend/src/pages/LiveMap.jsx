import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSavedVehicles } from '../api';
import {
  STATUS_FILTERS,
  PURPLE,
  parseLocation,
  formatSince,
  matchStatusFilter,
  getVehicleSpeed,
} from '../utils/vehicleUtils';
import { VehicleIcon, createMapMarkerIcon, getIconConfig, VEHICLE_MAP_ICON } from '../components/VehicleIcons';
import 'leaflet/dist/leaflet.css';

const defaultCenter = [30.314, 76.394];

function MapController({ selectedId, markers }) {
  const map = useMap();

  useEffect(() => {
    if (markers.length === 0) return;
    if (selectedId) {
      const sel = markers.find((m) => m.ouid === selectedId);
      if (sel) {
        map.setView([sel.lat, sel.lng], 15, { animate: true });
        return;
      }
    }
    const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [selectedId, markers, map]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => {
      map.invalidateSize();
    };

    invalidate();
    const timers = [0, 100, 350, 600].map((ms) => setTimeout(invalidate, ms));

    window.addEventListener('resize', invalidate);

    const targets = [map.getContainer()?.parentElement, document.querySelector('aside')].filter(Boolean);
    const observer = new ResizeObserver(invalidate);
    targets.forEach((el) => observer.observe(el));

    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', invalidate);
      observer.disconnect();
    };
  }, [map]);

  return null;
}

function SignalBars({ level = 4 }) {
  return (
    <div className="flex items-end gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${i <= level ? 'bg-green-500' : 'bg-gray-300'}`}
          style={{ height: `${i * 3 + 2}px` }}
        />
      ))}
    </div>
  );
}

function VehicleCard({ vehicle, selected, onClick }) {
  const meta = vehicle.terminalPacketMeta || {};
  const gsm = meta.gsmSignals ?? 0;
  const battery = meta.battery ?? 0;
  const speed = getVehicleSpeed(vehicle);
  const distance = vehicle.durationOdometer ?? vehicle.odometer ?? 0;
  const iconCfg = getIconConfig(vehicle.vehicleType);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded border p-3 text-left transition ${
        selected ? 'border-purple-600 bg-purple-50 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VehicleIcon vehicleType={vehicle.vehicleType} showBg className="h-5 w-5" />
          <div>
            <span className="font-bold text-black">{vehicle.vehicleNo}</span>
            <p className="text-[0.6rem] capitalize text-gray-500">{vehicle.vehicleType || iconCfg.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SignalBars level={gsm} />
          <span className="text-[0.6rem] text-gray-500">{battery}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.7rem]">
        <div>
          <span className="font-semibold text-gray-500">LU</span>
          <p className="text-black">{vehicle.lu || '--'}</p>
        </div>
        <div>
          <span className="font-semibold text-gray-500">SPD</span>
          <p className="text-black">{speed} kmph</p>
        </div>
        <div>
          <span className="font-semibold text-gray-500">Since</span>
          <p className="text-black">{formatSince(vehicle.since)}</p>
        </div>
        <div>
          <span className="font-semibold text-gray-500">DISTANCE</span>
          <p className="text-black">{distance} km</p>
        </div>
      </div>

      <div className="mt-2 flex gap-1 border-t border-gray-100 pt-2 text-[0.65rem] text-gray-600">
        <svg className="mt-0.5 h-3 w-3 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
        </svg>
        <span className="line-clamp-2">{vehicle.address || 'No address'}</span>
      </div>
    </button>
  );
}

function FleetMap({ vehicles, selectedId, onSelect }) {
  const markers = useMemo(
    () =>
      vehicles
        .map((v) => {
          const { lat, lng } = parseLocation(v.terminalPacketMeta?.pLoc);
          return lat && lng ? { ...v, lat, lng } : null;
        })
        .filter(Boolean),
    [vehicles]
  );

  return (
    <MapContainer center={defaultCenter} zoom={13} className="h-full w-full min-h-0" zoomControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapResizeHandler />
      <MapController selectedId={selectedId} markers={markers} />
      {markers.map((v) => (
        <Marker
          key={v.ouid}
          position={[v.lat, v.lng]}
          icon={createMapMarkerIcon(v.vehicleNo, selectedId === v.ouid)}
          eventHandlers={{ click: () => onSelect(v.ouid) }}
        >
          <Popup>
            <div className="flex items-center gap-2 text-sm text-black">
              <VehicleIcon vehicleType={v.vehicleType} showBg className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">{v.vehicleNo}</p>
                <p className="capitalize text-gray-600">{v.vehicleType}</p>
                <p>{v.state}</p>
                <p className="text-xs text-gray-500">{v.address}</p>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function VehicleListPanel({ filtered, loading, selectedId, onSelect, className = '', hideHeader = false }) {
  return (
    <div className={`flex flex-col bg-gray-50 ${className}`}>
      {!hideHeader && (
        <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold text-black">
            Saved Vehicles ({filtered.length})
          </p>
          <p className="text-[0.65rem] text-gray-500">Data from MongoDB</p>
        </div>
      )}
      <div className="vehicle-list-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-2">
        {loading && filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500">Loading saved vehicles...</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500">
            No saved data yet. Open Live Vehicles to sync data to database.
          </p>
        ) : (
          <div className="space-y-2 pb-2">
            {filtered.map((v) => (
              <VehicleCard
                key={v.ouid || v.deviceId}
                vehicle={v}
                selected={selectedId === v.ouid}
                onClick={() => onSelect(v.ouid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function LiveMap() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [listOpen, setListOpen] = useState(false);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSavedVehicles();
      setVehicles(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  useEffect(() => {
    if (!listOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [listOpen]);

  const counts = useMemo(() => {
    const c = {};
    STATUS_FILTERS.forEach((f) => {
      c[f.id] = vehicles.filter((v) => matchStatusFilter(v, f.id)).length;
    });
    return c;
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (!matchStatusFilter(v, filter)) return false;
      if (!q) return true;
      return v.vehicleNo?.toLowerCase().includes(q) || v.address?.toLowerCase().includes(q);
    });
  }, [vehicles, search, filter]);

  function handleSelectVehicle(ouid) {
    setSelectedId(ouid);
    setListOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col bg-white">
      <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 bg-white px-3 py-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex w-full items-center lg:w-auto">
          <input
            type="search"
            placeholder="Search Vehicle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-l border border-gray-300 border-r-0 px-3 text-sm text-black placeholder:text-gray-400 focus:outline-none lg:w-52"
          />
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-r text-white"
            style={{ backgroundColor: PURPLE }}
            aria-label="Search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            Database Data
          </span>

          <button
            type="button"
            className="rounded border border-gray-400 px-3 py-1.5 text-xs font-bold tracking-wide text-black hover:bg-gray-50 sm:px-4"
          >
            FILTER
          </button>
        </div>

        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:flex-1 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`flex min-w-[58px] shrink-0 flex-col items-center rounded border px-2 py-0.5 sm:min-w-[60px] ${
                  active ? f.activeClass : `bg-white ${f.idleClass}`
                }`}
              >
                <span className="text-sm font-bold leading-tight">{loading ? '—' : counts[f.id]}</span>
                <span className="text-[0.55rem] font-bold">{f.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="hidden w-[300px] shrink-0 border-r border-gray-200 lg:flex lg:flex-col xl:w-[340px]">
          <VehicleListPanel
            filtered={filtered}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
            className="h-full"
          />
        </div>

        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0">
            <FleetMap vehicles={filtered} selectedId={selectedId} onSelect={handleSelectVehicle} />
          </div>

          <div className="absolute bottom-4 left-3 z-[500] hidden max-w-[calc(100%-6rem)] items-center gap-2 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 shadow-md sm:flex">
            <img src={VEHICLE_MAP_ICON} alt="Vehicle" className="h-4 w-4 object-contain" />
            <span className="truncate text-xs font-medium text-black">Vehicle Marker</span>
          </div>

          <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
            <button
              type="button"
              onClick={loadVehicles}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg"
              style={{ backgroundColor: PURPLE }}
              title="Reload from database"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="absolute bottom-4 left-1/2 z-[500] inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg lg:hidden"
            style={{ backgroundColor: PURPLE }}
          >
            Vehicles ({filtered.length})
          </button>
        </div>
      </div>

      {listOpen && (
        <>
          <button
            type="button"
            aria-label="Close vehicle list"
            className="fixed inset-0 z-[1500] bg-black/40 lg:hidden"
            onClick={() => setListOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-[1510] flex max-h-[75vh] flex-col rounded-t-2xl border border-gray-200 bg-white shadow-2xl lg:hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-black">Saved Vehicles</p>
                <p className="text-xs text-gray-500">{filtered.length} vehicle(s)</p>
              </div>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <VehicleListPanel
              filtered={filtered}
              loading={loading}
              selectedId={selectedId}
              onSelect={handleSelectVehicle}
              hideHeader
              className="min-h-0 flex-1"
            />
          </div>
        </>
      )}
    </div>
  );
}
