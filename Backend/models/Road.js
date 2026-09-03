const mongoose = require('mongoose');

// GPS Point sub-schema — unlimited points, no fixed limit
const gpsPointSchema = new mongoose.Schema(
  {
    sequence: { type: Number, required: true },
    type: { type: String, enum: ['start', 'turn', 'end'], required: true },
    // GeoJSON order: [longitude, latitude]
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length === 2 &&
          arr[0] >= -180 && arr[0] <= 180 &&
          arr[1] >= -90  && arr[1] <= 90,
        message: 'coordinates must be [longitude, latitude] with valid ranges',
      },
    },
  },
  { _id: false }
);

// Sweeping frequency sub-schema
const sweepingFrequencySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['daily', 'alternate', 'specific'],
      required: true,
      default: 'daily',
    },
    // Used when type = 'alternate'
    startDate: { type: Date, default: null },
    // Used when type = 'specific' — e.g. ['monday', 'wednesday', 'friday']
    days: {
      type: [String],
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      default: [],
    },
  },
  { _id: false }
);

const roadSchema = new mongoose.Schema(
  {
    // Link to Project — projectId from Project collection
    projectId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },

    roadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    areaName: {
      type: String,
      required: true,
      trim: true,
    },

    colonyName: {
      type: String,
      required: true,
      trim: true,
    },

    roadName: {
      type: String,
      required: true,
      trim: true,
    },

    // Planned/master length in KM
    totalLength: {
      type: Number,
      required: true,
      min: [0.001, 'Total length must be greater than 0'],
    },

    // Pre-assign this road to a specific machine
    // Sweeping plan generator will always assign this road to this machine first
    assignedMachineId: {
      type: String,
      required: [true, 'Assigned machine is required'],
      trim: true,
    },

    sweepingFrequency: {
      type: sweepingFrequencySchema,
      required: true,
      default: () => ({ type: 'daily', days: [] }),
    },

    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },

    // Unlimited GPS points — Road GPS point sequence (NOT Machine Road sequence)
    gpsPoints: {
      type: [gpsPointSchema],
      default: [],
    },

    // Auto-generated GeoJSON LineString from gpsPoints
    // coordinates always in [longitude, latitude] order
    routeGeometry: {
      type: {
        type: String,
        enum: ['LineString'],
        default: 'LineString',
      },
      coordinates: {
        type: [[Number]],
        default: [],
      },
    },
  },
  { timestamps: true }
);

// Compound index for efficient project-level queries
roadSchema.index({ projectId: 1, status: 1 });

// Helper: auto-generate routeGeometry from gpsPoints
roadSchema.methods.rebuildRouteGeometry = function () {
  const sorted = [...this.gpsPoints].sort((a, b) => a.sequence - b.sequence);
  this.routeGeometry = {
    type: 'LineString',
    coordinates: sorted.map((p) => p.coordinates),
  };
};

module.exports = mongoose.model('Road', roadSchema);
