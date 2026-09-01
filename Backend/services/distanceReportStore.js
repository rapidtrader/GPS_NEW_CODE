const DistanceReport = require('../models/DistanceReport');
const Vehicle = require('../models/Vehicle');
const { fetchWithAuth } = require('./tbtrack');

const DISTANCE_REPORT_URL = process.env.TBTRACK_DISTANCE_REPORT_URL || 'https://tbtrack.in/gps/ajax/v3/report/distance';

async function fetchDistanceReport(token, { startTime, endTime, ouids = [] }) {
  try {
    // Get vehicle numbers from our database
    const Vehicle = require('../models/Vehicle');
    const vehicles = await Vehicle.find({ ouid: { $in: ouids } }, 'vehicleNo').lean();
    const vehicleList = vehicles.map(v => v.vehicleNo).filter(Boolean);
    
    if (vehicleList.length === 0) {
      throw new Error('No valid vehicles found');
    }

    // Format date range: "DD/MM/YYYY HH:MM - DD/MM/YYYY HH:MM"
    const formatDate = (timestamp) => {
      const date = new Date(timestamp);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    };

    const dateRange = `${formatDate(startTime)} - ${formatDate(endTime)}`;
    
    const body = {
      vehicleList,
      dateRange,
      webRequest: true
    };
    
    console.log('[TBTrack] Fetching distance report with correct format:');
    console.log(`  - vehicleList: ${JSON.stringify(vehicleList)}`);
    console.log(`  - dateRange: ${dateRange}`);
    console.log(`  - webRequest: true`);
    
    const response = await fetch(DISTANCE_REPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    console.log(`[TBTrack] Distance report response status: ${response.status}`);

    const result = await response.json();
    
    console.log(`[TBTrack] Response: ${result.status} - ${result.message}`);
    
    if (result.status !== 'OK') {
      throw new Error(result.message || 'Failed to fetch distance report');
    }
    
    console.log(`[TBTrack] ✅ Distance report fetched: ${(result.data || []).length} records`);
    return result.data || [];
  } catch (error) {
    console.error('[TBTrack] Distance report fetch error:', error.message);
    throw new Error(`Distance report fetch failed: ${error.message}`);
  }
}

async function saveDistanceReport(reportData = [], userId = null) {
  if (!Array.isArray(reportData) || reportData.length === 0) {
    return 0;
  }

  const ops = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a map of vehicleNo -> ouid for quick lookup
  const vehicleMap = {};
  try {
    const vehicles = await Vehicle.find({}, 'vehicleNo ouid').lean();
    for (const v of vehicles) {
      if (v.vehicleNo) {
        vehicleMap[v.vehicleNo] = v.ouid;
      }
    }
  } catch (err) {
    console.error('[DistanceReportStore] Error loading vehicle map:', err.message);
  }

  for (const record of reportData) {
    const vehicleNo = String(record.Vehicle || '');
    if (!vehicleNo) continue;

    // Extract date fields (format: "31/08/2026")
    const dayWiseData = [];
    let totalDistance = 0;

    // Collect all date fields
    for (const [key, value] of Object.entries(record)) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(key)) {
        const dist = Number(value) || 0;
        dayWiseData.push({
          date: key,
          distance: dist,
        });
        totalDistance += dist;
      }
    }

    // Fallback to TotalDistance if available
    if (record.TotalDistance) {
      totalDistance = Number(record.TotalDistance) || totalDistance;
    }

    // Lookup OUID from vehicleNo
    const ouid = vehicleMap[vehicleNo];
    if (!ouid) {
      console.warn(`[DistanceReportStore] Could not find OUID for vehicle: ${vehicleNo}`);
      continue;
    }

    const doc = {
      ouid,
      vehicleNo,
      vehicleAlias: String(record['Vehicle Alias'] || ''),
      reportDate: today,
      totalDistance,
      dayWiseData,
      rawData: record,
      syncedAt: new Date(),
      syncedBy: userId,
    };

    ops.push(
      DistanceReport.findOneAndUpdate(
        { ouid, reportDate: today },
        { $set: doc },
        { upsert: true, new: true }
      )
    );
  }

  if (ops.length > 0) {
    const results = await Promise.all(ops);
    console.log(`[DistanceReportStore] Saved ${results.length} distance reports`);
    return results.length;
  }
  return 0;
}

async function getDistanceReports(user, { startDate, endDate } = {}) {
  const query = {};

  if (startDate || endDate) {
    query.reportDate = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      query.reportDate.$gte = start;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.reportDate.$lte = end;
    }
  }

  // Filter by user access
  if (user.role !== 'admin' && user.vehicleAccess?.length > 0) {
    const allowed = new Set(user.vehicleAccess);
    query.vehicleNo = { $in: [...allowed] };
  }

  const reports = await DistanceReport.find(query)
    .sort({ reportDate: -1, vehicleNo: 1 })
    .lean();

  return reports;
}

async function getDistanceReportByDate(user, startDate, endDate) {
  const query = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    query.reportDate = { $gte: start };
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (query.reportDate) {
      query.reportDate.$lte = end;
    } else {
      query.reportDate = { $lte: end };
    }
  }

  // Filter by user access
  if (user.role !== 'admin' && user.vehicleAccess?.length > 0) {
    const allowed = new Set(user.vehicleAccess);
    query.vehicleNo = { $in: [...allowed] };
  }

  const reports = await DistanceReport.find(query)
    .sort({ reportDate: -1, vehicleNo: 1 })
    .lean();

  return reports;
}

module.exports = {
  fetchDistanceReport,
  saveDistanceReport,
  getDistanceReports,
  getDistanceReportByDate,
};
