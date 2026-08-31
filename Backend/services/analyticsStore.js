const AnalyticsSnapshot = require('../models/AnalyticsSnapshot');
const AnalyticsHistory = require('../models/AnalyticsHistory');
const VehicleInfo = require('../models/VehicleInfo');

function buildOuidsKey(ouids = []) {
  return [...ouids].sort().join('|');
}

function toAnalyticsDoc({ startTime, endTime, ouids, ouid, data, userId }) {
  const ouidsKey = buildOuidsKey(ouids);
  return {
    startTime,
    endTime,
    ouidsKey,
    ouids,
    ouid: ouid || '',
    distanceDTO: data.distanceDTO,
    durationDTO: data.durationDTO,
    fuelConsumeDTO: data.fuelConsumeDTO,
    fuelFillDTO: data.fuelFillDTO,
    fuelTheftDTO: data.fuelTheftDTO,
    rawData: data,
    syncedBy: userId,
    syncedAt: new Date(),
  };
}

async function saveAnalyticsDashboard({ startTime, endTime, ouids, ouid, data, userId }) {
  const doc = toAnalyticsDoc({ startTime, endTime, ouids, ouid, data, userId });

  await Promise.all([
    AnalyticsSnapshot.findOneAndUpdate(
      { startTime, endTime, ouidsKey: doc.ouidsKey },
      { $set: doc },
      { upsert: true, new: true }
    ),
    AnalyticsHistory.create({
      ...doc,
      recordedAt: new Date(),
    }),
  ]);
}

async function getSavedAnalyticsDashboard({ startTime, endTime, ouids }) {
  const ouidsKey = buildOuidsKey(ouids);
  const row = await AnalyticsSnapshot.findOne({ startTime, endTime, ouidsKey }).lean();
  if (!row) return null;
  return row.rawData;
}

async function saveVehicleInfo(infoMap = {}) {
  const ops = Object.entries(infoMap).map(([ouid, info]) => {
    const doc = {
      ouid,
      vehicleNo: info.vehicleNo,
      type: info.type,
      alias: info.alias || '',
      mileage: info.mileage,
      rawData: info,
      syncedAt: new Date(),
    };

    return VehicleInfo.findOneAndUpdate({ ouid }, { $set: doc }, { upsert: true, new: true });
  });

  await Promise.all(ops);
}

async function getSavedVehicleInfo(user, filterFn) {
  const rows = await VehicleInfo.find().sort({ vehicleNo: 1 }).lean();
  const infoMap = Object.fromEntries(rows.map((row) => [row.ouid, row.rawData]));
  return filterFn ? filterFn(infoMap, user) : infoMap;
}

function filterRankList(list = [], allowedSet) {
  if (!allowedSet) return list || [];
  return (list || []).filter((item) => allowedSet.has(item.ouid));
}

function filterSnapshotForUser(snapshot, accessibleOuids) {
  if (!accessibleOuids) {
    return {
      distanceDTO: snapshot.distanceDTO,
      durationDTO: snapshot.durationDTO,
      fuelConsumeDTO: snapshot.fuelConsumeDTO,
      fuelFillDTO: snapshot.fuelFillDTO,
      fuelTheftDTO: snapshot.fuelTheftDTO,
    };
  }

  const allowed = new Set(accessibleOuids);
  return {
    distanceDTO: {
      ...snapshot.distanceDTO,
      top5Distance: filterRankList(snapshot.distanceDTO?.top5Distance, allowed),
      least5Distance: filterRankList(snapshot.distanceDTO?.least5Distance, allowed),
    },
    durationDTO: {
      ...snapshot.durationDTO,
      top5Durations: filterRankList(snapshot.durationDTO?.top5Durations, allowed),
      least5Durations: filterRankList(snapshot.durationDTO?.least5Durations, allowed),
    },
    fuelConsumeDTO: {
      ...snapshot.fuelConsumeDTO,
      topFuel: filterRankList(snapshot.fuelConsumeDTO?.topFuel, allowed),
      leastFuel: filterRankList(snapshot.fuelConsumeDTO?.leastFuel, allowed),
    },
    fuelFillDTO: {
      ...snapshot.fuelFillDTO,
      topFuel: filterRankList(snapshot.fuelFillDTO?.topFuel, allowed),
      leastFuel: filterRankList(snapshot.fuelFillDTO?.leastFuel, allowed),
    },
    fuelTheftDTO: {
      ...snapshot.fuelTheftDTO,
      topFuel: filterRankList(snapshot.fuelTheftDTO?.topFuel, allowed),
      leastFuel: filterRankList(snapshot.fuelTheftDTO?.leastFuel, allowed),
    },
  };
}

