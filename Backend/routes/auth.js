const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const { generateToken, authMiddleware, adminMiddleware } = require('../middleware/auth');
const { sanitizeModuleAccess, getEffectiveModuleAccess } = require('../constants/modules');

const router = express.Router();

function serializeUser(user) {
  return {
    id: user._id,
    username: user.username,
    name: user.name || '',
    phoneNumber: user.phoneNumber || '',
    role: user.role,
    vehicleAccess: user.vehicleAccess || [],
    moduleAccess: getEffectiveModuleAccess(user),
  };
}

function normalizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function validatePhoneNumber(value) {
  const digits = normalizePhoneNumber(value);
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }
  return digits;
}

router.get('/setup-status', async (_req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ status: 'OK', needsAdminSignup: count === 0 });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) {
      return res.status(403).json({
        status: 'ERROR',
        message: 'Admin already exists. Please login or ask admin to create your account.',
      });
    }

    const { username, password } = req.body;
    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Username and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: 'ERROR', message: 'Password must be at least 6 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim().toLowerCase(),
      passwordHash,
      role: 'admin',
    });

    const token = generateToken(user);
    res.status(201).json({
      status: 'OK',
      data: {
        token,
        user: serializeUser(user),
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'ERROR', message: 'Username already exists' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Username and password required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ status: 'ERROR', message: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ status: 'ERROR', message: 'Invalid username or password' });
    }

    const token = generateToken(user);
    res.json({
      status: 'OK',
      data: {
        token,
        user: serializeUser(user),
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({
    status: 'OK',
    data: serializeUser(req.user),
  });
});

router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { username, password, name, phoneNumber, vehicleAccess = [], moduleAccess = [] } = req.body;
    if (!username?.trim() || !password?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Username and password required' });
    }
    if (!name?.trim()) {
      return res.status(400).json({ status: 'ERROR', message: 'Name is required' });
    }
    const normalizedPhone = validatePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ status: 'ERROR', message: 'Valid phone number is required (10-15 digits)' });
    }
    if (password.length < 6) {
      return res.status(400).json({ status: 'ERROR', message: 'Password must be at least 6 characters' });
    }
    if (!Array.isArray(vehicleAccess)) {
      return res.status(400).json({ status: 'ERROR', message: 'vehicleAccess must be an array' });
    }
    if (!Array.isArray(moduleAccess)) {
      return res.status(400).json({ status: 'ERROR', message: 'moduleAccess must be an array' });
    }

    const uniqueAccess = [...new Set(vehicleAccess.filter(Boolean))];
    if (uniqueAccess.length === 0) {
      return res.status(400).json({ status: 'ERROR', message: 'Select at least one vehicle' });
    }

    const uniqueModules = sanitizeModuleAccess(moduleAccess, { role: 'user' });
    if (uniqueModules.length === 0) {
      return res.status(400).json({ status: 'ERROR', message: 'Select at least one module' });
    }

    const existingVehicles = await Vehicle.find(
      { vehicleNo: { $in: uniqueAccess } },
      'vehicleNo'
    ).lean();
    const validNumbers = new Set(existingVehicles.map((v) => v.vehicleNo));
    const invalid = uniqueAccess.filter((no) => !validNumbers.has(no));
    if (invalid.length > 0) {
      return res.status(400).json({
        status: 'ERROR',
        message: `Invalid vehicle number(s): ${invalid.join(', ')}`,
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      username: username.trim().toLowerCase(),
      name: name.trim(),
      phoneNumber: normalizedPhone,
      passwordHash,
      role: 'user',
      vehicleAccess: uniqueAccess,
      moduleAccess: uniqueModules,
    });

    res.status(201).json({
      status: 'OK',
      data: serializeUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: 'ERROR', message: 'Username already exists' });
    }
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.get('/users', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: 1 }).lean();
    res.json({
      status: 'OK',
      data: users.map((u) => ({
        id: u._id,
        _id: u._id,
        username: u.username,
        name: u.name || '',
        phoneNumber: u.phoneNumber || '',
        role: u.role,
        vehicleAccess: u.vehicleAccess || [],
        moduleAccess: getEffectiveModuleAccess(u),
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { password, name, phoneNumber, vehicleAccess, moduleAccess } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ status: 'ERROR', message: 'User not found' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ status: 'ERROR', message: 'Admin account cannot be edited here' });
    }

    if (name !== undefined) {
      if (!name?.trim()) {
        return res.status(400).json({ status: 'ERROR', message: 'Name is required' });
      }
      user.name = name.trim();
    }

    if (phoneNumber !== undefined) {
      const normalizedPhone = validatePhoneNumber(phoneNumber);
      if (!normalizedPhone) {
        return res.status(400).json({ status: 'ERROR', message: 'Valid phone number is required (10-15 digits)' });
      }
      user.phoneNumber = normalizedPhone;
    }

    if (vehicleAccess !== undefined) {
      if (!Array.isArray(vehicleAccess)) {
        return res.status(400).json({ status: 'ERROR', message: 'vehicleAccess must be an array' });
      }
      const uniqueAccess = [...new Set(vehicleAccess.filter(Boolean))];
      if (uniqueAccess.length === 0) {
        return res.status(400).json({ status: 'ERROR', message: 'Select at least one vehicle' });
      }

      const existingVehicles = await Vehicle.find(
        { vehicleNo: { $in: uniqueAccess } },
        'vehicleNo'
      ).lean();
      const validNumbers = new Set(existingVehicles.map((v) => v.vehicleNo));
      const invalid = uniqueAccess.filter((no) => !validNumbers.has(no));
      if (invalid.length > 0) {
        return res.status(400).json({
          status: 'ERROR',
          message: `Invalid vehicle number(s): ${invalid.join(', ')}`,
        });
      }
      user.vehicleAccess = uniqueAccess;
    }

    if (moduleAccess !== undefined) {
      if (!Array.isArray(moduleAccess)) {
        return res.status(400).json({ status: 'ERROR', message: 'moduleAccess must be an array' });
      }
      const uniqueModules = sanitizeModuleAccess(moduleAccess, { role: 'user' });
      if (uniqueModules.length === 0) {
        return res.status(400).json({ status: 'ERROR', message: 'Select at least one module' });
      }
      user.moduleAccess = uniqueModules;
    }

    if (password?.trim()) {
      if (password.length < 6) {
        return res.status(400).json({ status: 'ERROR', message: 'Password must be at least 6 characters' });
      }
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    res.json({
      status: 'OK',
      data: serializeUser(user),
    });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: error.message });
  }
});

module.exports = router;
