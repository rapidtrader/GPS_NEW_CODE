const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    projectName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
    settings: {
      sweepingSpeedLimit: {
        type: Number,
        default: 8,
        min: 0,
      },
      completionThreshold: {
        type: Number,
        default: 90,
        min: 0,
        max: 100,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
