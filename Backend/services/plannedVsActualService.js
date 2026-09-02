/**
 * plannedVsActualService.js
 *
 * Calculates Planned vs Actual road sweeping performance.
 *
 * Data sources:
 *   - SweepingPlan   → planned roads, machine road sequence, planned KM
 *   - Road           → master GPS route geometry (gpsPoints[{coordinates:[lng,lat]}])
 *   - vehicleroutehistories → actual GPS movement (latitude, longitude, added, speed, status)
 *
 * KEY RULES (never violate):
 *   1. GPS event timestamp = `added`
 *   2. GeoJSON coords = [longitude, latitude]  (road.gpsPoints)
 *   3. GPS records have separate latitude/longitude fields (NOT GeoJSON)
 *   4. Machine Road Sequence ≠ Road GPS Point Sequence
 *   5. NO sweeping hardware signal → sweepingStatus = 'unknown'
 *   6. Ignition ON ≠ Sweeping ON
 *   7. Do NOT double-count road coverage from repeated GPS passes
 *   8. Coverage capped at 100%
 *   9. missedKm minimum = 0
 *  10. actualSweepingKm ≠ total GPS travel distance
 *  11. Never modify vehicleroutehistories docs
 */

const VehicleRouteHistory = require('../models/VehicleRouteHistory');
const Road                = require('../models/Road');

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Default GPS matching tolerance in meters.
 * A GPS point is considered "on" a road segment if it lies within this distance.
 * 30m is reasonable for urban road sweeping with typical GPS accuracy (~5-15m).
 * Configurable — callers can pass a custom tolerance.
 */
const DEFAULT_TOLERANCE_METERS = 30;

/**
 * Max allowed time gap between consecutive GPS points (ms).
 * If gap exceeds this, the segment is broken (do not draw/count across large gaps).
 * 5 minutes is a sensible upper bound for a moving sweeper.
 */
const DEFAULT_MAX_GPS_GAP_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Minimum GPS point count for a road to be calculable.
 */
const MIN_ROAD_GPS_POINTS = 2;

/**
 * Max unrealistic GPS jump distance (meters) between consecutive points.
 * Points jumping more than this are treated as GPS noise and filtered out.
 * 500m in a single GPS polling cycle (~10-30s) is physically impossible for a sweeper.
 */
const MAX_POINT_JUMP_METERS = 500;

// ─── Math helpers ─────────────────────────────────────────────────────────────

/** Haversine distance between two [lat, lng] points in meters. */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Perpendicular distance (meters) from point P to line segment AB.
 * All inputs as {lat, lng}.
 */
function pointToSegmentDistanceMeters(P, A, B) {
  const dx = B.lng - A.lng;
  const dy = B.lat - A.lat;
  if (dx === 0 && dy === 0) return haversineMeters(P.lat, P.lng, A.lat, A.lng);
  const t = Math.max(0, Math.min(1, ((P.lng - A.lng) * dx + (P.lat - A.lat) * dy) / (dx * dx + dy * dy)));
  const closestLat = A.lat + t * dy;
  const closestLng = A.lng + t * dx;
  return haversineMeters(P.lat, P.lng, closestLat, closestLng);
}

/**
 * Closest distance from point to any segment of a polyline.
 * roadCoords: array of {lat, lng} (derived from road.gpsPoints).
 */
