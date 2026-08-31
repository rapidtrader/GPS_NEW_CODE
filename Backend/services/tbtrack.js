const SIGNIN_URL = process.env.TBTRACK_SIGNIN_URL;
const VEHICLE_LIST_URL = process.env.TBTRACK_VEHICLE_LIST_URL;
const VEHICLE_INFO_URL = process.env.TBTRACK_VEHICLE_INFO_URL || 'https://tbtrack.in/gps/ajax/v3/vehicle/info';
const VEHICLE_DETAIL_LIST_URL =
  process.env.TBTRACK_VEHICLE_DETAIL_LIST_URL || 'https://tbtrack.in/gps/ajax/v3/vehicle/detail/list';
const DRIVER_DETAIL_LIST_URL =
  process.env.TBTRACK_DRIVER_DETAIL_LIST_URL || 'https://tbtrack.in/gps/ajax/v3/driver/detail/list';
const ANALYTICS_DASHBOARD_URL =
  process.env.TBTRACK_ANALYTICS_DASHBOARD_URL || 'https://tbtrack.in/gps/analytics/dashboard/data';
const USERNAME = process.env.TBTRACK_USERNAME;
const PASSWORD = process.env.TBTRACK_PASSWORD;

const TOKEN_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry
const LOGIN_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes retry delay after failure

let cachedToken = null;
let tokenExpiresAt = 0;
let lastLoginAttemptTime = 0;
let loginFailureCount = 0;

function decodeTokenExpiry(token) {
  try {
    const part = token.split('.')[1];
    const json = Buffer.from(part, 'base64url').toString('utf8');
    const payload = JSON.parse(json);
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenValid() {
  return cachedToken && Date.now() < tokenExpiresAt - TOKEN_BUFFER_MS;
}

function clearTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
  // Don't reset failure count here - keep it for rate limiting
}

async function loginAndCacheToken() {
  const now = Date.now();
  
  // Rate limiting: Don't attempt login too frequently after failure
  if (loginFailureCount > 0 && now - lastLoginAttemptTime < LOGIN_RETRY_DELAY_MS) {
    const waitTime = Math.ceil((LOGIN_RETRY_DELAY_MS - (now - lastLoginAttemptTime)) / 1000);
    console.warn(`[TBTrack] ⏰ Rate limit: Too many login attempts. Please wait ${waitTime}s before retry`);
    throw new Error(`Too many login attempts. Retry after ${waitTime}s`);
  }

  lastLoginAttemptTime = now;
  console.log('[TBTrack] 🔐 Getting new token from TBTrack...');
  
  try {
    const response = await fetch(SIGNIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    });

    const result = await response.json();

    if (result.status !== 'OK' || !result.data?.token) {
      loginFailureCount++;
      console.error('[TBTrack] ❌ Login failed:', result.message);
      throw new Error(result.message || 'TBTrack sign in failed');
    }

    // Reset failure count on successful login
    loginFailureCount = 0;
    
    cachedToken = result.data.token;
    const exp = decodeTokenExpiry(cachedToken);
    tokenExpiresAt = exp || Date.now() + 24 * 60 * 60 * 1000;

    console.log('[TBTrack] ✅ Token received and cached successfully');
    console.log(`[TBTrack] Token expires at: ${new Date(tokenExpiresAt).toLocaleString()}`);

    return cachedToken;
  } catch (error) {
    console.error('[TBTrack] 💥 Token request error:', error.message);
    throw error;
  }
}

async function getAuthToken() {
  if (isTokenValid()) {
    console.log('[TBTrack] Using cached token (valid)');
    return cachedToken;
  }
  console.log('[TBTrack] Token invalid or expired, requesting new one...');
  return loginAndCacheToken();
}

async function fetchVehicleListWithToken(token) {
  const response = await fetch(VEHICLE_LIST_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const result = await response.json();

  if (response.status === 401 || response.status === 403) {
    return { unauthorized: true };
  }

  if (result.status !== 'OK') {
    throw new Error(result.message || 'Failed to fetch vehicle list');
  }

  return { data: result.data || [] };
}

async function fetchWithAuth(url, options = {}) {
  let token = await getAuthToken();
  let response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    clearTokenCache();
    token = await loginAndCacheToken();
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  const result = await response.json();

  if (result.status !== 'OK') {
    throw new Error(result.message || 'TBTrack request failed');
  }

  return result.data;
}

async function fetchVehicleList() {
  console.log('[TBTrack] Fetching vehicle list...');
  let token = await getAuthToken();
  let result = await fetchVehicleListWithToken(token);

  if (result.unauthorized) {
    console.warn('[TBTrack] ⚠️ Token unauthorized (401/403), clearing cache and retrying...');
    clearTokenCache();
    token = await loginAndCacheToken();
    result = await fetchVehicleListWithToken(token);

    if (result.unauthorized) {
      throw new Error('TBTrack token expired and re-login failed');
    }
  }

  console.log(`[TBTrack] ✅ Vehicle list fetched: ${Array.isArray(result.data) ? result.data.length : 0} vehicles`);
  return result.data;
}

async function fetchVehicleInfo() {
  return fetchWithAuth(VEHICLE_INFO_URL, { method: 'GET' });
}

async function fetchVehicleDetailList() {
  const data = await fetchWithAuth(VEHICLE_DETAIL_LIST_URL, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function fetchDriverDetailList() {
  const data = await fetchWithAuth(DRIVER_DETAIL_LIST_URL, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function fetchAnalyticsDashboard({ startTime, endTime, ouids = [] }) {
  const body = { startTime, endTime, ouids };

  return fetchWithAuth(ANALYTICS_DASHBOARD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

module.exports = {
  fetchVehicleList,
  fetchVehicleInfo,
  fetchVehicleDetailList,
  fetchDriverDetailList,
  fetchAnalyticsDashboard,
  getAuthToken,
  clearTokenCache,
};
