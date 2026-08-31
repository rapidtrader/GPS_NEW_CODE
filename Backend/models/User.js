const mongoose = require('mongoose');
const { USER_MODULES } = require('../constants/modules');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    name: { type: String, trim: true, default: '' },
    phoneNumber: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    vehicleAccess: { type: [String], default: [] },
    moduleAccess: {
      type: [String],
      enum: USER_MODULES,
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
