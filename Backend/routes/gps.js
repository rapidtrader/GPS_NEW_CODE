/**
 * GPS API routes for Sweeping Machine Live Tracking.
 *
 * Source:  vehicleroutehistories  (existing collection — read only)
 * Mapping: Machine.vehicleNumber = vehicleroutehistories.vehicleNo
 *
 * Endpoints:
 *   GET /api/gps/live?projectId=PRJ-001          → all machines live status
 *   GET /api/gps/live/:machineId                  → single machine live status
 *   GET /api/gps/history/:machineId?start=&end=   → GPS route history
 */

const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const Machine = require('../models/Machine');
const Project = require('../models/Project');
const {
  getLatestVehicleLocation,
  getVehicleRouteHistoryByRange,
  getLiveProjectMachines,
  shapeLiveRecord,
} = require('../services/gpsService');

const router = express.Router();

// ── GET /api/gps/live?projectId=PRJ-001 ───────────────────────────────────────
// Returns latest GPS status for all active machines of a project.

router.get('/live', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { projectId } = req.query;

    if (!projectId?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'projectId query param is required' });
    }

    // Get project (for sweepingSpeedLimit)
    const project = await Project.findOne({ projectId: projectId.trim() }).lean();
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
    }

    const sweepingSpeedLimit = project.settings?.sweepingSpeedLimit ?? null;

    // Get active machines for this project
    const activeMachines = await Machine.find({
      projectId: projectId.trim(),
      status: 'active',
    }).lean();

    const liveData = await getLiveProjectMachines(activeMachines, sweepingSpeedLimit);

    // ── Persist GPS snapshot into Machine.liveGps (fire-and-forget, non-blocking) ──
    // Runs in background so it never delays the API response.
    setImmediate(async () => {
      try {
        const bulkOps = liveData
          .filter((m) => m.gpsAvailable)
          .map((m) => ({
            updateOne: {
              filter: { machineId: m.machineId },
              update: {
                $set: {
                  liveGps: {
                    latitude:     m.latitude,
                    longitude:    m.longitude,
                    speed:        m.speed,
                    ignition:     m.ignition,
                    status:       m.status,
                    address:      m.address,
                    gpsTimestamp: m.timestamp,
                    gpsUpdatedAt: new Date(),
                    gpsAvailable: true,
                  },
                },
              },
            },
          }));

        if (bulkOps.length > 0) {
          await Machine.bulkWrite(bulkOps, { ordered: false });
        }
      } catch (err) {
        // Non-critical — log but never crash the request
        console.error('[GPS Live] Failed to persist liveGps to machines:', err.message);
      }
    });

    // Build summary counts
    const summary = {
      totalMachines:      liveData.length,
      gpsReporting:       liveData.filter((m) => m.gpsAvailable).length,
      ignitionOn:         liveData.filter((m) => m.ignition === true).length,
      ignitionOff:        liveData.filter((m) => m.ignition === false).length,
      ignitionUnknown:    liveData.filter((m) => m.ignition === null).length,
      notSweeping:        liveData.filter((m) => m.sweepingStatus === 'not_sweeping').length,
      sweepingUnknown:    liveData.filter((m) => m.sweepingStatus === 'unknown').length,
      sweepingSignalNote: 'No hardware sweeping signal available in current GPS data. sweepingStatus is derived from speed/ignition only.',
    };

    res.json({ status: 'OK', code: 200, summary, data: liveData });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── GET /api/gps/live/:machineId ──────────────────────────────────────────────
// Returns latest GPS status for a single machine.

router.get('/live/:machineId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { machineId } = req.params;

    const machine = await Machine.findOne({ machineId: machineId.trim() }).lean();
    if (!machine) {
      return res.status(404).json({ status: 'ERROR', message: `Machine "${machineId}" not found` });
    }

    // Get project for sweepingSpeedLimit
    const project = await Project.findOne({ projectId: machine.projectId }).lean();
    const sweepingSpeedLimit = project?.settings?.sweepingSpeedLimit ?? null;

    // Get latest GPS record and live address from Vehicle collection in parallel
    const Vehicle = require('../models/Vehicle');
    const [gpsDoc, vehicleDoc] = await Promise.all([
      getLatestVehicleLocation(machine.machineId),
      Vehicle.findOne({ vehicleNo: machine.machineId }, { address: 1 }).lean(),
    ]);
    const liveAddress = vehicleDoc?.address || null;

    if (!gpsDoc) {
      return res.json({
        status: 'OK',
        code: 200,
        data: {
          machineId:    machine.machineId,
          machineName:  machine.machineName,
          vehicleNumber: machine.vehicleNumber,
          projectId:    machine.projectId,
          latitude:     null, longitude: null, speed: null,
          ignition:     null, sweepingStatus: 'unknown',
          sweepingSignalAvailable: false,
          timestamp:    null,
          address:      liveAddress,
          gpsAvailable: false,
        },
      });
    }

    const liveStatus = {
      ...shapeLiveRecord(gpsDoc, machine, sweepingSpeedLimit),
      gpsAvailable: true,
      address: liveAddress, // Vehicle.address = same source as /map page
    };

    // Persist snapshot into Machine.liveGps (fire-and-forget)
    setImmediate(async () => {
      try {
        await Machine.updateOne(
          { machineId: machine.machineId },
          {
            $set: {
              liveGps: {
                latitude:     liveStatus.latitude,
                longitude:    liveStatus.longitude,
                speed:        liveStatus.speed,
                ignition:     liveStatus.ignition,
                status:       liveStatus.status,
                address:      liveStatus.address,
                gpsTimestamp: liveStatus.timestamp,
                gpsUpdatedAt: new Date(),
                gpsAvailable: true,
              },
            },
          }
        );
      } catch (err) {
        console.error('[GPS Live] Failed to persist liveGps (single):', err.message);
      }
    });

    res.json({ status: 'OK', code: 200, data: liveStatus });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── GET /api/gps/history/:machineId ──────────────────────────────────────────
// Query params: start (ISO string), end (ISO string)
// Returns GPS route history sorted ascending by event time (added).

router.get('/history/:machineId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { machineId } = req.params;
    const { start, end } = req.query;

    const machine = await Machine.findOne({ machineId: machineId.trim() }).lean();
    if (!machine) {
      return res.status(404).json({ status: 'ERROR', message: `Machine "${machineId}" not found` });
    }

    if (!start || !end) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'start and end query params are required (ISO date strings)',
      });
    }

    const startTime = new Date(start);
    const endTime   = new Date(end);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({ status: 'ERROR', message: 'Invalid start or end date format' });
    }

    const history = await getVehicleRouteHistoryByRange(
      machine.vehicleNumber,
      startTime,
      endTime
    );

    // Shape for frontend — only fields needed for map/table
    const shaped = history.map((doc) => ({
      latitude:   doc.latitude,
      longitude:  doc.longitude,
      speed:      doc.speed,
      timestamp:  doc.added,
      receivedAt: doc.actualReceived,
      status:     doc.status,
      address:    doc.address,
      distance:   doc.distance,
    }));

    res.json({
      status: 'OK',
      code: 200,
      data: shaped,
      meta: {
        machineId:     machine.machineId,
        vehicleNumber: machine.vehicleNumber,
        pointCount:    shaped.length,
        start:         startTime,
        end:           endTime,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
