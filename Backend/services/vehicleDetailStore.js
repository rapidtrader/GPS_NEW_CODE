const VehicleDetail = require('../models/VehicleDetail');

function mergeWithVehicleInfo(details = [], infoMap = {}) {
  return details.map((row) => ({
    ...row,
    vehicleNo: infoMap[row.ouid]?.vehicleNo || row.vehicleNo || '',
  }));
}

function filterDetailsByAccess(details, user) {
  if (user.role === 'admin') return details;
  if (!user.vehicleAccess?.length) return [];

  const allowed = new Set(user.vehicleAccess);
  return details.filter(
    (row) => allowed.has(row.vehicleNo) || allowed.has(row.ouid)
  );
}

function toDetailDoc(row) {
  return {
    ouid: row.ouid,
    vehicleNo: row.vehicleNo || '',
    ownerName: row.ownerName || '',
    ownedBy: row.ownedBy || '',
    vehicleBrand: row.vehicleBrand || '',
    vehicleModel: row.vehicleModel || '',
    vehicleBody: row.vehicleBody || '',
    capacity: row.capacity ?? 0,
    manufactureDate: row.manufactureDate || '',
    purchaseDate: row.purchaseDate || '',
    clientUsername: row.clientUsername || '',
    expenseCost: row.expenseCost ?? null,
    maintainanceCost: row.maintainanceCost ?? null,
    vehicleUlip: row.vehicleUlip ?? null,
    rawData: row,
    syncedAt: new Date(),
  };
}

async function saveVehicleDetails(details = []) {
  const ops = details.map((row) => {
    const doc = toDetailDoc(row);
    return VehicleDetail.findOneAndUpdate(
      { ouid: doc.ouid },
      { $set: doc },
      { upsert: true, new: true }
    );
  });
  await Promise.all(ops);
}

async function getSavedVehicleDetails(user) {
  const rows = await VehicleDetail.find().sort({ vehicleNo: 1 }).lean();
  const details = rows.map((row) => ({
    ...row.rawData,
    vehicleNo: row.vehicleNo,
  }));
  return filterDetailsByAccess(details, user);
}

module.exports = {
  mergeWithVehicleInfo,
  filterDetailsByAccess,
  saveVehicleDetails,
  getSavedVehicleDetails,
};
