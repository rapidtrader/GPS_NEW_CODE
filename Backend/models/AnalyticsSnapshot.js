const mongoose = require('mongoose');

const analyticsSnapshotSchema = new mongoose.Schema(
  {
    startTime: { type: Number, required: true, index: true },
    endTime: { type: Number, required: true, index: true },
    ouidsKey: { type: String, required: true, index: true },
    ouids: [{ type: String }],
    ouid: { type: String, default: '' },
    distanceDTO: { type: mongoose.Schema.Types.Mixed },
    durationDTO: { type: mongoose.Schema.Types.Mixed },
    fuelConsumeDTO: { type: mongoose.Schema.Types.Mixed },
    fuelFillDTO: { type: mongoose.Schema.Types.Mixed },
    fuelTheftDTO: { type: mongoose.Schema.Types.Mixed },
    rawData: { type: mongoose.Schema.Types.Mixed, required: true },
    syncedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

analyticsSnapshotSchema.index({ startTime: 1, endTime: 1, ouidsKey: 1 }, { unique: true });

module.exports = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
