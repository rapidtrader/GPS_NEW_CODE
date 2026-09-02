const mongoose = require('mongoose');

const workingHoursSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Working hours start must be in HH:MM format'],
    },
    end: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'Working hours end must be in HH:MM format'],
    },
  },
  { _id: false }
);

const machineSchema = new mongoose.Schema(
  {
    machineId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
    },

    machineName: {
      type: String,
      required: true,
      trim: true,
    },

    // Belongs to a Project — links via projectId string (same pattern as Road)
    projectId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    // Maximum sweeping capacity per working day in KM
    // Used later for Daily Sweeping Plan capacity validation
    sweepingKmPerDay: {
      type: Number,
      required: true,
      min: [0.001, 'Sweeping KM per day must be greater than 0'],
    },

    workingHours: {
      type: workingHoursSchema,
      required: true,
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient project-level queries
machineSchema.index({ projectId: 1, status: 1 });
// Unique vehicle number per project
machineSchema.index({ projectId: 1, vehicleNumber: 1 }, { unique: true });

module.exports = mongoose.model('Machine', machineSchema);
