const DistanceReport = require('../models/DistanceReport');
const { fetchWithAuth } = require('./tbtrack');

const DISTANCE_REPORT_URL = process.env.TBTRACK_DISTANCE_REPORT_URL || 'https://tbtrack.in/gps/ajax/v3/report/distance';

async function fetchDistanceReport(token, { startTime, endTime, ouids = [] }) {
  try {
    const body = { startTime, endTime, ouids };
    const response = await fetch(DISTANCE_REPORT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    if (result.status !== 'OK') {
      throw new Error(result.message || 'Failed to fetch distance report');
    }
    return result.data || [];
  } catch (error) {
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

  for (const record of reportData) {
    if (!record.Vehicle) continue;

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

    const doc = {
      vehicleNo: String(record.Vehicle || ''),
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
        { vehicleNo: doc.vehicleNo, reportDate: today },
        { $set: doc },
        { upsert: true, new: true }
      )
    );
  }

  if (ops.length > 0) {
    await Promise.all(ops);
    return ops.length;
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
