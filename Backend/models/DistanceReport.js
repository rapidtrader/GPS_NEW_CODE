const mongoose = require('mongoose');

const distanceReportSchema = new mongoose.Schema(
  {
    ouid: { type: String, required: true, index: true },
    vehicleNo: { type: String, required: true, index: true },
    vehicleAlias: String,
    reportDate: { type: Date, required: true, index: true }, // Date for which report is for
    totalDistance: { type: Number, default: 0 }, // Total distance for that day
    dayWiseData: [
      {
        date: String, // Format: "01/08/2026"
        distance: Number,
      },
    ],
    rawData: mongoose.Schema.Types.Mixed,
    syncedAt: { type: Date, default: Date.now },
    syncedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Unique index on ouid + reportDate to prevent duplicates
distanceReportSchema.index({ ouid: 1, reportDate: 1 }, { unique: true });

module.exports = mongoose.model('DistanceReport', distanceReportSchema);
