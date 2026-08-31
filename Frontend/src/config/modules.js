export const USER_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'savedVehicles', label: 'Saved Data' },
  { key: 'vehicleDetails', label: 'Vehicle Details' },
  { key: 'driverList', label: 'Driver List' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'map', label: 'Live Map' },
  { key: 'reports', label: 'Reports' },
];

export const MODULE_LABELS = Object.fromEntries(
  USER_MODULES.map(({ key, label }) => [key, label])
);

export const DEFAULT_USER_MODULES = USER_MODULES.map((m) => m.key);
