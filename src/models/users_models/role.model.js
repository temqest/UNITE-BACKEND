const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  },
  isSystemRole: {
    type: Boolean,
    default: false
  },
  permissions: [{
    resource: {
      type: String,
      required: true,
      trim: true
    },
    actions: [{
      type: String,
      required: true,
      trim: true
    }]
  }]
}, {
  timestamps: true
});

// Index for faster lookups
roleSchema.index({ code: 1 }, { unique: true });
roleSchema.index({ isSystemRole: 1 });

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