function pointToPolylineDistanceMeters(point, roadCoords) {
  if (roadCoords.length < 2) {
    return roadCoords.length === 1
      ? haversineMeters(point.lat, point.lng, roadCoords[0].lat, roadCoords[0].lng)
      : Infinity;
  }
  let minDist = Infinity;
  for (let i = 0; i < roadCoords.length - 1; i++) {
    const d = pointToSegmentDistanceMeters(point, roadCoords[i], roadCoords[i + 1]);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/**
 * Project a GPS point onto a road polyline.
 * Returns the along-road fraction [0..1] representing where on the road
 * the closest point lies, and the perpendicular distance.
 */
function projectPointOntoPolyline(point, roadCoords) {
  if (roadCoords.length < 2) return { fraction: 0, distMeters: Infinity, segIdx: 0 };

  // Compute cumulative lengths of each segment
  const segLengths = [];
  let totalLen = 0;
  for (let i = 0; i < roadCoords.length - 1; i++) {
    const len = haversineMeters(roadCoords[i].lat, roadCoords[i].lng,
                                roadCoords[i + 1].lat, roadCoords[i + 1].lng);
    segLengths.push(len);
    totalLen += len;
  }
  if (totalLen === 0) return { fraction: 0, distMeters: Infinity, segIdx: 0 };

  let bestDist = Infinity;
  let bestFraction = 0;
  let bestSegIdx = 0;
  let cumulativeLen = 0;

  for (let i = 0; i < roadCoords.length - 1; i++) {
    const A = roadCoords[i];
    const B = roadCoords[i + 1];
    const dx = B.lng - A.lng;
    const dy = B.lat - A.lat;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((point.lng - A.lng) * dx + (point.lat - A.lat) * dy) / lenSq));
    }
    const closestLat = A.lat + t * dy;
    const closestLng = A.lng + t * dx;
    const dist = haversineMeters(point.lat, point.lng, closestLat, closestLng);

    if (dist < bestDist) {
      bestDist = dist;
      bestFraction = (cumulativeLen + t * segLengths[i]) / totalLen;
      bestSegIdx = i;
    }
    cumulativeLen += segLengths[i];
  }
  return { fraction: bestFraction, distMeters: bestDist, segIdx: bestSegIdx };
}

// ─── GPS cleaning ─────────────────────────────────────────────────────────────

/**
 * Clean GPS points:
 *   - Remove invalid/null coordinates
 *   - Remove duplicate lat/lng
 *   - Remove unrealistic jumps (> MAX_POINT_JUMP_METERS between consecutive)
 *   - Ensure ascending by `added` timestamp
 *
 * Returns array of {lat, lng, speed, added, status, ignition}
 */
function cleanGpsPoints(rawDocs) {
  // Filter: valid coords + valid timestamp
  const valid = rawDocs.filter((d) => {
    const lat = d.latitude;
    const lng = d.longitude;
    return (
      typeof lat === 'number' && !isNaN(lat) && lat >= -90  && lat <= 90 &&
      typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180 &&
      d.added instanceof Date || (d.added && !isNaN(new Date(d.added).getTime()))
    );
  });

  // Sort ascending by GPS event time
  valid.sort((a, b) => new Date(a.added).getTime() - new Date(b.added).getTime());

  // Remove duplicates (same lat/lng within 1m)
  const deduped = [];
  for (const d of valid) {
    if (deduped.length === 0) { deduped.push(d); continue; }
    const prev = deduped[deduped.length - 1];
    const dist = haversineMeters(prev.latitude, prev.longitude, d.latitude, d.longitude);
    if (dist > 1) deduped.push(d); // keep if moved > 1m
  }

  // Remove unrealistic jumps
  const cleaned = [];
  for (const d of deduped) {
    if (cleaned.length === 0) { cleaned.push(d); continue; }
    const prev = cleaned[cleaned.length - 1];
    const dist = haversineMeters(prev.latitude, prev.longitude, d.latitude, d.longitude);
    if (dist <= MAX_POINT_JUMP_METERS) {
      cleaned.push(d);
    }
    // else: silently skip GPS noise jump — does not delete original doc
  }

  return cleaned.map((d) => {
    const s = (d.status || '').toLowerCase();
    const ignition = s.includes('ignition on') ? true : s.includes('ignition off') ? false : null;
    return {
      lat:       d.latitude,
      lng:       d.longitude,
      speed:     typeof d.speed === 'number' ? d.speed : null,
      added:     new Date(d.added).getTime(),
      status:    d.status || '',
      ignition,
    };
  });
}

// ─── Coverage calculation ─────────────────────────────────────────────────────

/**
 * Convert road.gpsPoints to array of {lat, lng}.
 * Road gpsPoints coordinates are [lng, lat] (GeoJSON order).
 */
function roadGpsPointsToLatLng(gpsPoints) {
  const sorted = [...gpsPoints].sort((a, b) => a.sequence - b.sequence);
  return sorted
    .filter((p) => Array.isArray(p.coordinates) && p.coordinates.length === 2)
    .map((p) => ({ lat: p.coordinates[1], lng: p.coordinates[0] }));
}

