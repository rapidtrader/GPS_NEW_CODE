const mongoose = require('mongoose');

const vehicleDetailSchema = new mongoose.Schema(
  {
    ouid: { type: String, required: true, unique: true, index: true },
    vehicleNo: String,
    ownerName: String,
    ownedBy: String,
    vehicleBrand: String,
    vehicleModel: String,
    vehicleBody: String,
    capacity: Number,
    manufactureDate: String,
    purchaseDate: String,
    clientUsername: String,
    expenseCost: { type: Number, default: null },
    maintainanceCost: { type: Number, default: null },
    vehicleUlip: { type: String, default: null },
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VehicleDetail', vehicleDetailSchema);
