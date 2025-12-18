const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
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
  resource: {
    type: String,
    required: true,
    trim: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster lookups
permissionSchema.index({ code: 1 }, { unique: true });
permissionSchema.index({ resource: 1, action: 1 });

const Permission = mongoose.model('Permission', permissionSchema);

module.exports = Permission;
