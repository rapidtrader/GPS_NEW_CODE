import { useCallback, useEffect, useState } from 'react';
import { fetchSavedVehicles } from '../api';
import { parseLocation } from '../components/VehicleCard';

export default function MapView() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSavedVehicles();
      setVehicles(result.data || []);
    } catch {
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Vehicle locations — map integration coming soon
        </p>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
        >
          {loading ? 'Loading...' : 'Reload'}
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Loading locations...
        </div>
      ) : vehicles.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          No location data. Refresh Live Vehicles to save data first.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-black">Vehicle</th>
                <th className="px-4 py-3 font-semibold text-black">State</th>
                <th className="px-4 py-3 font-semibold text-black">Latitude</th>
                <th className="px-4 py-3 font-semibold text-black">Longitude</th>
                <th className="px-4 py-3 font-semibold text-black">Address</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const meta = v.terminalPacketMeta || {};
                const { lat, lng } = parseLocation(meta.pLoc);
                return (
                  <tr key={v.ouid} className="border-b border-gray-100">
                    <td className="px-4 py-3 font-medium text-black">{v.vehicleNo}</td>
                    <td className="px-4 py-3 text-gray-600">{v.state}</td>
                    <td className="px-4 py-3 text-gray-600">{lat ? lat.toFixed(5) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{lng ? lng.toFixed(5) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{v.address || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
