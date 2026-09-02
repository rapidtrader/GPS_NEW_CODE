// Dev: VITE_API_URL empty → Vite dev proxy handles /api
// Production: VITE_API_URL empty → same-origin /api (nginx reverse proxy)
// Production (separate API host): VITE_API_URL=https://gps.dynacleanindustries.com
const API_BASE = import.meta.env.VITE_API_URL || '';

function getToken() {
  return localStorage.getItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse(response) {
  const data = await response.json();
  if (!response.ok || data.status === 'ERROR') {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

export async function checkSetupStatus() {
  const response = await fetch(`${API_BASE}/api/auth/setup-status`);
  return handleResponse(response);
}

export async function adminSignup(username, password) {
  const response = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await handleResponse(response);
  if (data.data?.token) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
}

export async function login(username, password) {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await handleResponse(response);
  if (data.data?.token) {
    localStorage.setItem('token', data.data.token);
    localStorage.setItem('user', JSON.stringify(data.data.user));
  }
  return data;
}

export async function fetchMe() {
  const response = await fetch(`${API_BASE}/api/auth/me`, {
    headers: authHeaders(),
  });
  const data = await handleResponse(response);
  if (data.data) {
    localStorage.setItem('user', JSON.stringify(data.data));
  }
  return data;
}

export async function fetchVehicles() {
  const response = await fetch(`${API_BASE}/api/vehicles`, {
    headers: authHeaders(),
  });
  const data = await handleResponse(response);
  return { ...data, data: filterVehiclesForUser(data.data) };
}

export async function fetchSavedVehicles() {
  const response = await fetch(`${API_BASE}/api/vehicles/saved`, {
    headers: authHeaders(),
  });
  const data = await handleResponse(response);
  return { ...data, data: filterVehiclesForUser(data.data) };
}

export async function fetchVehicleDetails() {
  const response = await fetch(`${API_BASE}/api/vehicles/details`, {
    headers: authHeaders(),
  });
  const data = await handleResponse(response);
  return { ...data, data: filterVehiclesForUser(data.data) };
}

export async function fetchDriverList() {
  const response = await fetch(`${API_BASE}/api/drivers/list`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchUsers() {
  const response = await fetch(`${API_BASE}/api/auth/users`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchVehicleNumbers() {
  const response = await fetch(`${API_BASE}/api/vehicles/numbers`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchVehicleOptions() {
  const response = await fetch(`${API_BASE}/api/vehicles/options`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function createUser({
  username,
  password,
  name,
  phoneNumber,
  vehicleAccess = [],
  moduleAccess = [],
}) {
  const response = await fetch(`${API_BASE}/api/auth/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ username, password, name, phoneNumber, vehicleAccess, moduleAccess }),
  });
  return handleResponse(response);
}

export async function updateUser(userId, { password, name, phoneNumber, vehicleAccess, moduleAccess }) {
  const body = {};
  if (password) body.password = password;
  if (name !== undefined) body.name = name;
  if (phoneNumber !== undefined) body.phoneNumber = phoneNumber;
  if (vehicleAccess !== undefined) body.vehicleAccess = vehicleAccess;
  if (moduleAccess !== undefined) body.moduleAccess = moduleAccess;

  const response = await fetch(`${API_BASE}/api/auth/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export async function fetchAnalyticsVehicleInfo() {
  const response = await fetch(`${API_BASE}/api/analytics/vehicle-info`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchAnalyticsDashboard({ startTime, endTime, ouid = '', ouids = [] }) {
  const response = await fetch(`${API_BASE}/api/analytics/dashboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ startTime, endTime, ouid, ouids }),
  });
  return handleResponse(response);
}

export async function fetchSavedAnalytics({ startTime, endTime, ouid = '', ouids = [] }) {
  const params = new URLSearchParams({
    startTime: String(startTime),
    endTime: String(endTime),
  });
  if (ouid) params.set('ouid', ouid);
  if (ouids.length > 0) params.set('ouids', ouids.join(','));

  const response = await fetch(`${API_BASE}/api/analytics/saved?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchSweepingReport({ startTime, endTime, ouid = '' }) {
  const params = new URLSearchParams({
    startTime: String(startTime),
    endTime: String(endTime),
  });
  if (ouid) params.set('ouid', ouid);

  const response = await fetch(`${API_BASE}/api/vehicles/sweeping?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchReports(snapshotId = '') {
  const params = snapshotId ? `?snapshotId=${encodeURIComponent(snapshotId)}` : '';
  const response = await fetch(`${API_BASE}/api/analytics/reports${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getStoredUser() {
  const raw = localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function getUserDisplayName(user) {
  return user?.name?.trim() || user?.username || 'User';
}

export function filterVehiclesForUser(vehicles, user = getStoredUser()) {
  if (!user || user.role === 'admin') return vehicles || [];
  if (!user.vehicleAccess?.length) return [];
  const allowed = new Set(user.vehicleAccess);
  return (vehicles || []).filter(
    (v) => allowed.has(v.vehicleNo) || allowed.has(v.ouid)
  );
}

export async function fetchVehicleHistory(vehicleNo, { startDate, endDate }) {
  const params = new URLSearchParams({ startDate, endDate });
  const response = await fetch(`${API_BASE}/api/vehicle-history/${encodeURIComponent(vehicleNo)}?${params}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function syncVehicleHistory(vehicleNo, { startTime, endTime }) {
  const response = await fetch(`${API_BASE}/api/vehicle-history/${encodeURIComponent(vehicleNo)}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ startTime, endTime }),
  });
  return handleResponse(response);
}

export async function reverseGeocodeAddress(lat, lng) {
  const response = await fetch(
    `${API_BASE}/api/geocode?lat=${lat}&lng=${lng}`,
    { headers: authHeaders() }
  );
  if (!response.ok) throw new Error('Geocode failed');
  return response.json(); // { address: "..." }
}

export function isLoggedIn() {
  return !!getToken();
}

// ─── GPS Live Tracking APIs ────────────────────────────────────────────────

export async function fetchLiveMachines(projectId) {
  const response = await fetch(
    `${API_BASE}/api/gps/live?projectId=${encodeURIComponent(projectId)}`,
    { headers: authHeaders() }
  );
  return handleResponse(response);
}

export async function fetchLiveMachine(machineId) {
  const response = await fetch(
    `${API_BASE}/api/gps/live/${encodeURIComponent(machineId)}`,
    { headers: authHeaders() }
  );
  return handleResponse(response);
}

export async function fetchMachineGpsHistory(machineId, { start, end }) {
  const params = new URLSearchParams({ start, end });
  const response = await fetch(
    `${API_BASE}/api/gps/history/${encodeURIComponent(machineId)}?${params}`,
    { headers: authHeaders() }
  );
  return handleResponse(response);
}

// ─── Sweeping Plan APIs ────────────────────────────────────────────────────

export async function generateSweepingPlan({ projectId, planDate }) {
  const response = await fetch(`${API_BASE}/api/sweeping-plans/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ projectId, planDate }),
  });
  return handleResponse(response);
}

export async function fetchSweepingPlans({ projectId, planDate, machineId, status } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (planDate)  params.set('planDate',  planDate);
  if (machineId) params.set('machineId', machineId);
  if (status)    params.set('status',    status);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/api/sweeping-plans${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchSweepingPlan(id) {
  const response = await fetch(`${API_BASE}/api/sweeping-plans/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function updateSweepingPlan(id, data) {
  const response = await fetch(`${API_BASE}/api/sweeping-plans/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function cancelSweepingPlan(id) {
  const response = await fetch(`${API_BASE}/api/sweeping-plans/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(response);
}

// ─── Machine Management APIs ───────────────────────────────────────────────

export async function fetchMachines({ projectId, status } = {}) {
  const params = new URLSearchParams();
  if (projectId) params.set('projectId', projectId);
  if (status)    params.set('status',    status);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/api/machines${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchMachine(id) {
  const response = await fetch(`${API_BASE}/api/machines/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function createMachine(data) {
  const response = await fetch(`${API_BASE}/api/machines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function updateMachine(id, data) {
  const response = await fetch(`${API_BASE}/api/machines/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function deleteMachine(id) {
  const response = await fetch(`${API_BASE}/api/machines/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(response);
}

// ─── Road Management APIs ──────────────────────────────────────────────────

export async function fetchRoads({ projectId, status, areaName, colonyName, frequency } = {}) {
  const params = new URLSearchParams();
  if (projectId)  params.set('projectId',  projectId);
  if (status)     params.set('status',     status);
  if (areaName)   params.set('areaName',   areaName);
  if (colonyName) params.set('colonyName', colonyName);
  if (frequency)  params.set('frequency',  frequency);
  const qs = params.toString();
  const response = await fetch(`${API_BASE}/api/roads${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchRoad(id) {
  const response = await fetch(`${API_BASE}/api/roads/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function createRoad(data) {
  const response = await fetch(`${API_BASE}/api/roads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function updateRoad(id, data) {
  const response = await fetch(`${API_BASE}/api/roads/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
}

export async function deleteRoad(id) {
  const response = await fetch(`${API_BASE}/api/roads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchProjects() {
  const response = await fetch(`${API_BASE}/api/projects`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function fetchProject(id) {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    headers: authHeaders(),
  });
  return handleResponse(response);
}

export async function createProject({ projectId, projectName, status, settings }) {
  const response = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ projectId, projectName, status, settings }),
  });
  return handleResponse(response);
}

export async function updateProject(id, { projectName, status, settings }) {
  const body = {};
  if (projectName !== undefined) body.projectName = projectName;
  if (status !== undefined) body.status = status;
  if (settings !== undefined) body.settings = settings;

  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  return handleResponse(response);
}

export async function deleteProject(id) {
  const response = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  return handleResponse(response);
}
