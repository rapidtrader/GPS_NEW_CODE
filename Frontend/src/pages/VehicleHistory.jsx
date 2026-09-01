import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { fetchSavedVehicles } from '../api';
import { VehicleIcon } from '../components/VehicleIcons';
import 'leaflet/dist/leaflet.css';

const PURPLE = '#7c3aed';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { from: toDateInput(start), to: toDateInput(end) };
}

function rangeToTimestamp(from, to) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59.999`);
  return { startTime: start.getTime(), endTime: end.getTime() };
}

function CalendarIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0121 8.25v11.25A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V8.25A1.5 1.5 0 014.5 6.75z" />
    </svg>
  );
}

// Throttled geocoding queue - backend proxy se fetch karo
const geocodeCache = new Map();
const geocodeQueue = [];
let geocodeTimer = null;

function processGeocodeQueue() {
  if (geocodeQueue.length === 0) {
    geocodeTimer = null;
    return;
  }
  const { lat, lng, resolve } = geocodeQueue.shift();
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;

  if (geocodeCache.has(key)) {
    resolve(geocodeCache.get(key));
    geocodeTimer = setTimeout(processGeocodeQueue, 50);
    return;
  }

  fetch(`/api/geocode?lat=${lat}&lng=${lng}`)
    .then(r => r.json())
    .then(data => {
      const address = data.address || key;
      geocodeCache.set(key, address);
      resolve(address);
    })
    .catch(() => {
      geocodeCache.set(key, key);
      resolve(key);
    })
    .finally(() => {
      geocodeTimer = setTimeout(processGeocodeQueue, 300); // 300ms between requests
    });
}

function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
  if (geocodeCache.has(key)) {
    return Promise.resolve(geocodeCache.get(key));
  }
  return new Promise(resolve => {
    geocodeQueue.push({ lat, lng, resolve });
    if (!geocodeTimer) {
      geocodeTimer = setTimeout(processGeocodeQueue, 0);
    }
  });
}

function AddressCell({ lat, lng }) {
  const [address, setAddress] = useState(null);

  useEffect(() => {
    if (!lat || !lng) {
      setAddress('N/A');
      return;
    }
    let cancelled = false;
    reverseGeocode(lat, lng).then(addr => {
      if (!cancelled) setAddress(addr);
    });
    return () => { cancelled = true; };
  }, [lat, lng]);

  return (
    <td className="px-4 py-3 text-gray-600 text-sm max-w-xs truncate" title={address || ''}>
      {address ?? <span className="text-gray-400 text-xs">Loading...</span>}
    </td>
  );
}

function DateField({ label, value, onChange }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-1.5 block text-[0.7rem] font-medium text-gray-500">{label}</span>
      <div className="relative">
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-9 text-sm font-medium text-gray-900 outline-none focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
          <CalendarIcon />
        </span>
      </div>
    </label>
  );
}

function AnimatedRouteMap({ history, playing, onPlayStateChange }) {
  const defaultCenter = [30.314, 76.394];
  const [currentIndex, setCurrentIndex] = useState(0);
  const animationRef = useRef(null);

  const coordinates = useMemo(
    () => history.filter((h) => h.latitude && h.longitude).map((h) => [h.latitude, h.longitude]),
    [history]
  );

  const currentPosition = coordinates[currentIndex] || defaultCenter;

  useEffect(() => {
    if (!playing || coordinates.length === 0) {
      if (animationRef.current) clearTimeout(animationRef.current);
      return;
    }

    if (currentIndex >= coordinates.length - 1) {
      onPlayStateChange(false);
      return;
    }

    animationRef.current = setTimeout(() => {
      setCurrentIndex((prev) => Math.min(prev + 1, coordinates.length - 1));
    }, 500); // 500ms between each point

    return () => {
      if (animationRef.current) clearTimeout(animationRef.current);
    };
  }, [playing, currentIndex, coordinates.length, onPlayStateChange]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => Math.min(prev + 1, coordinates.length - 1));
  };

  const handleReset = () => {
    setCurrentIndex(0);
    onPlayStateChange(false);
  };

  const handleEnd = () => {
    setCurrentIndex(coordinates.length - 1);
    onPlayStateChange(false);
  };

  return (
    <div className="flex flex-col h-full w-full min-h-96">
      {/* Playback Controls */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2">
        <button
          onClick={handleReset}
          title="Start"
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8-2v20l11-10z" transform="translate(-8, 0)" />
          </svg>
        </button>

        <button
          onClick={handlePrevious}
          disabled={currentIndex === 0}
          title="Previous"
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={() => onPlayStateChange(!playing)}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={handleNext}
          disabled={currentIndex === coordinates.length - 1}
          title="Next"
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 18h2V6h-2zm-11-7l8.5-6v12z" />
          </svg>
        </button>

        <button
          onClick={handleEnd}
          title="End"
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-600"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16 4v16h-4V4h4zM6 8.5L14.5 14 6 19.5z" />
          </svg>
        </button>

        {/* Progress bar */}
        <div className="flex-1 mx-2">
          <input
            type="range"
            min="0"
            max={coordinates.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setCurrentIndex(parseInt(e.target.value));
              onPlayStateChange(false);
            }}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
        </div>

        {/* Time info */}
        <div className="text-xs text-gray-600 min-w-max">
          {currentIndex + 1} / {coordinates.length}
        </div>
      </div>

      {/* Map */}
      <MapContainer center={defaultCenter} zoom={13} className="h-full w-full flex-1" zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Completed route */}
        {currentIndex > 0 && <Polyline positions={coordinates.slice(0, currentIndex + 1)} color={PURPLE} weight={3} />}
        {/* Remaining route (faded) */}
        {currentIndex < coordinates.length - 1 && (
          <Polyline
            positions={coordinates.slice(currentIndex)}
            color={PURPLE}
            weight={2}
            dashArray="5, 5"
            opacity={0.3}
          />
        )}
        {/* Moving vehicle marker */}
        {coordinates.length > 0 && (
          <Marker position={currentPosition}>
            <Popup>
              <div className="text-sm text-black">
                <p className="font-bold">Position: {currentIndex + 1}/{coordinates.length}</p>
                {history[currentIndex] && (
                  <>
                    <p>Lat/Long: {history[currentIndex].latitude?.toFixed(6)}, {history[currentIndex].longitude?.toFixed(6)}</p>
                    <p>Speed: {history[currentIndex].speed} km/h</p>
                    <p>Time: {new Date(history[currentIndex].added).toLocaleTimeString('en-IN')}</p>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

export default function VehicleHistory() {
  const defaults = useMemo(() => todayRange(), []);
  const [vehicles, setVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [addressCache, setAddressCache] = useState({});

  const ITEMS_PER_PAGE = 40;

  // Cache updater (for AddressCell to update cache)
  const fetchAddress = useCallback((lat, lng, address) => {
    const key = `${lat?.toFixed(6)},${lng?.toFixed(6)}`;
    setAddressCache(prev => ({ ...prev, [key]: address }));
  }, []);

  useEffect(() => {
    const loadVehicles = async () => {
      try {
        const result = await fetchSavedVehicles();
        setVehicles(result.data || []);
        if ((result.data || []).length > 0) {
          setSelectedVehicle(result.data[0].vehicleNo);
        }
      } catch (err) {
        console.error('Error loading vehicles:', err);
      }
    };
    loadVehicles();
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!selectedVehicle) return;

    setLoading(true);
    setError(null);
    setPlaying(false);
    setCurrentPage(1); // Reset to first page
    try {
      const params = new URLSearchParams({
        startDate: fromDate,
        endDate: toDate,
      });

      const response = await fetch(`/api/vehicle-history/${selectedVehicle}?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = await response.json();
      if (!response.ok || data.status === 'ERROR') {
        throw new Error(data.message || 'Failed to fetch history');
      }

      setHistory(data.data || []);
    } catch (err) {
      setError(err.message);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [selectedVehicle, fromDate, toDate]);

  const syncHistory = useCallback(async () => {
    if (!selectedVehicle) return;

    setSyncing(true);
    setError(null);
    try {
      const { startTime, endTime } = rangeToTimestamp(fromDate, toDate);

      const response = await fetch(`/api/vehicle-history/${selectedVehicle}/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ startTime, endTime }),
      });

      const data = await response.json();
      if (!response.ok || data.status === 'ERROR') {
        throw new Error(data.message || 'Failed to sync history');
      }

      await fetchHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }, [selectedVehicle, fromDate, toDate, fetchHistory]);

  useEffect(() => {
    if (selectedVehicle) {
      fetchHistory();
    }
  }, [selectedVehicle]);

  return (
    <div className="-m-4 min-h-full bg-[#f3f4f6] p-3 sm:-m-6 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-3">
        {/* Controls */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-[0.7rem] font-medium text-gray-500">Vehicle</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 px-3 text-sm font-medium text-gray-900 outline-none focus:border-purple-500 focus:bg-white focus:ring-2 focus:ring-purple-100"
              >
                <option value="">Select Vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.ouid} value={v.vehicleNo}>
                    {v.vehicleNo}
                  </option>
                ))}
              </select>
            </div>
            <DateField label="From Date" value={fromDate} onChange={setFromDate} />
            <DateField label="To Date" value={toDate} onChange={setToDate} />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncHistory}
              disabled={syncing || !selectedVehicle}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold uppercase tracking-wide text-white shadow-sm disabled:opacity-60"
              style={{ backgroundColor: PURPLE }}
            >
              <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M2.985 19.644v-4.992h4.992M4.45 16.023A8.25 8.25 0 1119.55 7.977" />
              </svg>
              {syncing ? 'Syncing...' : 'Sync Fresh'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        {/* Map */}
        {history.length > 0 && (
          <div className="rounded-2xl overflow-hidden shadow-sm">
            <AnimatedRouteMap history={history} playing={playing} onPlayStateChange={setPlaying} />
          </div>
        )}

        {/* Table */}
        {loading && history.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">Loading route history...</div>
        ) : history.length === 0 ? (
          <div className="rounded-2xl bg-white py-12 text-center text-sm text-gray-500 shadow-sm">
            No route history found for this date range.
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-purple-900 text-white">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Lat/Long</th>
                      <th className="px-4 py-3 text-right font-semibold">Speed (km/h)</th>
                      <th className="px-4 py-3 text-right font-semibold">Distance</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Fuel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history
                      .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                      .map((h, i) => (
                        <tr key={i} className={`${i % 2 ? 'bg-purple-50' : 'bg-white'} border-b border-gray-200`}>
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {h.added ? new Date(h.added).toLocaleTimeString('en-IN') : '-'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {h.latitude?.toFixed(6)}, {h.longitude?.toFixed(6)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">{h.speed?.toFixed(1) || '0'}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{h.distance?.toFixed(2) || '0'}</td>
                          <td className="px-4 py-3 text-gray-600">{h.status || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{h.fuel?.toFixed(1) || '0'}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination */}
            {history.length > ITEMS_PER_PAGE && (
              <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
                <div className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, history.length)} of {history.length} records
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    ← Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from(
                      { length: Math.ceil(history.length / ITEMS_PER_PAGE) },
                      (_, i) => i + 1
                    )
                      .slice(
                        Math.max(0, currentPage - 3),
                        Math.min(Math.ceil(history.length / ITEMS_PER_PAGE), currentPage + 2)
                      )
                      .map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`rounded-lg px-2.5 py-1.5 text-sm font-medium ${
                            currentPage === page
                              ? 'bg-purple-600 text-white'
                              : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage >= Math.ceil(history.length / ITEMS_PER_PAGE)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
