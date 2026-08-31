import L from 'leaflet';

export const PURPLE = '#4a3068';

export const TBTRACK_ICON_BASE =
  'https://tbtrack.in/gps/resources/img/default/vehicle-status-icons';

export const VEHICLE_MAP_ICON = `${TBTRACK_ICON_BASE}/truck_stop.png`;

/** TBTrack state-based icon names */
export function getTbTrackIconUrl(state = '') {
  const s = (state || '').toLowerCase();
  if (/running|moving/.test(s)) return `${TBTRACK_ICON_BASE}/truck_run.png`;
  if (/idle/.test(s)) return `${TBTRACK_ICON_BASE}/truck_idle.png`;
  if (/off|stop/.test(s)) return `${TBTRACK_ICON_BASE}/truck_stop.png`;
  return VEHICLE_MAP_ICON;
}

export function VehicleIcon({ vehicleType, className = 'h-8 w-8', showBg = false }) {
  const iconUrl = VEHICLE_MAP_ICON;

  if (showBg) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-lg bg-white p-0.5 shadow-sm ${className}`}
        title={vehicleType || 'Vehicle'}
      >
        <img src={iconUrl} alt={vehicleType || 'vehicle'} className="h-full w-full object-contain" />
      </span>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={vehicleType || 'vehicle'}
      className={className}
      title={vehicleType || 'Vehicle'}
    />
  );
}

export function createMapMarkerIcon(vehicleNo, selected = false) {
  const iconUrl = VEHICLE_MAP_ICON;
  const iconSize = 26;
  const labelBg = selected ? '#f59e0b' : PURPLE;

  return L.divIcon({
    className: 'vehicle-map-marker',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);width:max-content">
        <img
          src="${iconUrl}"
          alt="vehicle"
          style="width:${iconSize}px;height:${iconSize}px;min-width:${iconSize}px;min-height:${iconSize}px;max-width:${iconSize}px;max-height:${iconSize}px;object-fit:contain;display:block"
        />
        <div style="background:${labelBg};color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:3px;white-space:nowrap;margin-top:1px;line-height:1.3">${vehicleNo}</div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export function getIconConfig(vehicleType) {
  return { label: vehicleType || 'Vehicle', iconUrl: VEHICLE_MAP_ICON };
}

export function getVehicleCategory(vehicleType = '') {
  return vehicleType || 'vehicle';
}