/**
 * Calculate road total length in km from its gpsPoints.
 */
function roadLengthFromGpsPoints(roadCoords) {
  let total = 0;
  for (let i = 0; i < roadCoords.length - 1; i++) {
    total += haversineMeters(roadCoords[i].lat, roadCoords[i].lng,
                              roadCoords[i + 1].lat, roadCoords[i + 1].lng);
  }
  return total / 1000; // km
}

/**
 * Calculate actual swept fraction of a single road.
 *
 * Algorithm:
 *   1. For each GPS point, project onto road polyline.
 *   2. If within tolerance, record the road fraction position.
 *   3. Track unique road fractions covered (using discretized buckets to avoid double-counting).
 *   4. Sum unique bucket coverage × road total length.
 *   5. Break segments at time gaps > MAX_GPS_GAP_MS.
 *
 * sweepingSpeedLimit: from project settings.
 * No hardware sweeping signal → every GPS point within tolerance is treated as
 * "potentially on road" but sweepingStatus remains 'unknown'.
 * For coverage purposes, being on the road geometry = counted as swept
 * (best approximation without hardware signal — clearly documented).
 *
 * @returns {object} { actualKm, coveragePercent, sweepingSignalAvailable, bucketsCovered }
 */
function calculateRoadCoverage(roadCoords, gpsPoints, sweepingSpeedLimit, toleranceMeters, maxGapMs) {
  if (roadCoords.length < MIN_ROAD_GPS_POINTS || gpsPoints.length === 0) {
    return {
      actualKm: 0,
      coveragePercent: 0,
      sweepingSignalAvailable: false,
      onRoadPointCount: 0,
    };
  }

  const roadLengthKm = roadLengthFromGpsPoints(roadCoords);
  if (roadLengthKm <= 0) {
    return { actualKm: 0, coveragePercent: 0, sweepingSignalAvailable: false, onRoadPointCount: 0 };
  }

  // Discretize road into 200 equal buckets to track unique coverage.
  // Each bucket = 0.5% of road length. This avoids double-counting repeated passes.
  const NUM_BUCKETS = 200;
  const coveredBuckets = new Set();
  let onRoadPointCount = 0;

  for (let i = 0; i < gpsPoints.length; i++) {
    const pt = gpsPoints[i];

    // Time gap check — break segment if too large
    if (i > 0) {
      const gap = pt.added - gpsPoints[i - 1].added;
      if (gap > maxGapMs) continue; // skip this point across the gap
    }

    const { fraction, distMeters } = projectPointOntoPolyline(
      { lat: pt.lat, lng: pt.lng },
      roadCoords
    );

    if (distMeters <= toleranceMeters) {
      onRoadPointCount++;
      const bucket = Math.min(Math.floor(fraction * NUM_BUCKETS), NUM_BUCKETS - 1);
      coveredBuckets.add(bucket);
    }
  }

  const coverageFraction = coveredBuckets.size / NUM_BUCKETS;
  const actualKm = Math.min(coverageFraction * roadLengthKm, roadLengthKm);
  const coveragePercent = Math.min(Math.round(coverageFraction * 10000) / 100, 100);

  return {
    actualKm: Math.round(actualKm * 1000) / 1000,
    coveragePercent,
    sweepingSignalAvailable: false, // No hardware signal confirmed in this GPS data
    onRoadPointCount,
  };
}

// ─── Completion status ────────────────────────────────────────────────────────

function getCompletionStatus(coveragePercent, completionThreshold) {
  if (coveragePercent <= 0) return 'not_completed';
  if (coveragePercent >= completionThreshold) return 'completed';
  return 'partially_completed';
}

// ─── Build actual GPS route (for frontend map) ────────────────────────────────

