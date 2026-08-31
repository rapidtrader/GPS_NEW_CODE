const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireModule, requireAnyModule } = require('../middleware/access');
const { fetchVehicleInfo, fetchAnalyticsDashboard } = require('../services/tbtrack');
const {
  saveAnalyticsDashboard,
  getSavedAnalyticsDashboard,
  saveVehicleInfo,
  getSavedVehicleInfo,
  listReportsForUser,
  getReportById,
  getLatestReport,
} = require('../services/analyticsStore');

const router = express.Router();

function filterVehicleInfoForUser(infoMap, user) {
  if (!infoMap || typeof infoMap !== 'object') return {};
  if (user.role === 'admin') return infoMap;

  const allowed = new Set(user.vehicleAccess || []);
  return Object.fromEntries(
    Object.entries(infoMap).filter(
      ([ouid, info]) =>
        allowed.has(ouid) || allowed.has(info?.vehicleNo)
    )
  );
}

async function resolveOuids(user, filtered, { ouid = '', bodyOuids = [] }) {
  const accessibleOuids = Object.keys(filtered);

  if (accessibleOuids.length === 0) {
    const err = new Error('No vehicles available for analytics');
    err.statusCode = 400;
    throw err;
  }

  if (Array.isArray(bodyOuids) && bodyOuids.length > 0) {
    const ouids = bodyOuids.filter((id) => filtered[id]);
    if (ouids.length === 0) {
      const err = new Error('You do not have access to the selected vehicles');
      err.statusCode = 403;
      throw err;
    }
    return ouids;
  }

  if (ouid) {
    if (!filtered[ouid]) {
      const err = new Error('You do not have access to this vehicle');
      err.statusCode = 403;
      throw err;
    }
    return [ouid];
  }

  return accessibleOuids;
}

router.get('/vehicle-info', authMiddleware, requireAnyModule('analytics', 'dashboard'), async (req, res) => {
  try {
    const info = await fetchVehicleInfo();
    await saveVehicleInfo(info);
    const filtered = filterVehicleInfoForUser(info, req.user);
    res.json({ status: 'OK', code: 200, data: filtered, source: 'live', saved: true });
  } catch (error) {
    try {
      const saved = await getSavedVehicleInfo(req.user, filterVehicleInfoForUser);
      if (Object.keys(saved).length > 0) {
        return res.json({ status: 'OK', code: 200, data: saved, source: 'database', saved: true });
      }
    } catch {
      // fall through to original error
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/reports', authMiddleware, requireModule('reports'), async (req, res) => {
  try {
    const snapshotId = req.query.snapshotId || '';
    const { snapshots, vehicles } = await listReportsForUser(req.user, filterVehicleInfoForUser);

    let report = null;
    if (snapshotId) {
      report = await getReportById(snapshotId, req.user, filterVehicleInfoForUser);
    } else {
      report = await getLatestReport(req.user, filterVehicleInfoForUser);
    }

    res.json({
      status: 'OK',
      code: 200,
      data: { snapshots, vehicles, report },
      source: 'database',
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/saved', authMiddleware, requireAnyModule('analytics', 'dashboard'), async (req, res) => {
  try {
    const startTime = Number(req.query.startTime);
    const endTime = Number(req.query.endTime);
    const ouid = req.query.ouid || '';

    if (!startTime || !endTime) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'startTime and endTime query params are required',
      });
    }

    const info = await getSavedVehicleInfo(req.user, filterVehicleInfoForUser);
    const filtered = filterVehicleInfoForUser(info, req.user);
    const ouids = await resolveOuids(req.user, filtered, {
      ouid,
      bodyOuids: req.query.ouids ? String(req.query.ouids).split(',') : [],
    });

    const data = await getSavedAnalyticsDashboard({ startTime, endTime, ouids });
    if (!data) {
      return res.status(404).json({
        status: 'ERROR',
        message: 'No saved analytics data for this range',
      });
    }

    res.json({ status: 'OK', code: 200, data, source: 'database', saved: true });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

router.post('/dashboard', authMiddleware, requireAnyModule('analytics', 'dashboard'), async (req, res) => {
  try {
    const { startTime, endTime, ouid = '', ouids: bodyOuids } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'startTime and endTime are required',
      });
    }

    const info = await fetchVehicleInfo();
    await saveVehicleInfo(info);
    const filtered = filterVehicleInfoForUser(info, req.user);
    const ouids = await resolveOuids(req.user, filtered, { ouid, bodyOuids });

    const data = await fetchAnalyticsDashboard({ startTime, endTime, ouids });
    await saveAnalyticsDashboard({
      startTime,
      endTime,
      ouids,
      ouid,
      data,
      userId: req.user._id,
    });

    res.json({ status: 'OK', code: 200, data, source: 'live', saved: true });
  } catch (error) {
    try {
      const { startTime, endTime, ouid = '', ouids: bodyOuids } = req.body;
      const savedInfo = await getSavedVehicleInfo(req.user, filterVehicleInfoForUser);
      const filtered = filterVehicleInfoForUser(savedInfo, req.user);
      const ouids = await resolveOuids(req.user, filtered, { ouid, bodyOuids });
      const data = await getSavedAnalyticsDashboard({ startTime, endTime, ouids });
      if (data) {
        return res.json({ status: 'OK', code: 200, data, source: 'database', saved: true });
      }
    } catch {
      // fall through to original error
    }

    const status = error.statusCode || 500;
    res.status(status).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
