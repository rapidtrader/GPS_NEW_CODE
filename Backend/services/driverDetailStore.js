const DriverDetail = require('../models/DriverDetail');

function filterDriversByAccess(drivers = [], user) {
  if (user.role === 'admin') return drivers;
  if (!user.vehicleAccess?.length) return [];

  const allowed = new Set(user.vehicleAccess);
  return drivers.filter((row) => {
    if (!row.vehicleNo && !row.ouid) return false;
    return allowed.has(row.vehicleNo) || allowed.has(row.ouid);
  });
}

function toDriverDoc(row) {
  return {
    driverId: row.id,
    vehicleNo: row.vehicleNo || '',
    ouid: row.ouid || '',
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    transUsername: row.transUsername || '',
    clientUsername: row.clientUsername || '',
    enabled: row.enabled ?? false,
    assigned: row.assigned ?? false,
    phoneNo: row.phoneNo || '',
    rawData: row,
    syncedAt: new Date(),
  };
}

async function saveDriverDetails(drivers = []) {
  const ops = drivers.map((row) => {
    if (!row.id) return null;
    const doc = toDriverDoc(row);
    return DriverDetail.findOneAndUpdate(
      { driverId: doc.driverId },
      { $set: doc },
      { upsert: true, new: true }
    );
  });
  await Promise.all(ops.filter(Boolean));
}

async function getSavedDriverDetails(user) {
  const rows = await DriverDetail.find().sort({ firstName: 1, lastName: 1 }).lean();
  const drivers = rows.map((row) => row.rawData);
  return filterDriversByAccess(drivers, user);
}

module.exports = {
  filterDriversByAccess,
  saveDriverDetails,
  getSavedDriverDetails,
};
