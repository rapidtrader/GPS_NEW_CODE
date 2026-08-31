export const PURPLE = '#4a3068';

export const STATUS_FILTERS = [
  { id: 'all', label: 'ALL', activeClass: 'bg-sky-400 text-white border-sky-400', idleClass: 'border-sky-400 text-sky-500' },
  { id: 'running', label: 'RUNNING', activeClass: 'bg-green-600 text-white border-green-600', idleClass: 'border-green-500 text-green-600' },
  { id: 'stopped', label: 'STOPPED', activeClass: 'bg-rose-500 text-white border-rose-500', idleClass: 'border-rose-400 text-rose-500' },
  { id: 'overspeed', label: 'OVERSPEED', activeClass: 'bg-orange-500 text-white border-orange-500', idleClass: 'border-orange-400 text-orange-500' },
  { id: 'idle', label: 'IDLE', activeClass: 'bg-yellow-500 text-white border-yellow-500', idleClass: 'border-yellow-500 text-yellow-600' },
  { id: 'unreachable', label: 'UNREACHABLE', activeClass: 'bg-sky-600 text-white border-sky-600', idleClass: 'border-sky-500 text-sky-600' },
  { id: 'new', label: 'NEW', activeClass: 'bg-gray-500 text-white border-gray-500', idleClass: 'border-gray-400 text-gray-500' },
  { id: 'inactive', label: 'INACTIVE', activeClass: 'bg-black text-white border-black', idleClass: 'border-black text-black border-2' },
];

export function parseLocation(pLoc) {
  if (Array.isArray(pLoc)) return { lat: pLoc[1], lng: pLoc[0] };
  if (typeof pLoc === 'string') {
    const [lng, lat] = pLoc.split(' ').map(Number);
    return { lat: lat || null, lng: lng || null };
  }
  return { lat: null, lng: null };
}

export function formatSince(sinceStr) {
  if (!sinceStr) return '--';
  const parts = sinceStr.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!parts) return sinceStr;
  const [, d, m, y, h, min, s] = parts;
  const since = new Date(`${y}-${m}-${d}T${h}:${min}:${s}`);
  const diffMs = Date.now() - since.getTime();
  if (diffMs < 0) return '--';
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${String(days).padStart(2, '0')}D ${String(hours % 24).padStart(2, '0')}H ${String(totalMins % 60).padStart(2, '0')}M`;
  }
  return `${String(hours).padStart(2, '0')}H ${String(totalMins % 60).padStart(2, '0')}M`;
}

export function matchStatusFilter(vehicle, filter) {
  const state = (vehicle.state || '').toLowerCase();
  const status = (vehicle.vehicleStatus || '').toLowerCase();
  switch (filter) {
    case 'all': return true;
    case 'running': return /running|moving/.test(state);
    case 'stopped': return /off|stop/.test(state);
    case 'overspeed': return false;
    case 'idle': return /idle/.test(state);
    case 'unreachable': return vehicle.terminalPacketMeta?.gsmSignals === 0;
    case 'new': return false;
    case 'inactive': return status !== 'active';
    default: return true;
  }
}

export function getVehicleSpeed(vehicle) {
  const state = (vehicle.state || '').toLowerCase();
  if (/running|moving/.test(state)) return vehicle.mileage || 0;
  return 0;
}
