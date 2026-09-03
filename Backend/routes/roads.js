const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const Road = require('../models/Road');
const Project = require('../models/Project');

const router = express.Router();

const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const VALID_FREQ_TYPES = ['daily', 'alternate', 'specific'];
const VALID_POINT_TYPES = ['start', 'turn', 'end'];

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateCoordinates(coords) {
  if (!Array.isArray(coords) || coords.length !== 2) return 'coordinates must be [longitude, latitude]';
  const [lng, lat] = coords;
  if (typeof lng !== 'number' || lng < -180 || lng > 180) return 'longitude must be between -180 and 180';
  if (typeof lat !== 'number' || lat < -90  || lat > 90)  return 'latitude must be between -90 and 90';
  return null;
}

function validateGpsPoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 'At least 2 GPS points are required';
  }
  const seqs = points.map((p) => p.sequence);
  const uniqueSeqs = new Set(seqs);
  if (uniqueSeqs.size !== seqs.length) return 'GPS point sequences must be unique';

  for (const p of points) {
    if (!Number.isInteger(p.sequence) || p.sequence < 1) {
      return `Invalid sequence value: ${p.sequence}`;
    }
    if (!VALID_POINT_TYPES.includes(p.type)) {
      return `Invalid point type "${p.type}". Must be: start, turn, end`;
    }
    const coordErr = validateCoordinates(p.coordinates);
    if (coordErr) return `Point ${p.sequence}: ${coordErr}`;
  }
  return null;
}

function validateFrequency(freq) {
  if (!freq || !VALID_FREQ_TYPES.includes(freq.type)) {
    return 'sweepingFrequency.type must be daily, alternate, or specific';
  }
  if (freq.type === 'specific') {
    if (!Array.isArray(freq.days) || freq.days.length === 0) {
      return 'specific frequency requires at least one day';
    }
    const invalid = freq.days.filter((d) => !VALID_DAYS.includes(d));
    if (invalid.length) return `Invalid day(s): ${invalid.join(', ')}`;
  }
  return null;
}

function buildRouteGeometry(gpsPoints) {
  const sorted = [...gpsPoints].sort((a, b) => a.sequence - b.sequence);
  return {
    type: 'LineString',
    coordinates: sorted.map((p) => p.coordinates),
  };
}

function isObjectId(str) {
  return /^[0-9a-fA-F]{24}$/.test(str);
}

function roadFilter(id) {
  return {
    $or: [
      ...(isObjectId(id) ? [{ _id: id }] : []),
      { roadId: id },
    ],
  };
}

// ─── GET /api/roads ───────────────────────────────────────────────────────────
// Query params: projectId, status, areaName, colonyName, frequency

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const query = {};
    if (req.query.projectId) query.projectId = req.query.projectId.trim();
    if (req.query.status)    query.status    = req.query.status.trim();
    if (req.query.areaName)  query.areaName  = new RegExp(req.query.areaName.trim(), 'i');
    if (req.query.colonyName) query.colonyName = new RegExp(req.query.colonyName.trim(), 'i');
    if (req.query.frequency) query['sweepingFrequency.type'] = req.query.frequency.trim();

    const roads = await Road.find(query)
      .select('-gpsPoints -routeGeometry')   // list view mein heavy fields skip
      .sort({ createdAt: -1 })
      .lean();

    res.json({ status: 'OK', code: 200, data: roads });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ─── GET /api/roads/:id ───────────────────────────────────────────────────────

router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const road = await Road.findOne(roadFilter(req.params.id)).lean();
    if (!road) return res.status(404).json({ status: 'ERROR', message: 'Road not found' });
    res.json({ status: 'OK', code: 200, data: road });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ─── POST /api/roads ──────────────────────────────────────────────────────────

