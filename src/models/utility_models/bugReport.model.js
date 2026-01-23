const mongoose = require('mongoose');

/**
 * BugReport Model
 * 
 * Stores bug reports submitted by authenticated users
 * Images are stored in AWS S3, with keys stored in this model
 */
const bugReportSchema = new mongoose.Schema({
  Report_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Reporter Information
  Reporter_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  Reporter_Name: {
    type: String,
    required: true,
    trim: true
  },
  
  Reporter_Email: {
    type: String,
    required: true,
    trim: true
  },
  
  // Bug Details
  Description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000
  },
  
  // S3 Image Keys (array of objects with key and metadata)
  Image_Keys: [{
    key: {
      type: String,
      required: true,
      trim: true
    },
    filename: {
      type: String,
      required: true,
      trim: true
    },
    contentType: {
      type: String,
      required: false,
      trim: true
    },
    size: {
      type: Number,
      required: false
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Status tracking
  Status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed', 'Cannot Reproduce'],
    default: 'Open',
    index: true
  },
  
  // Priority (optional, can be set by admins)
  Priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Critical'],
    default: 'Medium'
  },
  
  // Admin notes (for internal tracking)
  Admin_Notes: {
    type: String,
    trim: true,
    maxlength: 5000
  },
  
  // Assigned admin (optional)
  Assigned_To: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Resolution tracking
  Resolved_At: {
    type: Date,
    required: false
  },
  
  Resolved_By: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  
  // Browser/Device info (optional, for debugging)
  User_Agent: {
    type: String,
    trim: true
  },
  
  Page_URL: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
bugReportSchema.index({ Status: 1, createdAt: -1 });
bugReportSchema.index({ Reporter_ID: 1, createdAt: -1 });
bugReportSchema.index({ createdAt: -1 });
bugReportSchema.index({ Priority: 1, Status: 1 });

// Virtual for time elapsed
bugReportSchema.virtual('age').get(function() {
  const now = new Date();
  const created = this.createdAt;
  const diff = now.getTime() - created.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return 'Less than 1 hour ago';
});

// Method to mark as resolved
bugReportSchema.methods.markAsResolved = function(resolvedBy) {
  this.Status = 'Resolved';
  this.Resolved_At = new Date();
  this.Resolved_By = resolvedBy;
  return this.save();
};

// Method to assign to admin
bugReportSchema.methods.assignTo = function(adminId) {
  this.Assigned_To = adminId;
  return this.save();
};

// Static method to count open reports
bugReportSchema.statics.countOpen = function() {
  return this.countDocuments({ Status: { $in: ['Open', 'In Progress'] } });
};

// Static method to get recent reports
bugReportSchema.statics.getRecent = function(limit = 10) {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('Reporter_ID', 'firstName lastName email')
    .populate('Assigned_To', 'firstName lastName email')
    .populate('Resolved_By', 'firstName lastName email');
};

const BugReport = mongoose.model('BugReport', bugReportSchema);

module.exports = BugReport;
