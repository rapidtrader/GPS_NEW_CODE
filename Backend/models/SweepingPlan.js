const mongoose = require('mongoose');

// One road entry in a machine's daily plan
// NOTE: sequence here = Machine Daily Road Sequence (NOT GPS Point Sequence inside a road)
const planRoadSchema = new mongoose.Schema(
  {
    roadId:     { type: String, required: true, trim: true },
    roadName:   { type: String, trim: true },    // denormalized for display speed
    areaName:   { type: String, trim: true },
    colonyName: { type: String, trim: true },
    // Machine Daily Road Sequence — starts at 1 per machine per day
    sequence:   { type: Number, required: true, min: 1 },
    plannedKm:  { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const sweepingPlanSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true, trim: true },

    // Stored as YYYY-MM-DD string for timezone-safe date comparison
    planDate: { type: String, required: true, index: true },

    machineId:   { type: String, required: true, index: true, trim: true },
    machineName: { type: String, trim: true },    // denormalized
    vehicleNumber: { type: String, trim: true },  // denormalized

    // Machine capacity snapshot at plan creation time
    capacityKm: { type: Number, required: true, min: 0 },

    // Calculated totals
    totalPlannedKm:  { type: Number, default: 0 },
    capacityExceeded: { type: Boolean, default: false },

    // Machine Daily Road Sequence list
    roads: { type: [planRoadSchema], default: [] },

    // Plan status — future GPS tracking will update this
    status: {
      type: String,
      enum: ['planned', 'in_progress', 'completed', 'cancelled'],
      default: 'planned',
    },

    // Future fields for GPS tracking compatibility:
    // actualKm, completionPercent, missedKm — not populated yet
  },
  { timestamps: true }
);

// Compound unique index: one plan per project + date + machine
sweepingPlanSchema.index({ projectId: 1, planDate: 1, machineId: 1 }, { unique: true });
sweepingPlanSchema.index({ projectId: 1, planDate: 1 });
sweepingPlanSchema.index({ machineId: 1, planDate: 1 });

module.exports = mongoose.model('SweepingPlan', sweepingPlanSchema);
