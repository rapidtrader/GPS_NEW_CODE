const mongoose = require('mongoose');

const vehicleInfoSchema = new mongoose.Schema(
  {
    ouid: { type: String, required: true, unique: true, index: true },
    vehicleNo: String,
    type: String,
    alias: String,
    mileage: Number,
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VehicleInfo', vehicleInfoSchema);
