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

// GET /sync-status — returns routeHistorySyncedAt for a vehicle (used by frontend)
router.get('/:vehicleNo/sync-status', authMiddleware, async (req, res) => {
  try {
    const { vehicleNo } = req.params;
    const Vehicle = require('../models/Vehicle');
    const vehicle = await Vehicle.findOne({ vehicleNo }, { routeHistorySyncedAt: 1 }).lean();
    if (!vehicle) {
      return res.status(404).json({ status: 'ERROR', message: 'Vehicle not found' });
    }
    return res.json({
      status: 'OK',
      vehicleNo,
      routeHistorySyncedAt: vehicle.routeHistorySyncedAt ?? null,
    });
  } catch (error) {
    console.error('[VehicleHistory API] sync-status error:', error.message);
    return res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /sync-cron/all — cron-job.org calls this once to sync ALL vehicles in parallel.
// Fetches vehicle list from DB, syncs last 2h of route history for each, returns per-vehicle results.
router.post('/sync-cron/all', cronSecretMiddleware, async (req, res) => {
  console.log('[VehicleHistory Cron] Bulk sync started for all vehicles');

  try {
    const Vehicle = require('../models/Vehicle');

    // Load all known vehicles from DB
    const vehicles = await Vehicle.find({}, { vehicleNo: 1, ouid: 1 }).lean();

    if (!vehicles.length) {
      console.warn('[VehicleHistory Cron] No vehicles found in DB');
      return res.status(200).json({ status: 'OK', message: 'No vehicles found', results: [] });
    }

    console.log(`[VehicleHistory Cron] Found ${vehicles.length} vehicles — syncing all`);

    // Get one shared TBTrack auth token for all vehicles
    const token = await getAuthToken();

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 2 * 60 * 60 * 1000); // last 2 hours

    const fetchWithTimeout = (promise, ms) => {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`TBTrack timed out after ${ms / 1000}s`)), ms)
      );
      return Promise.race([promise, timeout]);
    };

    // Sync all vehicles in parallel — each failure is isolated
    const results = await Promise.allSettled(
      vehicles.map(async ({ vehicleNo }) => {
        if (!vehicleNo) return { vehicleNo: '(unknown)', skipped: true };

        console.log(`[VehicleHistory Cron] Sync started for ${vehicleNo}`);
        try {
          const historyData = await fetchWithTimeout(
            fetchRouteHistory(token, { vehicleNo, startTime, endTime }),
            25000
          );

          const savedCount = await saveRouteHistory(historyData, vehicleNo, null);

          console.log(`[VehicleHistory Cron] Sync completed for ${vehicleNo} — saved ${savedCount} new records`);
          return { vehicleNo, received: historyData.length, savedCount, success: true };
        } catch (err) {
          console.error(`[VehicleHistory Cron] Sync failed for ${vehicleNo}: ${err.message}`);
          return { vehicleNo, success: false, error: err.message };
        }
      })
    );

    // Flatten allSettled results
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message }
    );

    const succeeded = summary.filter((r) => r.success).length;
    const failed = summary.filter((r) => !r.success && !r.skipped).length;

    console.log(`[VehicleHistory Cron] Bulk sync done — ${succeeded} succeeded, ${failed} failed`);

    return res.status(200).json({
      status: 'OK',
      total: vehicles.length,
      succeeded,
      failed,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      results: summary,
    });
  } catch (error) {
    console.error(`[VehicleHistory Cron] Bulk sync error: ${error.message}`);
    return res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /sync-cron/:vehicleNo — single vehicle cron sync (kept for backward compatibility)
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
