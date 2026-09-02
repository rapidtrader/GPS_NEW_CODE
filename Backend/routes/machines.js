const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const Machine = require('../models/Machine');
const Project = require('../models/Project');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function validateWorkingHours(wh) {
  if (!wh || typeof wh !== 'object') return 'Working hours are required';
  if (!wh.start || !TIME_RE.test(wh.start)) return 'Working hours start must be in HH:MM format (e.g. 08:00)';
  if (!wh.end   || !TIME_RE.test(wh.end))   return 'Working hours end must be in HH:MM format (e.g. 17:00)';
  if (timeToMinutes(wh.end) <= timeToMinutes(wh.start)) {
    return 'Working hours end time must be after start time';
  }
  return null;
}

function isObjectId(str) {
  return /^[0-9a-fA-F]{24}$/.test(str);
}

function machineFilter(id) {
  return {
    $or: [
      ...(isObjectId(id) ? [{ _id: id }] : []),
      { machineId: id },
    ],
  };
}

// ── GET /api/machines ─────────────────────────────────────────────────────────
// Query params: projectId, status

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const query = {};
    if (req.query.projectId) query.projectId = req.query.projectId.trim();
    if (req.query.status)    query.status    = req.query.status.trim();

    const machines = await Machine.find(query).sort({ createdAt: -1 }).lean();
    res.json({ status: 'OK', code: 200, data: machines });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── GET /api/machines/:id ─────────────────────────────────────────────────────

router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const machine = await Machine.findOne(machineFilter(req.params.id)).lean();
    if (!machine) return res.status(404).json({ status: 'ERROR', message: 'Machine not found' });
    res.json({ status: 'OK', code: 200, data: machine });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── POST /api/machines ────────────────────────────────────────────────────────

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      machineId, vehicleNumber, machineName,
      projectId, sweepingKmPerDay, workingHours, status,
    } = req.body;

    // Required field validation
    if (!machineId?.trim())      return res.status(400).json({ status: 'ERROR', message: 'Machine ID is required' });
    if (!vehicleNumber?.trim())  return res.status(400).json({ status: 'ERROR', message: 'Vehicle number is required' });
    if (!machineName?.trim())    return res.status(400).json({ status: 'ERROR', message: 'Machine name is required' });
    if (!projectId?.trim())      return res.status(400).json({ status: 'ERROR', message: 'Project ID is required' });

    const kmPerDay = Number(sweepingKmPerDay);
    if (!sweepingKmPerDay || isNaN(kmPerDay) || kmPerDay <= 0) {
      return res.status(400).json({ status: 'ERROR', message: 'Sweeping KM per day must be a number greater than 0' });
    }

    const whErr = validateWorkingHours(workingHours);
    if (whErr) return res.status(400).json({ status: 'ERROR', message: whErr });

    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
    }

    // Project existence check
    const project = await Project.findOne({ projectId: projectId.trim() }).lean();
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
    }

    // Duplicate machineId check
    const existingId = await Machine.findOne({ machineId: machineId.trim() }).lean();
    if (existingId) {
      return res.status(409).json({ status: 'ERROR', message: 'Machine ID already exists' });
    }

    // Duplicate vehicleNumber per project check
    const existingVehicle = await Machine.findOne({
      projectId: projectId.trim(),
      vehicleNumber: vehicleNumber.trim(),
    }).lean();
    if (existingVehicle) {
      return res.status(409).json({ status: 'ERROR', message: 'Vehicle number already exists in this project' });
    }

    const machine = new Machine({
      machineId:       machineId.trim(),
      vehicleNumber:   vehicleNumber.trim(),
      machineName:     machineName.trim(),
      projectId:       projectId.trim(),
      sweepingKmPerDay: kmPerDay,
      workingHours: {
        start: workingHours.start.trim(),
        end:   workingHours.end.trim(),
      },
      status: status || 'active',
    });

    await machine.save();
    res.status(201).json({ status: 'OK', code: 201, data: machine, message: 'Machine created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      const key = Object.keys(error.keyPattern || {})[0] || '';
      if (key.includes('vehicleNumber')) {
        return res.status(409).json({ status: 'ERROR', message: 'Vehicle number already exists in this project' });
      }
      return res.status(409).json({ status: 'ERROR', message: 'Machine ID already exists' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── PUT /api/machines/:id ─────────────────────────────────────────────────────

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      vehicleNumber, machineName, projectId,
      sweepingKmPerDay, workingHours, status,
    } = req.body;

    const machine = await Machine.findOne(machineFilter(req.params.id));
    if (!machine) return res.status(404).json({ status: 'ERROR', message: 'Machine not found' });

    // Apply validated updates
    if (vehicleNumber !== undefined) {
      if (!String(vehicleNumber).trim()) {
        return res.status(400).json({ status: 'ERROR', message: 'Vehicle number cannot be empty' });
      }
      // Duplicate vehicle number per project check (excluding self)
      const dup = await Machine.findOne({
        projectId: projectId?.trim() || machine.projectId,
        vehicleNumber: String(vehicleNumber).trim(),
        _id: { $ne: machine._id },
      }).lean();
      if (dup) {
        return res.status(409).json({ status: 'ERROR', message: 'Vehicle number already exists in this project' });
      }
      machine.vehicleNumber = String(vehicleNumber).trim();
    }

    if (machineName !== undefined) {
      if (!String(machineName).trim()) {
        return res.status(400).json({ status: 'ERROR', message: 'Machine name cannot be empty' });
      }
      machine.machineName = String(machineName).trim();
    }

    if (projectId !== undefined) {
      if (!String(projectId).trim()) {
        return res.status(400).json({ status: 'ERROR', message: 'Project ID cannot be empty' });
      }
      const project = await Project.findOne({ projectId: String(projectId).trim() }).lean();
      if (!project) {
        return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
      }
      machine.projectId = String(projectId).trim();
    }

    if (sweepingKmPerDay !== undefined) {
      const km = Number(sweepingKmPerDay);
      if (isNaN(km) || km <= 0) {
        return res.status(400).json({ status: 'ERROR', message: 'Sweeping KM per day must be greater than 0' });
      }
      machine.sweepingKmPerDay = km;
    }

    if (workingHours !== undefined) {
      const whErr = validateWorkingHours(workingHours);
      if (whErr) return res.status(400).json({ status: 'ERROR', message: whErr });
      machine.workingHours = {
        start: workingHours.start.trim(),
        end:   workingHours.end.trim(),
      };
    }

    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
      }
      machine.status = status;
    }

    await machine.save();
    res.json({ status: 'OK', code: 200, data: machine, message: 'Machine updated successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'ERROR', message: 'Vehicle number already exists in this project' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ── DELETE /api/machines/:id ──────────────────────────────────────────────────
// Soft delete — status = inactive (future SweepingPlans will reference machineId)

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const machine = await Machine.findOne(machineFilter(req.params.id));
    if (!machine) return res.status(404).json({ status: 'ERROR', message: 'Machine not found' });

    machine.status = 'inactive';
    await machine.save();

    res.json({ status: 'OK', code: 200, message: 'Machine deactivated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
