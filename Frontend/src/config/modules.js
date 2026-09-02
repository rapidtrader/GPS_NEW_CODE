export const USER_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'savedVehicles', label: 'Saved Data' },
  { key: 'vehicleDetails', label: 'Vehicle Details' },
  { key: 'driverList', label: 'Driver List' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'map', label: 'Live Map' },
  { key: 'reports', label: 'Reports' },
  { key: 'sweeperMonitoring', label: 'Sweeper Monitoring' },
];

export const ADMIN_ONLY_MODULES = [
  { key: 'liveVehicles', label: 'Live Vehicles' },
  { key: 'users', label: 'User Management' },
  { key: 'projects', label: 'Projects' },
  { key: 'roads', label: 'Roads' },
  { key: 'machines', label: 'Machines' },
];

export const MODULE_LABELS = Object.fromEntries(
  [...USER_MODULES, ...ADMIN_ONLY_MODULES].map(({ key, label }) => [key, label])
);

export const DEFAULT_USER_MODULES = USER_MODULES.map((m) => m.key);
