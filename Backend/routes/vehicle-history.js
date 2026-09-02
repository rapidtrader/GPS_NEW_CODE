const express = require('express');
const crypto = require('crypto');
const { authMiddleware } = require('../middleware/auth');
const { requireModule } = require('../middleware/access');
const {
  fetchRouteHistory,
  saveRouteHistory,
  getRouteHistory,
} = require('../services/vehicleRouteHistoryStore');
const { getVehiclesForUser } = require('../services/vehicleStore');
const { getAuthToken } = require('../services/tbtrack');

const router = express.Router();

// ── Cron-secret middleware ──────────────────────────────────────────────────
// Used only by the /sync-cron endpoint. Never used by the JWT-authenticated routes.
function cronSecretMiddleware(req, res, next) {
  const CRON_SECRET = process.env.CRON_SECRET;

  if (!CRON_SECRET) {
    // Misconfigured server — fail closed
    console.error('[VehicleHistory Cron] CRON_SECRET is not set in environment');
    return res.status(500).json({ status: 'ERROR', message: 'Server misconfiguration' });
  }

  const incoming = req.headers['x-cron-secret'];
  if (!incoming) {
    return res.status(401).json({ status: 'ERROR', message: 'Missing X-Cron-Secret header' });
  }

  // Timing-safe comparison — prevents timing attacks
  const expected = Buffer.from(CRON_SECRET);
  const provided = Buffer.from(incoming);
  const match =
    expected.length === provided.length &&
    crypto.timingSafeEqual(expected, provided);

  if (!match) {
    return res.status(403).json({ status: 'ERROR', message: 'Invalid cron secret' });
  }

  next();
}

// GET route history
router.get('/:vehicleNo', authMiddleware, async (req, res) => {
  try {
    const { vehicleNo } = req.params;
    const { startDate, endDate } = req.query;

    console.log(`[VehicleHistory API] GET /${vehicleNo} called`);

    // Verify user has access to this vehicle
    const userVehicles = await getVehiclesForUser(req.user);
    const hasAccess = userVehicles.some((v) => v.vehicleNo === vehicleNo);

    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'ERROR',
        message: 'Access denied to this vehicle',
      });
    }

    const history = await getRouteHistory(req.user, vehicleNo, { startDate, endDate });

    res.json({
      status: 'OK',
      code: 200,
      data: history,
      source: 'database',
    });
  } catch (error) {
    console.error('[VehicleHistory API] Error:', error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

// POST to fetch fresh route history from TBTrack and save
router.post('/:vehicleNo/sync', authMiddleware, async (req, res) => {
  try {
    const { vehicleNo } = req.params;
    const { startTime, endTime } = req.body;

    console.log(`[VehicleHistory API] POST /${vehicleNo}/sync called`);

    if (!startTime || !endTime) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'startTime and endTime are required',
      });
    }

    // Verify user has access to this vehicle
    const userVehicles = await getVehiclesForUser(req.user);
    const hasAccess = userVehicles.some((v) => v.vehicleNo === vehicleNo);

    if (!hasAccess && req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'ERROR',
        message: 'Access denied to this vehicle',
      });
    }

    // Get auth token
    const token = await getAuthToken();

    // Fetch from TBTrack (with 25s timeout so nginx doesn't 504 first)
    console.log(`[VehicleHistory API] Fetching route history from TBTrack...`);
    const fetchWithTimeout = (promise, ms) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TBTrack request timed out after ${ms / 1000}s`)), ms)
      );
      return Promise.race([promise, timeout]);
    };

    const historyData = await fetchWithTimeout(
      fetchRouteHistory(token, { vehicleNo, startTime, endTime }),
      25000 // 25 seconds — nginx default is 60s, gives us headroom
    );

    console.log(`[VehicleHistory API] Received ${historyData.length} history points`);

    // Save to database
    const savedCount = await saveRouteHistory(historyData, vehicleNo, req.user._id);

    console.log(`[VehicleHistory API] Saved ${savedCount} history records`);

    res.json({
      status: 'OK',
      code: 200,
      data: historyData,
      savedCount,
      source: 'live',
      saved: true,
    });
  } catch (error) {
    console.error('[VehicleHistory API] Error:', error.message);
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

// POST /sync-cron — cron-job.org calls this every minute with X-Cron-Secret header.
// No JWT required. Syncs the last 2 hours of route history for the given vehicle.
// Uses the same fetchRouteHistory + saveRouteHistory logic as /sync.
router.post('/:vehicleNo/sync-cron', cronSecretMiddleware, async (req, res) => {
  const { vehicleNo } = req.params;

  console.log(`[VehicleHistory Cron] Sync started for ${vehicleNo}`);

  try {
    // Build time window: last 2 hours (covers any 1-minute cron gap with overlap)
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000);

    // Get TBTrack auth token
    const token = await getAuthToken();

    // Fetch from TBTrack (25s timeout — well within nginx 60s limit)
    const fetchWithTimeout = (promise, ms) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TBTrack request timed out after ${ms / 1000}s`)), ms)
      );
      return Promise.race([promise, timeout]);
    };

    const historyData = await fetchWithTimeout(
      fetchRouteHistory(token, { vehicleNo, startTime, endTime }),
      25000
    );

    console.log(`[VehicleHistory Cron] Received ${historyData.length} history points for ${vehicleNo}`);

    // Save — duplicate records are silently skipped by saveRouteHistory's existingSet check
    const savedCount = await saveRouteHistory(historyData, vehicleNo, null);

    console.log(`[VehicleHistory Cron] Sync completed for ${vehicleNo} — saved ${savedCount} new records`);

    return res.status(200).json({
      status: 'OK',
      code: 200,
      vehicleNo,
      received: historyData.length,
      savedCount,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
    });
  } catch (error) {
    console.error(`[VehicleHistory Cron] Sync failed for ${vehicleNo}: ${error.message}`);
    return res.status(500).json({
      status: 'ERROR',
      vehicleNo,
      message: error.message,
    });
  }
});

module.exports = router;
