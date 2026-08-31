const USER_MODULES = [
  'dashboard',
  'savedVehicles',
  'vehicleDetails',
  'driverList',
  'analytics',
  'map',
  'reports',
];

const ADMIN_MODULES = ['liveVehicles', 'users'];

const ALL_MODULES = [...USER_MODULES, ...ADMIN_MODULES];

function isValidModuleKey(key) {
  return ALL_MODULES.includes(key);
}

function sanitizeModuleAccess(moduleAccess, { role = 'user' } = {}) {
  if (role === 'admin') return ALL_MODULES;
  if (!Array.isArray(moduleAccess)) return [];
  return [...new Set(moduleAccess.filter(isValidModuleKey).filter((key) => USER_MODULES.includes(key)))];
}

function getEffectiveModuleAccess(user) {
  if (!user) return [];
  if (user.role === 'admin') return ALL_MODULES;
  const access = user.moduleAccess || [];
  if (access.length === 0) return USER_MODULES;
  return access.filter((key) => USER_MODULES.includes(key));
}

function hasModuleAccess(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getEffectiveModuleAccess(user).includes(moduleKey);
}

module.exports = {
  USER_MODULES,
  ADMIN_MODULES,
  ALL_MODULES,
  isValidModuleKey,
  sanitizeModuleAccess,
  getEffectiveModuleAccess,
  hasModuleAccess,
};
