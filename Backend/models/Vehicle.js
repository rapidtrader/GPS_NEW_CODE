const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema(
  {
    ouid: { type: String, required: true, unique: true, index: true },
    vehicleNo: String,
    alias: String,
    state: String,
    address: String,
    vehicleType: String,
    deviceType: String,
    odometer: Number,
    mileage: Number,
    vehicleStatus: String,
    lastUpdate: String,
    since: String,
    latitude: Number,
    longitude: Number,
    battery: Number,
    gsmSignals: Number,
    satellites: Number,
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Vehicle', vehicleSchema);