function canAccessSnapshot(snapshot, accessibleOuids) {
  if (!accessibleOuids) return true;
  return snapshot.ouids.every((id) => accessibleOuids.includes(id));
}

function findBestSnapshotForUser(rows, accessibleOuids) {
  if (!accessibleOuids) {
    const fleetWide = rows.reduce(
      (best, row) => (!best || row.ouids.length > best.ouids.length ? row : best),
      null
    );
    return fleetWide || rows[0] || null;
  }

  const userKey = buildOuidsKey(accessibleOuids);
  const exact = rows.find((row) => row.ouidsKey === userKey);
  if (exact) return exact;

  const subset = rows.find((row) => canAccessSnapshot(row, accessibleOuids));
  return subset || null;
}

async function listReportsForUser(user, filterFn) {
  const vehicles = await getSavedVehicleInfo(user, filterFn);
  const accessibleOuids = user.role === 'admin' ? null : Object.keys(vehicles);
  const rows = await AnalyticsSnapshot.find().sort({ syncedAt: -1 }).lean();

  const eligibleRows = user.role === 'admin'
    ? rows
    : rows.filter((row) => canAccessSnapshot(row, accessibleOuids));

  const snapshots = eligibleRows.map((row) => ({
    id: row._id.toString(),
    startTime: row.startTime,
    endTime: row.endTime,
    ouid: row.ouid || '',
    ouids: row.ouids || [],
    syncedAt: row.syncedAt,
    totalDistance: row.distanceDTO?.totalDistance ?? 0,
    totalDuration: row.durationDTO?.totalDuration ?? 0,
    vehicleCount: row.ouids?.length ?? 0,
  }));

  return { snapshots, vehicles, accessibleOuids };
}

async function getReportById(id, user, filterFn) {
  const row = await AnalyticsSnapshot.findById(id).lean();
  if (!row) return null;

  const vehicles = await getSavedVehicleInfo(user, filterFn);
  const accessibleOuids = user.role === 'admin' ? null : Object.keys(vehicles);
  if (!canAccessSnapshot(row, accessibleOuids)) return null;

  const filtered = filterSnapshotForUser(row, accessibleOuids);

  return {
    id: row._id.toString(),
    startTime: row.startTime,
    endTime: row.endTime,
    ouid: row.ouid || '',
    ouids: user.role === 'admin' ? row.ouids || [] : (accessibleOuids || []),
    syncedAt: row.syncedAt,
    ...filtered,
  };
}

async function getLatestReport(user, filterFn) {
  const { accessibleOuids } = await listReportsForUser(user, filterFn);
  const rows = await AnalyticsSnapshot.find().sort({ syncedAt: -1 }).lean();
  const best = findBestSnapshotForUser(rows, accessibleOuids);
  if (!best) return null;
  return getReportById(best._id.toString(), user, filterFn);
}

module.exports = {
  saveAnalyticsDashboard,
  getSavedAnalyticsDashboard,
  saveVehicleInfo,
  getSavedVehicleInfo,
  buildOuidsKey,
  listReportsForUser,
  getReportById,
  getLatestReport,
};
