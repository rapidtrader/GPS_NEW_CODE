const { hasModuleAccess } = require('../constants/modules');

function requireModule(moduleKey) {
  return (req, res, next) => {
    if (hasModuleAccess(req.user, moduleKey)) {
      return next();
    }
    return res.status(403).json({ status: 'ERROR', message: 'Module access denied' });
  };
}

function requireAnyModule(...moduleKeys) {
  return (req, res, next) => {
    if (moduleKeys.some((key) => hasModuleAccess(req.user, key))) {
      return next();
    }
    return res.status(403).json({ status: 'ERROR', message: 'Module access denied' });
  };
}

module.exports = { requireModule, requireAnyModule, hasModuleAccess };
