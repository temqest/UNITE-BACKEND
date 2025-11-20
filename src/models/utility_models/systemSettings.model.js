const mongoose = require('mongoose');

const SystemSettingsSchema = new mongoose.Schema({
  notificationsEnabled: { type: Boolean, default: true },
  maxBloodBagsPerDay: { type: Number, default: 200 },
  maxEventsPerDay: { type: Number, default: 3 },
  allowWeekendEvents: { type: Boolean, default: false },
  advanceBookingDays: { type: Number, default: 30 },
  maxPendingRequests: { type: Number, default: 1 },
  preventOverlappingRequests: { type: Boolean, default: true },
  preventDoubleBooking: { type: Boolean, default: false },
  allowCoordinatorStaffAssignment: { type: Boolean, default: false },
  requireStaffAssignment: { type: Boolean, default: false },
  blockedWeekdays: { type: [Number], default: [] }, // 0..6 (Sun..Sat)
  blockedDates: { type: [String], default: [] }, // ISO date strings (YYYY-MM-DD)
  reviewAutoExpireHours: { type: Number, default: 72 },
  reviewConfirmationWindowHours: { type: Number, default: 48 },
  notifyCounterpartAdmins: { type: Boolean, default: true }
}, { timestamps: true });

// We'll keep a single document storing global settings. Use model name 'SystemSettings'.
module.exports = mongoose.models.SystemSettings || mongoose.model('SystemSettings', SystemSettingsSchema);
