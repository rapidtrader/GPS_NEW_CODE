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

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // refresh 5 min before expiry
const DEFAULT_TOKEN_VALIDITY_MS = 12 * 60 * 60 * 1000; // Assume 12 hours if can't decode
const LOGIN_RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes retry delay after failure

let cachedToken = null;
let tokenExpiresAt = 0;
let lastLoginAttemptTime = 0;
let loginFailureCount = 0;
let tokenAcquisitionTime = 0;

function decodeTokenExpiry(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    
    // Add padding if needed
    const padding = 4 - (part.length % 4);
    const paddedPart = padding < 4 ? part + '='.repeat(padding) : part;
    
    const json = Buffer.from(paddedPart, 'base64').toString('utf8');
    const payload = JSON.parse(json);
    
    if (payload.exp) {
      const expiryTime = payload.exp * 1000;
      console.log(`[TBTrack] 📅 Token expiry decoded: ${new Date(expiryTime).toLocaleString()}`);
      return expiryTime;
    }
    return null;
  } catch (err) {
    console.warn(`[TBTrack] ⚠️ Could not decode token expiry: ${err.message}`);
    return null;
  }
}

function isTokenValid() {
  if (!cachedToken) return false;
  
  const now = Date.now();
  const timeRemaining = tokenExpiresAt - now;
  const isValid = timeRemaining > TOKEN_BUFFER_MS;
  
  if (isValid) {
    const minutesRemaining = Math.floor(timeRemaining / 1000 / 60);
    console.log(`[TBTrack] ✅ Token is valid (expires in ${minutesRemaining} minutes)`);
  } else {
    const minutesExpired = Math.floor((TOKEN_BUFFER_MS - timeRemaining) / 1000 / 60);
    console.log(`[TBTrack] ❌ Token expired or expiring soon (will refresh in ${minutesExpired} minutes)`);
  }
  
  return isValid;
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
    console.warn(`[TBTrack] ⏰ Rate limit active: Please wait ${waitTime}s before next login attempt`);
    throw new Error(`Rate limited. Retry after ${waitTime}s`);
  }

  lastLoginAttemptTime = now;
  console.log('[TBTrack] 🔐 Attempting to get new token from TBTrack...');
  
  try {
    const response = await fetch(SIGNIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
      timeout: 10000, // 10 second timeout
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
    tokenAcquisitionTime = now;
    
    const exp = decodeTokenExpiry(cachedToken);
    if (exp) {
      tokenExpiresAt = exp;
    } else {
      // If we can't decode, assume 12 hours validity
      tokenExpiresAt = now + DEFAULT_TOKEN_VALIDITY_MS;
      console.log(`[TBTrack] ℹ️ Using default token validity (12 hours)`);
    }

    console.log(`[TBTrack] ✅ Token acquired successfully`);
    console.log(`[TBTrack] ⏱️ Token will expire at: ${new Date(tokenExpiresAt).toLocaleString()}`);

    return cachedToken;
  } catch (error) {
    console.error('[TBTrack] 💥 Token acquisition error:', error.message);
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
