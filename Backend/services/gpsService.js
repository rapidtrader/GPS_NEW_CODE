/**
 * gpsService.js
 *
 * GPS data read service for the Sweeping Machine Tracking module.
 * Source: vehicleroutehistories collection (existing, DO NOT modify structure).
 * Mapping: Machine.vehicleNumber = VehicleRouteHistory.vehicleNo
 *
 * Timestamp convention (per existing codebase):
 *   `added`          = actual GPS event time  ← primary sort field
 *   `actualReceived` = server ingestion time
 *
 * Sweeping Signal: NOT available in this GPS data.
 *   status = "Ignition on" / "Ignition off" ONLY.
 *   Speed-based sweeping detection requires project.settings.sweepingSpeedLimit
 *   but speed <= limit alone does NOT confirm sweeping equipment is ON.
 *   sweepingStatus is therefore returned as 'unknown' unless a future signal exists.
 */

const VehicleRouteHistory = require('../models/VehicleRouteHistory');

// ── Reverse geocode fallback ──────────────────────────────────────────────────
// Called only when no real address exists in DB for a vehicle.
// Uses the same /api/geocode proxy logic (Google Maps → Nominatim).
async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    let address = null;

    if (apiKey) {
      try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&language=en&result_type=street_address|route|locality`;
        const r = await fetch(url, { signal: controller.signal });
        const data = await r.json();
        if (data.status === 'OK' && data.results?.[0]?.formatted_address) {
          address = data.results[0].formatted_address;
        }
      } catch (_) {}
    }

    if (!address) {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=0`;
      const r = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'GPS-Tracking-App/1.0', 'Accept': 'application/json' },
      });
      if (r.ok) {
        const data = await r.json();
        address = data.display_name || null;
      }
    }

    clearTimeout(timer);
    return address;
  } catch (_) {
    return null;
  }
}

// ── Ignition parser ───────────────────────────────────────────────────────────
// Based on actual status values observed in vehicleroutehistories.
// Only "Ignition on" / "Ignition off" found — no other confirmed values.
// We use case-insensitive contains to be robust against minor variations.
function parseIgnition(statusStr) {
  if (!statusStr || typeof statusStr !== 'string') return null;
  const s = statusStr.toLowerCase();
  if (s.includes('ignition on')) return true;
  if (s.includes('ignition off')) return false;
  // Stoppage, idle, moving statuses — ignition state unknown
  return null;
}

// ── Sweeping status ───────────────────────────────────────────────────────────
// IMPORTANT: No PTO / brush / sweeping motor signal found in rawData.
// DO NOT infer sweeping from ignition or speed alone.
// Returns: 'unknown' | 'not_sweeping'
// 'not_sweeping' when speed > sweepingSpeedLimit (speed condition definitively fails)
// 'unknown' in all other cases (signal not available)
function deriveSweepingStatus(speed, ignition, sweepingSpeedLimit) {
  // If ignition is off, machine is not running → definitely not sweeping
  if (ignition === false) return 'not_sweeping';
  // If speed exceeds limit, sweeping condition fails on speed alone
  if (typeof sweepingSpeedLimit === 'number' && typeof speed === 'number') {
    if (speed > sweepingSpeedLimit) return 'not_sweeping';
  }
  // Cannot confirm sweeping ON without hardware signal
  return 'unknown';
}

// ── Coordinate validation ─────────────────────────────────────────────────────
function isValidCoord(lat, lng) {
  return (
    typeof lat === 'number' && !isNaN(lat) && lat >= -90  && lat <= 90 &&
    typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180
  );
}

// ── Shape a GPS record into a clean machine location object ──────────────────
function shapeLiveRecord(gpsDoc, machine, sweepingSpeedLimit) {
  const lat = gpsDoc.latitude;
  const lng = gpsDoc.longitude;
  const speed = typeof gpsDoc.speed === 'number' ? gpsDoc.speed : null;
  const ignition = parseIgnition(gpsDoc.status);
  const sweepingStatus = deriveSweepingStatus(speed, ignition, sweepingSpeedLimit);

  return {
    machineId:    machine.machineId,
    machineName:  machine.machineName,
    vehicleNumber: machine.vehicleNumber,
    projectId:    machine.projectId,

    latitude:  isValidCoord(lat, lng) ? lat  : null,
    longitude: isValidCoord(lat, lng) ? lng  : null,

    speed,
    ignition,
    sweepingStatus,
    sweepingSignalAvailable: false,   // No hardware sweeping signal in this GPS data

    timestamp:  gpsDoc.added       || null,   // GPS event time
    receivedAt: gpsDoc.actualReceived || null,
    address:    gpsDoc.address      || null,
    status:     gpsDoc.status       || null,
  };
}

// ── getLatestLocationsByMachineIds ───────────────────────────────────────────
/**
 * Efficiently get the latest GPS record for each machine using aggregation.
 * Matches Machine.machineId → VehicleRouteHistory.vehicleNo
 * (e.g. machineId "1CBM" = vehicleNo "1CBM" in vehicleroutehistories)
 *
 * @param {string[]} machineIds
 * @returns {Map<vehicleNo, gpsDoc>}
 */
