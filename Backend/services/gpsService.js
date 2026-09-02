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

// ── getLatestLocationsByVehicleNumbers ────────────────────────────────────────
/**
 * Efficiently get the latest GPS record for each vehicle using aggregation.
 * Avoids N separate queries — one aggregation pipeline over the indexed collection.
 *
 * @param {string[]} vehicleNumbers
 * @returns {Map<vehicleNo, gpsDoc>}
 */
async function getLatestLocationsByVehicleNumbers(vehicleNumbers) {
  if (!Array.isArray(vehicleNumbers) || vehicleNumbers.length === 0) return new Map();

  // Use $group to get latest added per vehicleNo, then $lookup to get full doc.
  // This leverages the existing {vehicleNo:1, added:1} index.
  const results = await VehicleRouteHistory.aggregate([
    { $match: { vehicleNo: { $in: vehicleNumbers } } },
    { $sort: { vehicleNo: 1, added: -1 } },
    {
      $group: {
        _id: '$vehicleNo',
        docId: { $first: '$_id' },
        vehicleNo:       { $first: '$vehicleNo' },
        latitude:        { $first: '$latitude' },
        longitude:       { $first: '$longitude' },
        speed:           { $first: '$speed' },
        added:           { $first: '$added' },
        actualReceived:  { $first: '$actualReceived' },
        status:          { $first: '$status' },
        address:         { $first: '$address' },
        ouid:            { $first: '$ouid' },
      },
    },
  ]);

  const map = new Map();
  for (const r of results) {
    map.set(r.vehicleNo, r);
  }
  return map;
}

// ── getLatestVehicleLocation ──────────────────────────────────────────────────
/**
 * Get the single latest GPS record for one vehicle.
 * @param {string} vehicleNo
 */
async function getLatestVehicleLocation(vehicleNo) {
  return VehicleRouteHistory.findOne({ vehicleNo })
    .sort({ added: -1 })
    .lean();
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

  const vehicleNumbers = activeMachines.map((m) => m.vehicleNumber).filter(Boolean);
  const latestMap = await getLatestLocationsByVehicleNumbers(vehicleNumbers);

  return activeMachines.map((machine) => {
    const gpsDoc = latestMap.get(machine.vehicleNumber);
    if (!gpsDoc) {
      // Machine has no GPS data yet
      return {
        machineId:    machine.machineId,
        machineName:  machine.machineName,
        vehicleNumber: machine.vehicleNumber,
        projectId:    machine.projectId,
        latitude:     null,
        longitude:    null,
        speed:        null,
        ignition:     null,
        sweepingStatus: 'unknown',
        sweepingSignalAvailable: false,
        timestamp:    null,
        receivedAt:   null,
        address:      null,
        status:       null,
        gpsAvailable: false,
      };
    }
    return {
      ...shapeLiveRecord(gpsDoc, machine, sweepingSpeedLimit),
      gpsAvailable: true,
    };
  });
}

module.exports = {
  parseIgnition,
  deriveSweepingStatus,
  isValidCoord,
  getLatestVehicleLocation,
  getLatestLocationsByVehicleNumbers,
  getVehicleRouteHistoryByRange,
  getLiveProjectMachines,
  shapeLiveRecord,
};
