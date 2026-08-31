const mongoose = require('mongoose');

const driverDetailSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true, unique: true, index: true },
    vehicleNo: String,
    ouid: String,
    firstName: String,
    lastName: String,
    transUsername: String,
    clientUsername: String,
    enabled: { type: Boolean, default: false },
    assigned: { type: Boolean, default: false },
    phoneNo: String,
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DriverDetail', driverDetailSchema);
