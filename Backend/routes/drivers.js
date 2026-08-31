const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { requireModule } = require('../middleware/access');
const { fetchDriverDetailList } = require('../services/tbtrack');
const {
  filterDriversByAccess,
  saveDriverDetails,
  getSavedDriverDetails,
} = require('../services/driverDetailStore');

const router = express.Router();

router.get('/list', authMiddleware, requireModule('driverList'), async (req, res) => {
  try {
    const drivers = await fetchDriverDetailList();
    const filtered = filterDriversByAccess(drivers, req.user);

    if (req.user.role === 'admin') {
      await saveDriverDetails(drivers);
    } else if (filtered.length > 0) {
      await saveDriverDetails(filtered);
    }

    res.json({ status: 'OK', code: 200, data: filtered, source: 'live', saved: true });
  } catch (error) {
    try {
      const saved = await getSavedDriverDetails(req.user);
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
