const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const SweepingPlan = require('../models/SweepingPlan');
const Road        = require('../models/Road');
const Machine     = require('../models/Machine');
const Project     = require('../models/Project');
const {
  getScheduledRoads,
  assignRoadsToMachines,
  buildPlanDocs,
  buildSummary,
} = require('../services/sweepingPlanService');

const router = express.Router();

// ── Validate YYYY-MM-DD ───────────────────────────────────────────────────────
function isValidDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + 'T00:00:00Z');
  return !isNaN(d.getTime());
}

function isObjectId(str) {
  return /^[0-9a-fA-F]{24}$/.test(str);
}

function planFilter(id) {
  return { $or: [...(isObjectId(id) ? [{ _id: id }] : []), { _id: id }] };
}

// ── POST /api/sweeping-plans/generate ─────────────────────────────────────────
// Generate (or regenerate) the daily sweeping plan for a project + date.
// One document per machine. Uses upsert to avoid duplicates.

router.post('/generate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { projectId, planDate } = req.body;

    if (!projectId?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Project ID is required' });
    }
    if (!planDate || !isValidDate(planDate)) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'planDate is required and must be in YYYY-MM-DD format',
      });
    }

    // Project must exist
    const project = await Project.findOne({ projectId: projectId.trim() }).lean();
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
    }

    // Get active roads and machines in parallel
    const [activeRoads, activeMachines] = await Promise.all([
      Road.find({ projectId: projectId.trim(), status: 'active' }).lean(),
      Machine.find({ projectId: projectId.trim(), status: 'active' }).lean(),
    ]);

    if (activeRoads.length === 0) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'No active roads found for this project',
      });
    }
    if (activeMachines.length === 0) {
      return res.status(400).json({
        status: 'ERROR',
        message: 'No active machines found for this project',
      });
    }

    // Determine which roads are scheduled on this date
    const scheduledRoads = getScheduledRoads(activeRoads, planDate);

    if (scheduledRoads.length === 0) {
      return res.json({
        status: 'OK',
        code: 200,
        message: 'No roads are scheduled for this date',
        summary: {
          scheduledRoads: 0,
          assignedRoads: 0,
          unassignedRoads: 0,
          totalPlannedKm: 0,
          machinesUsed: 0,
          capacityExceededMachines: 0,
        },
        plans: [],
      });
    }

    // Assign roads to machines
    const machineState = assignRoadsToMachines(scheduledRoads, activeMachines);

    // Build plan documents
    const planDocs = buildPlanDocs(projectId.trim(), planDate, machineState);

    // Upsert — prevents duplicates, allows regeneration
    const savedPlans = [];
    for (const doc of planDocs) {
      const saved = await SweepingPlan.findOneAndUpdate(
        { projectId: doc.projectId, planDate: doc.planDate, machineId: doc.machineId },
        {
          $set: {
            machineName:      doc.machineName,
            vehicleNumber:    doc.vehicleNumber,
            capacityKm:       doc.capacityKm,
            totalPlannedKm:   doc.totalPlannedKm,
            capacityExceeded: doc.capacityExceeded,
            roads:            doc.roads,
            status:           'planned',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      savedPlans.push(saved);
    }

    const summary = buildSummary(scheduledRoads, machineState, planDocs);

    res.json({
      status: 'OK',
      code: 200,
      message: 'Daily sweeping plan generated successfully',
      summary,
      plans: savedPlans,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'ERROR',
        message: 'A plan already exists for this project/date/machine combination',
      });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── GET /api/sweeping-plans ───────────────────────────────────────────────────
// Query: projectId (required), planDate (optional), machineId (optional)

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { projectId, planDate, machineId, status } = req.query;

    if (!projectId?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'projectId query param is required' });
    }

    const query = { projectId: projectId.trim() };
    if (planDate)   query.planDate   = planDate.trim();
    if (machineId)  query.machineId  = machineId.trim();
    if (status)     query.status     = status.trim();

    const plans = await SweepingPlan.find(query).sort({ planDate: -1, machineId: 1 }).lean();
    res.json({ status: 'OK', code: 200, data: plans });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── GET /api/sweeping-plans/:id ───────────────────────────────────────────────

router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: 'ERROR', message: 'Invalid plan ID' });
    }
    const plan = await SweepingPlan.findById(req.params.id).lean();
    if (!plan) return res.status(404).json({ status: 'ERROR', message: 'Plan not found' });
    res.json({ status: 'OK', code: 200, data: plan });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── PUT /api/sweeping-plans/:id ───────────────────────────────────────────────
// Manual edit: update roads array (reorder, remove, add) and status.
// NEVER modifies road GPS points — only Machine Daily Road Sequence.

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: 'ERROR', message: 'Invalid plan ID' });
    }

    const plan = await SweepingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ status: 'ERROR', message: 'Plan not found' });

    const { roads, status } = req.body;

    if (roads !== undefined) {
      // Validate and reorder sequences
      if (!Array.isArray(roads)) {
        return res.status(400).json({ status: 'ERROR', message: 'roads must be an array' });
      }
      // Check for duplicate roadIds
      const roadIds = roads.map((r) => r.roadId);
      if (new Set(roadIds).size !== roadIds.length) {
        return res.status(400).json({
          status: 'ERROR',
          message: 'Duplicate roadId found in roads array',
        });
      }
      // Enforce sequence = index + 1 (always clean 1,2,3...)
      const resequenced = roads.map((r, idx) => ({
        roadId:     r.roadId,
        roadName:   r.roadName   || '',
        areaName:   r.areaName   || '',
        colonyName: r.colonyName || '',
        sequence:   idx + 1,
        plannedKm:  Number(r.plannedKm) || 0,
      }));
      plan.roads = resequenced;
      // Recalculate totals
      plan.totalPlannedKm = Math.round(
        resequenced.reduce((s, r) => s + r.plannedKm, 0) * 1000
      ) / 1000;
      plan.capacityExceeded = plan.totalPlannedKm > plan.capacityKm + 0.001;
    }

    if (status !== undefined) {
      const validStatuses = ['planned', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ status: 'ERROR', message: 'Invalid status value' });
      }
      plan.status = status;
    }

    await plan.save();
    res.json({ status: 'OK', code: 200, data: plan, message: 'Plan updated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── DELETE /api/sweeping-plans/:id ────────────────────────────────────────────
// Soft delete — set status to cancelled

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ status: 'ERROR', message: 'Invalid plan ID' });
    }
    const plan = await SweepingPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ status: 'ERROR', message: 'Plan not found' });

    plan.status = 'cancelled';
    await plan.save();
    res.json({ status: 'OK', code: 200, message: 'Plan cancelled successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
