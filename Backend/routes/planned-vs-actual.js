/**
 * planned-vs-actual.js
 *
 * GET /api/planned-vs-actual
 * Query: projectId (required), date (required YYYY-MM-DD), machineId (optional)
 *
 * Flow:
 *   1. Validate inputs + load Project
 *   2. Load SweepingPlan(s) for project+date [+optional machine]
 *   3. Load Machine docs for those plans
 *   4. Load Road master data for all planned roads (with gpsPoints)
 *   5. Load GPS history from vehicleroutehistories for each vehicle+date
 *   6. Run calculatePlannedVsActual per machine
 *   7. Aggregate project-level summary
 *   8. Return structured response
 */

const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const SweepingPlan = require('../models/SweepingPlan');
const Machine      = require('../models/Machine');
const Road         = require('../models/Road');
const Project      = require('../models/Project');
const { getVehicleRouteHistoryByRange } = require('../services/gpsService');
const {
  calculatePlannedVsActual,
  planDateToUtcRange,
  DEFAULT_TOLERANCE_METERS,
} = require('../services/plannedVsActualService');

const router = express.Router();

function isValidDate(str) {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(new Date(str + 'T00:00:00Z').getTime());
}

// ── GET /api/planned-vs-actual ────────────────────────────────────────────────

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { projectId, date, machineId } = req.query;

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!projectId?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'projectId query param is required' });
    }
    if (!date || !isValidDate(date)) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'date query param is required (format: YYYY-MM-DD)',
      });
    }

    // ── Load Project ─────────────────────────────────────────────────────────
    const project = await Project.findOne({ projectId: projectId.trim() }).lean();
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
    }

    // ── Load Plans ───────────────────────────────────────────────────────────
    const planQuery = { projectId: projectId.trim(), planDate: date };
    if (machineId?.trim()) planQuery.machineId = machineId.trim();
    // Only non-cancelled plans
    planQuery.status = { $ne: 'cancelled' };

    const plans = await SweepingPlan.find(planQuery).lean();

    if (plans.length === 0) {
      return res.json({
        status: 'OK',
        code: 200,
        data: {
          projectId: projectId.trim(),
          date,
          message: 'No active daily sweeping plan found for this project and date.',
          summary: null,
          machines: [],
        },
      });
    }

    // ── Load Machines for these plans ────────────────────────────────────────
    const machineIds = [...new Set(plans.map((p) => p.machineId))];
    const machines   = await Machine.find({ machineId: { $in: machineIds } }).lean();
    const machineMap = new Map(machines.map((m) => [m.machineId, m]));

    // ── Load Road master data (with gpsPoints) ───────────────────────────────
    const allRoadIds = [...new Set(plans.flatMap((p) => p.roads.map((r) => r.roadId)))];
    const roads = await Road.find({ roadId: { $in: allRoadIds } })
      .select('roadId roadName areaName colonyName totalLength gpsPoints routeGeometry status')
      .lean();
    const roadMap = new Map(roads.map((r) => [r.roadId, r]));

    // ── Load GPS history per vehicle (one query per vehicle) ─────────────────
    const { startUtc, endUtc } = planDateToUtcRange(date);
    // GPS history is stored by machineId (vehicleNo field), NOT by vehicleNumber (registration plate)

    const gpsDataMap = new Map(); // machineId → GPS docs
    await Promise.all(
      machineIds.map(async (mid) => {
        const docs = await getVehicleRouteHistoryByRange(mid, startUtc, endUtc);
        gpsDataMap.set(mid, docs);
      })
    );

    // ── Calculate per machine ────────────────────────────────────────────────
    const machineResults = [];

    for (const plan of plans) {
      const machine = machineMap.get(plan.machineId);
      if (!machine) {
        machineResults.push({
          machineId:   plan.machineId,
          machineName: plan.machineName || plan.machineId,
          error:       'Machine not found in master data',
          roads:       [],
        });
        continue;
      }

      // Use machineId (not vehicleNumber) to look up GPS data
      const rawGpsDocs = gpsDataMap.get(machine.machineId) || [];

      const result = calculatePlannedVsActual(
        plan, machine, project, roadMap, rawGpsDocs,
        { toleranceMeters: DEFAULT_TOLERANCE_METERS }
      );
      machineResults.push(result);
    }

    // ── Project-level summary ─────────────────────────────────────────────────
    const summary = {
      projectId:    projectId.trim(),
      projectName:  project.projectName,
      date,
      totalMachines:       machineResults.length,
      totalPlannedKm:      round3(machineResults.reduce((s, m) => s + (m.totalPlannedKm  || 0), 0)),
      totalActualKm:       round3(machineResults.reduce((s, m) => s + (m.totalActualKm   || 0), 0)),
      totalMissedKm:       round3(machineResults.reduce((s, m) => s + (m.totalMissedKm   || 0), 0)),
      completedRoads:      machineResults.reduce((s, m) => s + (m.completedRoads          || 0), 0),
      partiallyCompletedRoads: machineResults.reduce((s, m) => s + (m.partiallyCompletedRoads || 0), 0),
      notCompletedRoads:   machineResults.reduce((s, m) => s + (m.notCompletedRoads       || 0), 0),
      sweepingSignalAvailable: false,
    };
    summary.overallCoveragePercent = summary.totalPlannedKm > 0
      ? Math.min(Math.round((summary.totalActualKm / summary.totalPlannedKm) * 10000) / 100, 100)
      : 0;

    res.json({
      status: 'OK',
      code:   200,
      data: {
        summary,
        machines: machineResults,
      },
    });
  } catch (error) {
    console.error('[PlannedVsActual]', error.message);
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

function round3(n) { return Math.round(n * 1000) / 1000; }

module.exports = router;
