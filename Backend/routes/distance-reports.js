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
    const { startTime, endTime } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'startTime and endTime are required',
      });
    }

    // Get user's vehicles
    const vehicles = await getVehiclesForUser(req.user);
    const vehicleNos = vehicles.map((v) => v.vehicleNo).filter(Boolean);

    if (vehicleNos.length === 0) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'No vehicles available',
      });
    }

    // Get auth token
    const token = await getAuthToken();

    // Fetch from TBTrack
    const reportData = await fetchDistanceReport(token, {
      startTime,
      endTime,
      ouids: vehicleNos,
    });

    // Save to database
    const savedCount = await saveDistanceReport(reportData, req.user._id);

    res.json({
      status: 'OK',
      code: 200,
      data: reportData,
      savedCount,
      source: 'live',
      saved: true,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