function buildActualRouteSegments(gpsPoints, maxGapMs) {
  // Returns array of segments (arrays of [lat, lng]), breaking at time gaps.
  if (gpsPoints.length === 0) return [];
  const segments = [];
  let current = [gpsPoints[0]];
  for (let i = 1; i < gpsPoints.length; i++) {
    const gap = gpsPoints[i].added - gpsPoints[i - 1].added;
    if (gap > maxGapMs) {
      if (current.length >= 2) segments.push(current);
      current = [gpsPoints[i]];
    } else {
      current.push(gpsPoints[i]);
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments.map((seg) => seg.map((p) => [p.lat, p.lng]));
}

// ─── Main calculation ─────────────────────────────────────────────────────────

/**
 * calculatePlannedVsActual
 *
 * @param {object} plan          - SweepingPlan document (lean)
 * @param {object} machine       - Machine document (lean)
 * @param {object} project       - Project document (lean)
 * @param {Map}    roadMap       - Map<roadId, Road> with gpsPoints loaded
 * @param {Array}  rawGpsDocs   - Raw vehicleroutehistories docs for this vehicle+date
 * @param {object} opts
 * @param {number} opts.toleranceMeters  (default 30)
 * @param {number} opts.maxGapMs         (default 5min)
 *
 * @returns {object} machine-level result with road-wise breakdown
 */
function calculatePlannedVsActual(plan, machine, project, roadMap, rawGpsDocs, opts = {}) {
  const toleranceMeters = opts.toleranceMeters ?? DEFAULT_TOLERANCE_METERS;
  const maxGapMs        = opts.maxGapMs        ?? DEFAULT_MAX_GPS_GAP_MS;
  const sweepingSpeedLimit  = project?.settings?.sweepingSpeedLimit  ?? null;
  const completionThreshold = project?.settings?.completionThreshold ?? 90;

  // Clean GPS points once for all roads
  const cleanedGps = cleanGpsPoints(rawGpsDocs);

  // Build actual route segments for map display
  const actualRouteSegments = buildActualRouteSegments(cleanedGps, maxGapMs);

  // Per-road calculation
  const roadResults = [];
  let totalPlannedKm  = 0;
  let totalActualKm   = 0;
  let completedRoads  = 0;
  let partialRoads    = 0;
  let notCompletedRoads = 0;

  for (const planRoad of plan.roads) {
    const road = roadMap.get(planRoad.roadId);
    const plannedKm = planRoad.plannedKm || 0;
    totalPlannedKm += plannedKm;

    if (!road) {
      // Road not found in master data
      roadResults.push({
        roadId:     planRoad.roadId,
        roadName:   planRoad.roadName || planRoad.roadId,
        areaName:   planRoad.areaName || '',
        colonyName: planRoad.colonyName || '',
        sequence:   planRoad.sequence,
        plannedKm,
        actualKm:         0,
        missedKm:         plannedKm,
        coveragePercent:  0,
        status:           'not_completed',
        error:            'Road master data not found',
        plannedRoute:     [],
        sweepingSignalAvailable: false,
        onRoadPointCount: 0,
      });
      notCompletedRoads++;
      continue;
    }

    const roadCoords = roadGpsPointsToLatLng(road.gpsPoints || []);

    if (roadCoords.length < MIN_ROAD_GPS_POINTS) {
      roadResults.push({
        roadId:     road.roadId,
        roadName:   road.roadName,
        areaName:   road.areaName || '',
        colonyName: road.colonyName || '',
        sequence:   planRoad.sequence,
        plannedKm,
        actualKm:         0,
        missedKm:         plannedKm,
        coveragePercent:  0,
        status:           'not_completed',
        error:            'Road has insufficient GPS points (< 2)',
        plannedRoute:     roadCoords.map((c) => [c.lat, c.lng]),
        sweepingSignalAvailable: false,
        onRoadPointCount: 0,
      });
      notCompletedRoads++;
      continue;
    }

    if (cleanedGps.length === 0) {
      roadResults.push({
        roadId:     road.roadId,
        roadName:   road.roadName,
        areaName:   road.areaName || '',
        colonyName: road.colonyName || '',
        sequence:   planRoad.sequence,
        plannedKm,
        actualKm:         0,
        missedKm:         plannedKm,
        coveragePercent:  0,
        status:           'not_completed',
        error:            'No GPS data available for this vehicle on this date',
        plannedRoute:     roadCoords.map((c) => [c.lat, c.lng]),
        sweepingSignalAvailable: false,
        onRoadPointCount: 0,
      });
      notCompletedRoads++;
      continue;
    }

    const coverage = calculateRoadCoverage(
      roadCoords, cleanedGps, sweepingSpeedLimit, toleranceMeters, maxGapMs
    );

    // Use plannedKm from plan (master data) as denominator
    // but cap actualKm at plannedKm (no > 100%)
    const actualKm        = Math.min(coverage.actualKm, plannedKm);
    const missedKm        = Math.max(0, Math.round((plannedKm - actualKm) * 1000) / 1000);
    const coveragePercent = plannedKm > 0
      ? Math.min(Math.round((actualKm / plannedKm) * 10000) / 100, 100)
      : 0;
    const status = getCompletionStatus(coveragePercent, completionThreshold);

    totalActualKm += actualKm;
    if (status === 'completed')          completedRoads++;
    else if (status === 'partially_completed') partialRoads++;
    else                                  notCompletedRoads++;

    roadResults.push({
      roadId:          road.roadId,
      roadName:        road.roadName,
      areaName:        road.areaName  || '',
      colonyName:      road.colonyName || '',
      sequence:        planRoad.sequence,
      plannedKm,
      actualKm:        Math.round(actualKm * 1000) / 1000,
      missedKm,
      coveragePercent,
      status,
      plannedRoute:    roadCoords.map((c) => [c.lat, c.lng]),
      sweepingSignalAvailable: false,
      onRoadPointCount: coverage.onRoadPointCount,
    });
  }

  // Sort by sequence (Machine Daily Road Sequence — NOT GPS point sequence)
  roadResults.sort((a, b) => a.sequence - b.sequence);

  totalActualKm = Math.round(totalActualKm * 1000) / 1000;
  const totalMissedKm = Math.max(0, Math.round((totalPlannedKm - totalActualKm) * 1000) / 1000);
  const overallCoverage = totalPlannedKm > 0
    ? Math.min(Math.round((totalActualKm / totalPlannedKm) * 10000) / 100, 100)
    : 0;

  return {
    machineId:    machine.machineId,
    machineName:  machine.machineName,
    vehicleNumber: machine.vehicleNumber,
    planDate:     plan.planDate,
    planStatus:   plan.status,
    capacityKm:   plan.capacityKm,

    totalPlannedKm:  Math.round(totalPlannedKm  * 1000) / 1000,
    totalActualKm,
    totalMissedKm,
    overallCoveragePercent: overallCoverage,

    completedRoads,
    partiallyCompletedRoads:  partialRoads,
    notCompletedRoads,

    gpsPointsTotal:   rawGpsDocs.length,
    gpsPointsCleaned: cleanedGps.length,

    sweepingSignalAvailable: false,
    sweepingNote: 'No hardware sweeping sensor signal available. Coverage based on GPS proximity to road geometry.',
    toleranceMeters,

    actualRouteSegments, // [[lat,lng]...] segments for map
    roads: roadResults,
  };
}

// ─── Date range builder ───────────────────────────────────────────────────────

/**
 * Convert a YYYY-MM-DD plan date to UTC start/end covering the full IST day.
 * GPS data is stored in UTC (IST - 5:30h offset).
 * IST day = UTC previous day 18:30 to current day 18:29:59.
 */
function planDateToUtcRange(planDateStr) {
  // planDateStr = "YYYY-MM-DD"
  const [y, m, d] = planDateStr.split('-').map(Number);
  // IST midnight = UTC 18:30 previous day
  const startUtc = new Date(Date.UTC(y, m - 1, d - 1, 18, 30, 0, 0));
  const endUtc   = new Date(Date.UTC(y, m - 1, d,     18, 29, 59, 999));
  return { startUtc, endUtc };
}

module.exports = {
  calculatePlannedVsActual,
  cleanGpsPoints,
  calculateRoadCoverage,
  getCompletionStatus,
  roadGpsPointsToLatLng,
  roadLengthFromGpsPoints,
  haversineMeters,
  pointToPolylineDistanceMeters,
  buildActualRouteSegments,
  planDateToUtcRange,
  DEFAULT_TOLERANCE_METERS,
  DEFAULT_MAX_GPS_GAP_MS,
};
