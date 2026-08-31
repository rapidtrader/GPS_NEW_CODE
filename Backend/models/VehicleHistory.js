const mongoose = require('mongoose');

const vehicleHistorySchema = new mongoose.Schema(
  {
    ouid: { type: String, required: true, index: true },
    vehicleNo: String,
    state: String,
    address: String,
    odometer: Number,
    latitude: Number,
    longitude: Number,
    battery: Number,
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VehicleHistory', vehicleHistorySchema);
