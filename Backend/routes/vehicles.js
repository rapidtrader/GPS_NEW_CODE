const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { requireModule, requireAnyModule } = require('../middleware/access');
const Vehicle = require('../models/Vehicle');
const { fetchVehicleList, fetchVehicleInfo, fetchVehicleDetailList } = require('../services/tbtrack');
const {
  saveVehicles,
  getVehiclesForUser,
  getVehicleOptions,
  filterVehiclesByAccess,
} = require('../services/vehicleStore');
const {
  mergeWithVehicleInfo,
  filterDetailsByAccess,
  saveVehicleDetails,
  getSavedVehicleDetails,
} = require('../services/vehicleDetailStore');

const router = express.Router();

router.get('/numbers', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const rows = await Vehicle.find({}, 'vehicleNo').sort({ vehicleNo: 1 }).lean();
    const numbers = [...new Set(rows.map((row) => row.vehicleNo).filter(Boolean))];
    res.json({ status: 'OK', code: 200, data: numbers, source: 'database' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/options', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const options = await getVehicleOptions();
    res.json({ status: 'OK', code: 200, data: options, source: 'database' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/', authMiddleware, adminMiddleware, requireModule('liveVehicles'), async (req, res) => {
  try {
    const vehicles = await fetchVehicleList();

    if (req.user.role === 'admin') {
      await saveVehicles(vehicles);
    }

    const filtered = filterVehiclesByAccess(vehicles, req.user);
    res.json({ status: 'OK', code: 200, data: filtered, source: 'live' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/saved', authMiddleware, requireAnyModule('savedVehicles', 'dashboard', 'map'), async (req, res) => {
  try {
    const vehicles = await getVehiclesForUser(req.user);
    res.json({ status: 'OK', code: 200, data: vehicles, source: 'database' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/details', authMiddleware, requireModule('vehicleDetails'), async (req, res) => {
  try {
    const [details, info] = await Promise.all([
      fetchVehicleDetailList(),
      fetchVehicleInfo(),
    ]);

    const merged = mergeWithVehicleInfo(details, info);
    const filtered = filterDetailsByAccess(merged, req.user);

    if (req.user.role === 'admin') {
      await saveVehicleDetails(merged);
    } else if (filtered.length > 0) {
      await saveVehicleDetails(filtered);
    }

    res.json({ status: 'OK', code: 200, data: filtered, source: 'live', saved: true });
  } catch (error) {
    try {
      const saved = await getSavedVehicleDetails(req.user);
      if (saved.length > 0) {
        return res.json({ status: 'OK', code: 200, data: saved, source: 'database', saved: true });
      }
    } catch {
      // fall through
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