router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      projectId, roadId, areaName, colonyName, roadName,
      totalLength, sweepingFrequency, status, gpsPoints, assignedMachineId,
    } = req.body;

    // Required field checks
    if (!projectId?.trim()) return res.status(400).json({ status: 'ERROR', message: 'Project ID is required' });
    if (!roadId?.trim())    return res.status(400).json({ status: 'ERROR', message: 'Road ID is required' });
    if (!areaName?.trim())  return res.status(400).json({ status: 'ERROR', message: 'Area name is required' });
    if (!colonyName?.trim()) return res.status(400).json({ status: 'ERROR', message: 'Colony name is required' });
    if (!roadName?.trim())  return res.status(400).json({ status: 'ERROR', message: 'Road name is required' });

    const length = Number(totalLength);
    if (isNaN(length) || length <= 0) {
      return res.status(400).json({ status: 'ERROR', message: 'Total length must be a number greater than 0' });
    }

    if (!assignedMachineId?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Assigned machine is required' });
    }

    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
    }

    const freqErr = validateFrequency(sweepingFrequency);
    if (freqErr) return res.status(400).json({ status: 'ERROR', message: freqErr });

    const ptsErr = validateGpsPoints(gpsPoints);
    if (ptsErr) return res.status(400).json({ status: 'ERROR', message: ptsErr });

    // Project existence check
    const project = await Project.findOne({ projectId: projectId.trim() }).lean();
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
    }

    // Duplicate Road ID check
    const existing = await Road.findOne({ roadId: roadId.trim() }).lean();
    if (existing) {
      return res.status(409).json({ status: 'ERROR', message: 'Road ID already exists' });
    }

    const routeGeometry = buildRouteGeometry(gpsPoints);

    const road = new Road({
      projectId: projectId.trim(),
      roadId: roadId.trim(),
      areaName: areaName.trim(),
      colonyName: colonyName.trim(),
      roadName: roadName.trim(),
      totalLength: length,
      assignedMachineId: assignedMachineId.trim(),
      sweepingFrequency: {
        type: sweepingFrequency.type,
        startDate: sweepingFrequency.startDate || null,
        days: sweepingFrequency.days || [],
      },
      status: status || 'active',
      gpsPoints,
      routeGeometry,
    });

    await road.save();
    res.status(201).json({ status: 'OK', code: 201, data: road, message: 'Road created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'ERROR', message: 'Road ID already exists' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ─── PUT /api/roads/:id ───────────────────────────────────────────────────────

router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const {
      projectId, areaName, colonyName, roadName, totalLength,
      sweepingFrequency, status, gpsPoints, assignedMachineId,
    } = req.body;

    const road = await Road.findOne(roadFilter(req.params.id));
    if (!road) return res.status(404).json({ status: 'ERROR', message: 'Road not found' });

    // Validate and apply each field if provided
    if (projectId !== undefined) {
      if (!String(projectId).trim()) return res.status(400).json({ status: 'ERROR', message: 'Project ID cannot be empty' });
      const project = await Project.findOne({ projectId: String(projectId).trim() }).lean();
      if (!project) return res.status(404).json({ status: 'ERROR', message: `Project "${projectId}" not found` });
      road.projectId = String(projectId).trim();
    }
    if (areaName !== undefined) {
      if (!String(areaName).trim()) return res.status(400).json({ status: 'ERROR', message: 'Area name cannot be empty' });
      road.areaName = String(areaName).trim();
    }
    if (colonyName !== undefined) {
      if (!String(colonyName).trim()) return res.status(400).json({ status: 'ERROR', message: 'Colony name cannot be empty' });
      road.colonyName = String(colonyName).trim();
    }
    if (roadName !== undefined) {
      if (!String(roadName).trim()) return res.status(400).json({ status: 'ERROR', message: 'Road name cannot be empty' });
      road.roadName = String(roadName).trim();
    }
    if (totalLength !== undefined) {
      const length = Number(totalLength);
      if (isNaN(length) || length <= 0) {
        return res.status(400).json({ status: 'ERROR', message: 'Total length must be a number greater than 0' });
      }
      road.totalLength = length;
    }
    if (status !== undefined) {
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
      }
      road.status = status;
    }
    if (sweepingFrequency !== undefined) {
      const freqErr = validateFrequency(sweepingFrequency);
      if (freqErr) return res.status(400).json({ status: 'ERROR', message: freqErr });
      road.sweepingFrequency = {
        type: sweepingFrequency.type,
        startDate: sweepingFrequency.startDate || null,
        days: sweepingFrequency.days || [],
      };
    }
    if (gpsPoints !== undefined) {
      const ptsErr = validateGpsPoints(gpsPoints);
      if (ptsErr) return res.status(400).json({ status: 'ERROR', message: ptsErr });
      road.gpsPoints = gpsPoints;
      road.routeGeometry = buildRouteGeometry(gpsPoints);
    }
    if (assignedMachineId !== undefined) {
      if (!String(assignedMachineId).trim()) {
        return res.status(400).json({ status: 'ERROR', message: 'Assigned machine cannot be empty' });
      }
      road.assignedMachineId = String(assignedMachineId).trim();
    }

    await road.save();
    res.json({ status: 'OK', code: 200, data: road, message: 'Road updated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// ─── DELETE /api/roads/:id ────────────────────────────────────────────────────
// Soft delete: status = inactive
// Future: jab Sweeping Plans linked honge to hard delete risky hoga

router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const road = await Road.findOne(roadFilter(req.params.id));
    if (!road) return res.status(404).json({ status: 'ERROR', message: 'Road not found' });

    // Soft delete — status inactive set karo
    // Future-ready: jab SweepingPlan model aaye to linked check add karo
    road.status = 'inactive';
    await road.save();

    res.json({ status: 'OK', code: 200, message: 'Road deactivated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
