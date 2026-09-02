const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const Project = require('../models/Project');

const router = express.Router();

// GET /api/projects — saare projects return karo
router.get('/', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const projects = await Project.find({}).sort({ createdAt: -1 }).lean();
    res.json({ status: 'OK', code: 200, data: projects });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// GET /api/projects/:id — single project by MongoDB _id ya projectId
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    // MongoDB ObjectId ya projectId dono support karo
    const project = await Project.findOne({
      $or: [
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { projectId: id },
      ],
    }).lean();

    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: 'Project not found' });
    }

    res.json({ status: 'OK', code: 200, data: project });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// POST /api/projects — new project create karo
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { projectId, projectName, status, settings } = req.body;

    // Validation
    if (!projectId || !String(projectId).trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Project ID is required' });
    }
    if (!projectName || !String(projectName).trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Project name is required' });
    }
    if (status && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
    }

    // Settings validation
    if (settings) {
      if (settings.sweepingSpeedLimit !== undefined) {
        const speed = Number(settings.sweepingSpeedLimit);
        if (isNaN(speed) || speed < 0) {
          return res.status(400).json({ status: 'ERROR', message: 'Sweeping speed limit must be a valid non-negative number' });
        }
      }
      if (settings.completionThreshold !== undefined) {
        const threshold = Number(settings.completionThreshold);
        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          return res.status(400).json({ status: 'ERROR', message: 'Completion threshold must be between 0 and 100' });
        }
      }
    }

    // Duplicate projectId check
    const existing = await Project.findOne({ projectId: String(projectId).trim() });
    if (existing) {
      return res.status(409).json({ status: 'ERROR', message: 'Project ID already exists' });
    }

    const project = new Project({
      projectId: String(projectId).trim(),
      projectName: String(projectName).trim(),
      status: status || 'active',
      settings: {
        sweepingSpeedLimit: settings?.sweepingSpeedLimit !== undefined ? Number(settings.sweepingSpeedLimit) : 8,
        completionThreshold: settings?.completionThreshold !== undefined ? Number(settings.completionThreshold) : 90,
      },
    });

    await project.save();
    res.status(201).json({ status: 'OK', code: 201, data: project, message: 'Project created successfully' });
  } catch (error) {
    // Mongoose duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({ status: 'ERROR', message: 'Project ID already exists' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// PUT /api/projects/:id — existing project update karo
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { projectName, status, settings } = req.body;

    // Validation
    if (projectName !== undefined && !String(projectName).trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Project name cannot be empty' });
    }
    if (status !== undefined && !['active', 'inactive'].includes(status)) {
      return res.status(400).json({ status: 'ERROR', message: 'Status must be active or inactive' });
    }
    if (settings) {
      if (settings.sweepingSpeedLimit !== undefined) {
        const speed = Number(settings.sweepingSpeedLimit);
        if (isNaN(speed) || speed < 0) {
          return res.status(400).json({ status: 'ERROR', message: 'Sweeping speed limit must be a valid non-negative number' });
        }
      }
      if (settings.completionThreshold !== undefined) {
        const threshold = Number(settings.completionThreshold);
        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          return res.status(400).json({ status: 'ERROR', message: 'Completion threshold must be between 0 and 100' });
        }
      }
    }

    // Find project — ObjectId ya projectId dono
    const filter = {
      $or: [
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { projectId: id },
      ],
    };

    const project = await Project.findOne(filter);
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: 'Project not found' });
    }

    // Apply updates (projectId immutable — future Roads/Machines link honge)
    if (projectName !== undefined) project.projectName = String(projectName).trim();
    if (status !== undefined) project.status = status;
    if (settings) {
      if (settings.sweepingSpeedLimit !== undefined) {
        project.settings.sweepingSpeedLimit = Number(settings.sweepingSpeedLimit);
      }
      if (settings.completionThreshold !== undefined) {
        project.settings.completionThreshold = Number(settings.completionThreshold);
      }
    }

    await project.save();
    res.json({ status: 'OK', code: 200, data: project, message: 'Project updated successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

// DELETE /api/projects/:id — project delete/deactivate karo
// Safe approach: agar future mein Roads/Machines linked honge to hard delete unsafe hoga.
// Abhi hard delete karo lekin 409 conflict response structure future-ready hai.
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const filter = {
      $or: [
        ...(id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { projectId: id },
      ],
    };

    const project = await Project.findOne(filter);
    if (!project) {
      return res.status(404).json({ status: 'ERROR', message: 'Project not found' });
    }

    // Future-ready: jab Roads/Machines add honge to yahan linked check aayega
    // const linkedRoads = await Road.countDocuments({ projectId: project.projectId });
    // if (linkedRoads > 0) {
    //   return res.status(409).json({ status: 'ERROR', message: 'Cannot delete project with linked roads. Deactivate instead.' });
    // }

    await Project.deleteOne(filter);
    res.json({ status: 'OK', code: 200, message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
