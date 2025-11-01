const mongoose = require('mongoose');

const systemAdminSchema = new mongoose.Schema({
  Admin_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    ref: 'BloodbankStaff'
  },
  AccessLevel: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

const SystemAdmin = mongoose.model('SystemAdmin', systemAdminSchema);

module.exports = SystemAdmin;

