const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireModule } = require('../middleware/access');
const {
  fetchDistanceReport,
  saveDistanceReport,
  getDistanceReports,
  getDistanceReportByDate,
} = require('../services/distanceReportStore');
const { getVehiclesForUser } = require('../services/vehicleStore');
const { getAuthToken } = require('../services/tbtrack');

const router = express.Router();

// GET all distance reports with optional date filter
router.get('/', authMiddleware, requireModule('distanceReports'), async (req, res) => {
  try {
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';

    const reports = await getDistanceReportByDate(req.user, startDate, endDate);

    res.json({
      status: 'OK',
      code: 200,
      data: reports,
      source: 'database',
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

// POST to fetch fresh distance report from TBTrack and save
router.post('/sync', authMiddleware, requireModule('distanceReports'), async (req, res) => {
  try {
    console.log('[DistanceReports API] /sync endpoint called');
    const { startTime, endTime } = req.body;

    console.log(`[DistanceReports API] Request body: startTime=${startTime}, endTime=${endTime}`);

    if (!startTime || !endTime) {
      console.warn('[DistanceReports API] Missing startTime or endTime');
      return res.status(400).json({
        status: 'ERROR',
        message: 'startTime and endTime are required',
      });
    }

    // Get user's vehicles
    const vehicles = await getVehiclesForUser(req.user);
    const ouids = vehicles.map((v) => v.ouid).filter(Boolean);

    console.log(`[DistanceReports API] Found ${ouids.length} vehicles for user`);
    console.log(`[DistanceReports API] OUIDs: ${JSON.stringify(ouids)}`);

    if (ouids.length === 0) {
      console.warn('[DistanceReports API] No vehicles available for user');
      return res.status(400).json({
        status: 'ERROR',
        message: 'No vehicles available',
      });
    }

    // Get auth token
    console.log('[DistanceReports API] Getting auth token...');
    const token = await getAuthToken();

    // Fetch from TBTrack
    console.log('[DistanceReports API] Fetching distance report from TBTrack...');
    const reportData = await fetchDistanceReport(token, {
      startTime,
      endTime,
      ouids,
    });

    console.log(`[DistanceReports API] Received ${reportData.length} reports from TBTrack`);

    // Save to database
    const savedCount = await saveDistanceReport(reportData, req.user._id);

    console.log(`[DistanceReports API] Saved ${savedCount} reports to database`);

    res.json({
      status: 'OK',
      code: 200,
      data: reportData,
      savedCount,
      source: 'live',
      saved: true,
    });
  } catch (error) {
    console.error('[DistanceReports API] Error:', error.message);
    console.error('[DistanceReports API] Stack:', error.stack);
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
