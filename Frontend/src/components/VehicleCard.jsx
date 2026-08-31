export function getStateClass(state) {
  const normalized = (state || '').toLowerCase();
  if (normalized.includes('running') || normalized.includes('moving')) {
    return 'bg-green-100 text-green-800';
  }
  if (normalized.includes('idle')) {
    return 'bg-yellow-100 text-yellow-800';
  }
  if (normalized.includes('off')) {
    return 'bg-gray-200 text-gray-800';
  }
  return 'bg-blue-100 text-blue-800';
}

export function parseLocation(pLoc) {
  if (Array.isArray(pLoc)) return { lng: pLoc[0], lat: pLoc[1] };
  if (typeof pLoc === 'string') {
    const [lng, lat] = pLoc.split(' ').map(Number);
    return { lng, lat };
  }
  return { lng: null, lat: null };
}

export default function VehicleCard({ vehicle }) {
  const meta = vehicle.terminalPacketMeta || {};
  const { lat, lng } = parseLocation(meta.pLoc);

  const fields = [
    { label: 'Address', value: vehicle.address || '—', full: true },
    { label: 'Last Update', value: vehicle.lu },
    { label: 'Since', value: vehicle.since },
    { label: 'Odometer', value: `${vehicle.odometer} km` },
    { label: 'Device', value: vehicle.deviceType },
    { label: 'Status', value: vehicle.vehicleStatus },
    { label: 'Battery', value: meta.battery != null ? `${meta.battery}%` : '—' },
    { label: 'GSM Signal', value: meta.gsmSignals != null ? `${meta.gsmSignals}/4` : '—' },
    { label: 'Satellites', value: meta.satellites ?? '—' },
    {
      label: 'Location',
      value: lat && lng ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : '—',
    },
  ];

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-black">{vehicle.vehicleNo}</h3>
          <p className="mt-0.5 text-sm capitalize text-gray-500">{vehicle.vehicleType}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getStateClass(vehicle.state)}`}
        >
          {vehicle.state}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <div key={field.label} className={field.full ? 'sm:col-span-2' : ''}>
            <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-gray-500">
              {field.label}
            </span>
            <p className="mt-0.5 break-words text-sm text-black">{field.value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}
