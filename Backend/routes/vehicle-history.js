const express = require('express');
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

module.exports = router;
