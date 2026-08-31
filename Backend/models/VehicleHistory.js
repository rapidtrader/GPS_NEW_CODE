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
    speed: Number,
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    recordedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

vehicleHistorySchema.index({ ouid: 1, recordedAt: 1 });
vehicleHistorySchema.index({ recordedAt: 1 });

module.exports = mongoose.model('VehicleHistory', vehicleHistorySchema);
