import { DEFAULT_USER_MODULES, MODULE_LABELS } from '../config/modules';
import { ROUTES } from '../routes/paths';

const ROUTE_MODULE_MAP = {
  [ROUTES.dashboard]: 'dashboard',
  [ROUTES.savedVehicles]: 'savedVehicles',
  [ROUTES.vehicleDetails]: 'vehicleDetails',
  [ROUTES.driverList]: 'driverList',
  [ROUTES.analytics]: 'analytics',
  [ROUTES.map]: 'map',
  [ROUTES.reports]: 'reports',
  [ROUTES.sweeperMonitoring]: 'sweeperMonitoring',
  [ROUTES.liveVehicles]: 'liveVehicles',
  [ROUTES.users]: 'users',
  [ROUTES.projects]: 'projects',
  [ROUTES.projectDetail]: 'projects',
  [ROUTES.roads]: 'roads',
  [ROUTES.roadCreate]: 'roads',
  [ROUTES.roadDetail]: 'roads',
  [ROUTES.roadEdit]: 'roads',
  [ROUTES.machines]: 'machines',
  [ROUTES.machineCreate]: 'machines',
  [ROUTES.machineDetail]: 'machines',
  [ROUTES.machineEdit]: 'machines',
};

export function getEffectiveModuleAccess(user) {
  if (!user) return [];
  if (user.role === 'admin') {
    return [...DEFAULT_USER_MODULES, 'liveVehicles', 'users', 'projects', 'roads', 'machines'];
  }
  const access = user.moduleAccess || [];
  if (access.length === 0) return DEFAULT_USER_MODULES;
  return access;
}

export function canAccessModule(user, moduleKey) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return getEffectiveModuleAccess(user).includes(moduleKey);
}

export function getModuleLabel(moduleKey) {
  return MODULE_LABELS[moduleKey] || moduleKey;
}

export function getDefaultRoute(user) {
  const access = getEffectiveModuleAccess(user);
  const priority = [
    'dashboard',
    'savedVehicles',
    'vehicleDetails',
    'driverList',
    'analytics',
    'map',
    'reports',
    'sweeperMonitoring',
    'liveVehicles',
    'users',
  ];

  for (const key of priority) {
    if (!access.includes(key)) continue;
    for (const [path, moduleKey] of Object.entries(ROUTE_MODULE_MAP)) {
      if (moduleKey === key) return path;
    }
  }

  return ROUTES.login;
}

export function getModuleKeyForPath(pathname) {
  return ROUTE_MODULE_MAP[pathname] || null;
}
