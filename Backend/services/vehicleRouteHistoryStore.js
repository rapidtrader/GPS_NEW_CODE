const VehicleRouteHistory = require('../models/VehicleRouteHistory');
const Vehicle = require('../models/Vehicle');

const ROUTE_HISTORY_URL = process.env.TBTRACK_ROUTE_HISTORY_URL || 'https://tbtrack.in/gps/rest/v4/tpr/vehicle/route/history';

async function fetchRouteHistory(token, { vehicleNo, startTime, endTime }) {
  try {
    const Vehicle = require('../models/Vehicle');
    
    // Get vehicle OUID
    const vehicle = await Vehicle.findOne({ vehicleNo }).lean();
    if (!vehicle) {
      throw new Error(`Vehicle not found: ${vehicleNo}`);
    }

    // Format dates for TBTrack API (DD/MM/YYYY HH:MM - without seconds)
    const formatDate = (timestamp) => {
      const date = new Date(timestamp);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    };

    const startTimeStr = formatDate(startTime);
    const endTimeStr = formatDate(endTime);

    const body = {
      ouid: vehicle.ouid,
      dateRange: `${startTimeStr} - ${endTimeStr}`,
      customDateTime: true
    };

    console.log('[TBTrack] Fetching route history for vehicle:', vehicleNo);
    console.log(`  - ouid: ${vehicle.ouid}`);
    console.log(`  - dateRange: ${body.dateRange}`);

    const response = await fetch(ROUTE_HISTORY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.status !== 'OK') {
      throw new Error(result.message || 'Failed to fetch route history');
    }

    console.log(`[TBTrack] ✅ Route history fetched: ${(result.data || []).length} points`);
    return result.data || [];
  } catch (error) {
    console.error('[TBTrack] Route history fetch error:', error.message);
    throw new Error(`Route history fetch failed: ${error.message}`);
  }
}

async function saveRouteHistory(routeData = [], vehicleNo, userId = null) {
  if (!Array.isArray(routeData) || routeData.length === 0) {
    return 0;
  }

  // Get vehicle OUID
  const vehicle = await Vehicle.findOne({ vehicleNo }).lean();
  if (!vehicle) {
    console.warn(`[RouteHistoryStore] Vehicle not found: ${vehicleNo}`);
    return 0;
  }

  // Helper function to parse date strings like "01/09/2026 00:00:00"
  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const parts = dateStr.split(' ');
      if (parts.length < 2) return null;

      const [day, month, year] = parts[0].split('/');
      const [hours, minutes, seconds = '0'] = parts[1].split(':');

      const localDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes),
        parseInt(seconds)
      );

      // TBTrack time is IST (UTC+5:30) → convert to UTC for storage
      const utcDate = new Date(localDate.getTime() - (5.5 * 60 * 60 * 1000));
      return isNaN(utcDate.getTime()) ? null : utcDate;
    } catch (err) {
      console.warn(`[RouteHistoryStore] Could not parse date: ${dateStr}`);
      return null;
    }
  };

  // Parse all records first
  const parsed = routeData.map((record) => ({
    record,
    addedDate: parseDate(record.added),
    receivedDate: parseDate(record.actualRecieved),
  }));

  // Bulk duplicate check — fetch all existing timestamps in one query
  const timestamps = parsed.map((p) => p.addedDate).filter(Boolean);
  const existingDocs = timestamps.length > 0
    ? await VehicleRouteHistory.find(
        { vehicleNo, added: { $in: timestamps } },
        { added: 1 }
      ).lean()
    : [];
  const existingSet = new Set(existingDocs.map((d) => d.added.getTime()));

  const ops = [];

  for (const { record, addedDate, receivedDate } of parsed) {
    // Skip duplicates
    if (addedDate && existingSet.has(addedDate.getTime())) continue;

    // Use address from TBTrack response directly (no extra API call per record)
    // Geocoding happens on-demand in the frontend via /api/geocode proxy
    let address = record.address;
    if (!address || address === 'Not found') {
      address = (record.latitude && record.longitude)
        ? `${Number(record.latitude).toFixed(4)}, ${Number(record.longitude).toFixed(4)}`
        : '';
    }

    const doc = new VehicleRouteHistory({
      vehicleNo,
      ouid: vehicle.ouid,
      latitude: Number(record.latitude) || null,
      longitude: Number(record.longitude) || null,
      speed: Number(record.speed) || 0,
      added: addedDate,
      address,
      duration: Number(record.duration) || 0,
      distance: Number(record.distance) || 0,
      actualReceived: receivedDate,
      status: record.status || '',
      fuel: Number(record.fuel) || 0,
      load: Number(record.load) || 0,
      temperature: Number(record.temperature) || 0,
      rawData: record,
      syncedAt: new Date(),
      syncedBy: userId,
    });

    ops.push(doc.save());
  }

  if (ops.length > 0) {
    await Promise.all(ops);
    console.log(`[RouteHistoryStore] Saved ${ops.length} route history records for ${vehicleNo}`);
    return ops.length;
  }
  console.log(`[RouteHistoryStore] All records duplicate, skipped for ${vehicleNo}`);
  return 0;
}

async function getRouteHistory(user, vehicleNo, { startDate, endDate } = {}) {
  const query = { vehicleNo };

  if (startDate || endDate) {
    query.added = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.added.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.added.$lte = end;
    }
  }

  // Filter by user access
  if (user.role !== 'admin' && user.vehicleAccess?.length > 0) {
    const allowed = new Set(user.vehicleAccess);
    if (!allowed.has(vehicleNo)) {
      return [];
    }
  }

  const history = await VehicleRouteHistory.find(query)
    .sort({ added: -1 })
    .lean();

  return history;
}

module.exports = {
  fetchRouteHistory,
  saveRouteHistory,
  getRouteHistory,
};
