const mongoose = require('mongoose');

const vehicleRouteHistorySchema = new mongoose.Schema(
  {
    vehicleNo: { type: String, required: true, index: true },
    ouid: { type: String, index: true },
    latitude: Number,
    longitude: Number,
    speed: Number,
    added: Date,
    address: String,
    duration: Number,
    distance: Number,
    actualReceived: Date,
    status: String,
    fuel: Number,
    load: Number,
    temperature: Number,
    rawData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
    syncedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

vehicleRouteHistorySchema.index({ vehicleNo: 1, added: 1 });
vehicleRouteHistorySchema.index({ ouid: 1, added: 1 });

module.exports = mongoose.model('VehicleRouteHistory', vehicleRouteHistorySchema);
