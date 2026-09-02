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

    // Live GPS snapshot — updated every time /api/gps/live is called.
    // Source: vehicleroutehistories collection (latest record per vehicleNumber).
    // Read-only from API perspective — do NOT accept in POST/PUT body.
    liveGps: {
      latitude:     { type: Number, default: null },
      longitude:    { type: Number, default: null },
      speed:        { type: Number, default: null },
      ignition:     { type: Boolean, default: null },
      status:       { type: String,  default: null },  // raw GPS status string e.g. "Ignition on"
      address:      { type: String,  default: null },
      gpsTimestamp: { type: Date,    default: null },  // actual GPS event time (added field)
      gpsUpdatedAt: { type: Date,    default: null },  // when snapshot was last written
      gpsAvailable: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient project-level queries
machineSchema.index({ projectId: 1, status: 1 });
// Unique vehicle number per project
machineSchema.index({ projectId: 1, vehicleNumber: 1 }, { unique: true });

module.exports = mongoose.model('Machine', machineSchema);
