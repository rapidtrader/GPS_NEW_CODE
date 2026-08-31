const Vehicle = require('../models/Vehicle');
const VehicleHistory = require('../models/VehicleHistory');

function parseLocation(pLoc) {
  if (Array.isArray(pLoc)) return { lat: pLoc[1], lng: pLoc[0] };
  if (typeof pLoc === 'string') {
    const [lng, lat] = pLoc.split(' ').map(Number);
    return { lat: lat || null, lng: lng || null };
  }
  return { lat: null, lng: null };
}

function toVehicleDoc(v) {
  const meta = v.terminalPacketMeta || {};
  const { lat, lng } = parseLocation(meta.pLoc);

  return {
    ouid: v.ouid,
    vehicleNo: v.vehicleNo,
    alias: v.alias || '',
    state: v.state,
    address: v.address || '',
    vehicleType: v.vehicleType,
    deviceType: v.deviceType,
    odometer: v.odometer,
    mileage: v.mileage,
    vehicleStatus: v.vehicleStatus,
    lastUpdate: v.lu,
    since: v.since,
    latitude: lat,
    longitude: lng,
    battery: meta.battery ?? null,
    gsmSignals: meta.gsmSignals ?? null,
    satellites: meta.satellites ?? null,
    rawData: v,
    syncedAt: new Date(),
  };
}

async function saveVehicles(vehicles) {
  const ops = vehicles.map((v) => {
    const doc = toVehicleDoc(v);
    return Vehicle.findOneAndUpdate(
      { ouid: doc.ouid },
      { $set: doc },
      { upsert: true, new: true }
    );
  });

  const historyDocs = vehicles.map((v) => {
    const doc = toVehicleDoc(v);
    return VehicleHistory.create({
      ouid: doc.ouid,
      vehicleNo: doc.vehicleNo,
      state: doc.state,
      address: doc.address,
      odometer: doc.odometer,
      latitude: doc.latitude,
      longitude: doc.longitude,
      battery: doc.battery,
      speed: doc.mileage ?? v.mileage ?? null,
      rawData: v,
    });
  });

  await Promise.all([...ops, ...historyDocs]);
}

async function getAllVehicles() {
  const rows = await Vehicle.find().sort({ vehicleNo: 1 }).lean();
  return rows.map((row) => row.rawData);
}

async function getVehicleOptions() {
  const rows = await Vehicle.find({}, 'ouid vehicleNo vehicleType alias').sort({ vehicleNo: 1 }).lean();
  return rows.map((row) => ({
    ouid: row.ouid,
    vehicleNo: row.vehicleNo,
    vehicleType: row.vehicleType,
    alias: row.alias || '',
  }));
}

async function getVehiclesForUser(user) {
  if (user.role === 'admin') {
    return getAllVehicles();
  }
  if (!user.vehicleAccess?.length) {
    return [];
  }
  const rows = await Vehicle.find({
    vehicleNo: { $in: user.vehicleAccess },
  })
    .sort({ vehicleNo: 1 })
    .lean();
  return rows.map((row) => row.rawData);
}

function filterVehiclesByAccess(vehicles, user) {
  if (user.role === 'admin') return vehicles;
  if (!user.vehicleAccess?.length) return [];
  const allowed = new Set(user.vehicleAccess);
  return vehicles.filter((v) => allowed.has(v.vehicleNo) || allowed.has(v.ouid));
}

module.exports = {
  saveVehicles,
  getAllVehicles,
  getVehiclesForUser,
  getVehicleOptions,
  filterVehiclesByAccess,
};
