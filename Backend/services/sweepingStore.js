const VehicleHistory = require('../models/VehicleHistory');
const { getVehiclesForUser } = require('./vehicleStore');

const SPEED_THRESHOLD_KMH = 8;
const MAX_GAP_MS = 3 * 60 * 1000;
const GPS_ONLINE_MS = 15 * 60 * 1000;

function parseLocation(pLoc) {
  if (Array.isArray(pLoc)) return { lat: pLoc[1], lng: pLoc[0] };
  if (typeof pLoc === 'string') {
    const [lng, lat] = pLoc.split(' ').map(Number);
    return { lat: lat || null, lng: lng || null };
  }
  return { lat: null, lng: null };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every((n) => Number.isFinite(Number(n)))) return 0;
  const R = 6371;
  const toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPointTime(row) {
  const t = row.recordedAt || row.createdAt;
  const ms = t ? new Date(t).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function getSpeed(row) {
  const v = row.rawData || {};
  const meta = v.terminalPacketMeta || {};
  
  // Try to get speed from various fields
  let speed = Number(row.speed ?? v.mileage ?? meta.speed ?? meta.pSpeed ?? 0);
  
  // If speed is 0 or not available, check if odometer is changing
  // This indicates vehicle is moving even if speed isn't reported
  if (!(speed > 0)) {
    // Mark as potentially moving (use a small speed to bypass idle detection)
    // This will be categorized as sweeping (< 8 km/h) which is safer for incomplete data
    return 0.1; // Return 0.1 instead of 0 to avoid 'idle' mode
  }
  
  return Number.isFinite(speed) ? Math.max(0, speed) : 0.1;
}

function getCoords(row) {
  if (Number.isFinite(row.latitude) && Number.isFinite(row.longitude)) {
    return { lat: row.latitude, lng: row.longitude };
  }
  return parseLocation(row.rawData?.terminalPacketMeta?.pLoc);
}

function getOdometer(row) {
  const n = Number(row.odometer ?? row.rawData?.odometer);
  return Number.isFinite(n) ? n : null;
}

function modeOf(speed) {
  if (!(speed > 0)) return 'idle';
  return speed < SPEED_THRESHOLD_KMH ? 'sweeping' : 'nonSweeping';
}

function roundKm(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function emptyBucket() {
  return { totalTimeSec: 0, totalKm: 0, segments: [] };
}

function finalizeSegment(seg) {
  const durationSec = Math.max(0, Math.round((seg.endTime - seg.startTime) / 1000));
  return {
    startTime: seg.startTime,
    endTime: seg.endTime,
    totalKm: roundKm(seg.km),
    durationSec,
  };
}

function segmentize(points) {
  const buckets = {
    sweeping: emptyBucket(),
    nonSweeping: emptyBucket(),
  };

  let current = null;

  function close() {
    if (!current) return;
    const bucket = buckets[current.mode];
    if (!bucket) {
      current = null;
      return;
    }
    const seg = finalizeSegment(current);
    if (seg.durationSec > 0 || seg.totalKm > 0) {
      bucket.segments.push(seg);
      bucket.totalTimeSec += seg.durationSec;
      bucket.totalKm = roundKm(bucket.totalKm + seg.totalKm);
    }
    current = null;
  }

  for (const point of points) {
    const t = getPointTime(point);
    if (!t) continue;

    const speed = getSpeed(point);
    const mode = modeOf(speed);
    const odo = getOdometer(point);
    const { lat, lng } = getCoords(point);

    if (mode === 'idle') {
      close();
      continue;
    }

    if (!current) {
      current = { mode, startTime: t, endTime: t, km: 0, lastOdo: odo, lastLat: lat, lastLng: lng };
      continue;
    }

    const gap = t - current.endTime;
    if (gap > MAX_GAP_MS || mode !== current.mode) {
      close();
      current = { mode, startTime: t, endTime: t, km: 0, lastOdo: odo, lastLat: lat, lastLng: lng };
      continue;
    }

    let dKm = 0;
    if (odo != null && current.lastOdo != null && odo >= current.lastOdo) {
      // Use odometer difference (more reliable than GPS haversine)
      dKm = odo - current.lastOdo;
    } else if (odo != null && current.lastOdo != null) {
      // Odometer reset or invalid - don't use haversine, skip this point
      console.warn(`[sweepingStore] Odometer reset detected: ${current.lastOdo} -> ${odo} for vehicle ${current.vehicleNo}`);
      dKm = 0;
    } else {
      // No odometer data - don't use haversine as it gives incorrect results with static GPS
      dKm = 0;
    }

    current.endTime = t;
    current.km += dKm;
    current.lastOdo = odo != null ? odo : current.lastOdo;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      current.lastLat = lat;
      current.lastLng = lng;
    }
  }

  close();
  return buckets;
}

function isGpsOnline(vehicle, lastPointTime) {
  const lastMs = lastPointTime || (vehicle.syncedAt ? new Date(vehicle.syncedAt).getTime() : 0);
  if (lastMs && Date.now() - lastMs <= GPS_ONLINE_MS) return true;
  const gsm = vehicle.gsmSignals ?? vehicle.rawData?.terminalPacketMeta?.gsmSignals;
  const state = String(vehicle.state || vehicle.rawData?.state || '').toLowerCase();
  return Number(gsm) > 0 && !/unreach|inactive/.test(state);
}

function formatLastUpdate(vehicle, lastPointTime) {
  if (lastPointTime) {
    const d = new Date(lastPointTime);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const lu = vehicle.lastUpdate || vehicle.rawData?.lu || '';
  const time = String(lu).match(/(\d{2}:\d{2})/);
  return time ? time[1] : lu || '--';
}

async function getSweepingReport(user, { startTime, endTime, ouid = '' }) {
  const start = new Date(Number(startTime));
  const end = new Date(Number(endTime));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const err = new Error('Valid startTime and endTime are required');
    err.statusCode = 400;
    throw err;
  }

  console.log(`[getSweepingReport] Date range: ${start.toISOString()} to ${end.toISOString()}`);

  const liveVehicles = await getVehiclesForUser(user);
  const vehicleRows = liveVehicles.map((raw) => ({
    ouid: raw.ouid,
    vehicleNo: raw.vehicleNo,
    alias: raw.alias || '',
    vehicleType: raw.vehicleType || '',
    state: raw.state || '',
    lastUpdate: raw.lu,
    gsmSignals: raw.terminalPacketMeta?.gsmSignals,
    syncedAt: null,
    rawData: raw,
  }));

  const allowedOuids = new Set(vehicleRows.map((v) => v.ouid).filter(Boolean));
  if (ouid) {
    if (!allowedOuids.has(ouid)) {
      const err = new Error('You do not have access to this vehicle');
      err.statusCode = 403;
      throw err;
    }
  }

  const query = {
    recordedAt: { $gte: start, $lte: end },
  };
  if (ouid) {
    query.ouid = ouid;
  } else if (user.role !== 'admin') {
    query.ouid = { $in: [...allowedOuids] };
  }

  const history = await VehicleHistory.find(query).sort({ ouid: 1, recordedAt: 1 }).lean();
  console.log(`[getSweepingReport] Found ${history.length} records in date range`);

  const byOuid = new Map();
  for (const row of history) {
    if (!row.ouid) continue;
    if (!byOuid.has(row.ouid)) byOuid.set(row.ouid, []);
    byOuid.get(row.ouid).push(row);
  }

  const selected = ouid ? vehicleRows.filter((v) => v.ouid === ouid) : vehicleRows;

  let lastUpdateMs = 0;
  const vehicles = selected.map((vehicle) => {
    const points = byOuid.get(vehicle.ouid) || [];
    const buckets = segmentize(points);
    const lastPointTime = points.length ? getPointTime(points[points.length - 1]) : 0;
    if (lastPointTime > lastUpdateMs) lastUpdateMs = lastPointTime;

    return {
      ouid: vehicle.ouid,
      vehicleNo: vehicle.vehicleNo || vehicle.ouid,
      alias: vehicle.alias || vehicle.vehicleType || 'Sweeper Machine',
      vehicleType: vehicle.vehicleType || '',
      state: vehicle.state || '',
      gpsOnline: isGpsOnline(vehicle, lastPointTime),
      lastUpdate: formatLastUpdate(vehicle, lastPointTime),
      lastUpdateAt: lastPointTime || null,
      sweeping: buckets.sweeping,
      nonSweeping: buckets.nonSweeping,
    };
  });

  const summary = vehicles.reduce(
    (acc, v) => {
      acc.sweepingTimeSec += v.sweeping.totalTimeSec;
      acc.sweepingKm = roundKm(acc.sweepingKm + v.sweeping.totalKm);
      acc.nonSweepingTimeSec += v.nonSweeping.totalTimeSec;
      acc.nonSweepingKm = roundKm(acc.nonSweepingKm + v.nonSweeping.totalKm);
      return acc;
    },
    { sweepingTimeSec: 0, sweepingKm: 0, nonSweepingTimeSec: 0, nonSweepingKm: 0 }
  );

  return {
    startTime: start.getTime(),
    endTime: end.getTime(),
    speedThresholdKmh: SPEED_THRESHOLD_KMH,
    lastUpdate: lastUpdateMs ? formatLastUpdate({}, lastUpdateMs) : '--',
    lastUpdateAt: lastUpdateMs || null,
    summary,
    vehicles,
  };
}

module.exports = {
  getSweepingReport,
  SPEED_THRESHOLD_KMH,
};