async function getLatestLocationsByMachineIds(machineIds) {
  if (!Array.isArray(machineIds) || machineIds.length === 0) return new Map();

  const COORD_RE = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;

  // 1) Latest GPS record per vehicle (for lat/lng/speed/status/timestamp)
  const results = await VehicleRouteHistory.aggregate([
    { $match: { vehicleNo: { $in: machineIds } } },
    { $sort: { vehicleNo: 1, added: -1 } },
    {
      $group: {
        _id: '$vehicleNo',
        vehicleNo:      { $first: '$vehicleNo' },
        latitude:       { $first: '$latitude' },
        longitude:      { $first: '$longitude' },
        speed:          { $first: '$speed' },
        added:          { $first: '$added' },
        actualReceived: { $first: '$actualReceived' },
        status:         { $first: '$status' },
        ouid:           { $first: '$ouid' },
      },
    },
  ]);

  // 2) Most recent real address per vehicle — JS-side coord filter
  const addressCandidates = await VehicleRouteHistory.aggregate([
    {
      $match: {
        vehicleNo: { $in: machineIds },
        address: { $exists: true, $ne: null, $ne: '' },
      },
    },
    { $sort: { vehicleNo: 1, added: -1 } },
    {
      $group: {
        _id: '$vehicleNo',
        // collect up to 500 addresses, pick first real one in JS
        addresses: { $push: '$address' },
      },
    },
    {
      $project: {
        addresses: { $slice: ['$addresses', 500] },
      },
    },
  ]);

  // Build address map, filter out coord-only values in JS
  const addressMap = new Map();
  for (const a of addressCandidates) {
    const real = (a.addresses || []).find(
      (addr) => addr && !COORD_RE.test(addr.trim())
    );
    if (real) addressMap.set(a._id, real);
  }

  const map = new Map();
  for (const r of results) {
    map.set(r.vehicleNo, {
      ...r,
      address: addressMap.get(r.vehicleNo) || null,
    });
  }
  return map;
}

// ── getLatestVehicleLocation ──────────────────────────────────────────────────
/**
 * Get the single latest GPS record for one machine.
 * @param {string} machineId  — matches VehicleRouteHistory.vehicleNo
 */
async function getLatestVehicleLocation(machineId) {
  const COORD_RE = /^-?\d+\.\d+,\s*-?\d+\.\d+$/;

  const latest = await VehicleRouteHistory.findOne({ vehicleNo: machineId })
    .sort({ added: -1 })
    .lean();

  if (!latest) return null;

  // Scan up to 500 recent records for a real address
  const recent = await VehicleRouteHistory.find(
    { vehicleNo: machineId, address: { $exists: true, $ne: null, $ne: '' } }
  )
    .sort({ added: -1 })
    .limit(500)
    .select('address')
    .lean();

  const realAddr = recent.find(
    (r) => r.address && !COORD_RE.test(r.address.trim())
  );

  return { ...latest, address: realAddr?.address || null };
}

// ── getVehicleRouteHistoryByRange ─────────────────────────────────────────────
/**
 * Get GPS history for a vehicle within a time range.
 * startTime and endTime should be Date objects or ISO strings.
 * Returns points sorted ascending by GPS event time (added).
 */
async function getVehicleRouteHistoryByRange(vehicleNo, startTime, endTime) {
  const query = { vehicleNo };
  if (startTime || endTime) {
    query.added = {};
    if (startTime) query.added.$gte = new Date(startTime);
    if (endTime)   query.added.$lte = new Date(endTime);
  }
  return VehicleRouteHistory.find(query)
    .sort({ added: 1 })   // ascending — oldest first for route replay
    .select('vehicleNo latitude longitude speed added actualReceived status address distance')
    .lean();
}

// ── getLiveProjectMachines ────────────────────────────────────────────────────
/**
 * Get live GPS status for all active machines of a project.
 *
 * Flow:
 *   Project → Active Machines → vehicle numbers →
 *   Latest GPS per vehicle → shape into live status
 *
 * @param {Array}  activeMachines  - Machine docs (plain objects)
 * @param {number} sweepingSpeedLimit - from Project.settings
 * @returns {Array} live machine status objects
 */
async function getLiveProjectMachines(activeMachines, sweepingSpeedLimit) {
  if (activeMachines.length === 0) return [];

  const Vehicle = require('../models/Vehicle');

  // Match Machine.machineId → VehicleRouteHistory.vehicleNo
  const machineIds = activeMachines.map((m) => m.machineId).filter(Boolean);

  // Fetch latest GPS data and live addresses from Vehicle collection in parallel
  const [latestMap, vehicleDocs] = await Promise.all([
    getLatestLocationsByMachineIds(machineIds),
    Vehicle.find({ vehicleNo: { $in: machineIds } }, { vehicleNo: 1, address: 1 }).lean(),
  ]);

  // vehicleNo → live address from Vehicle collection (same source as /map page)
  const liveAddressMap = new Map(vehicleDocs.map((v) => [v.vehicleNo, v.address || null]));

  const shaped = activeMachines.map((machine) => {
    const gpsDoc = latestMap.get(machine.machineId);
    // Address priority: Vehicle.address (live, same as /map) → VehicleRouteHistory address → null
    const address = liveAddressMap.get(machine.machineId) || (gpsDoc?.address || null);

    if (!gpsDoc) {
      return {
        machineId:    machine.machineId,
        machineName:  machine.machineName,
        vehicleNumber: machine.vehicleNumber,
        projectId:    machine.projectId,
        latitude:     null, longitude:    null, speed: null,
        ignition:     null, sweepingStatus: 'unknown',
        sweepingSignalAvailable: false,
        timestamp:    null, receivedAt: null,
        address,               // from Vehicle collection
        status: null,
        gpsAvailable: false,
      };
    }
    const record = { ...shapeLiveRecord(gpsDoc, machine, sweepingSpeedLimit), gpsAvailable: true };
    record.address = address; // override with Vehicle.address (live, same as /map)
    return record;
  });

  return shaped;
}

module.exports = {
  parseIgnition,
  deriveSweepingStatus,
  isValidCoord,
  getLatestVehicleLocation,
  getLatestLocationsByMachineIds,
  getVehicleRouteHistoryByRange,
  getLiveProjectMachines,
  shapeLiveRecord,
};
