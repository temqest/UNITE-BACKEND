const mongoose = require('mongoose');

const eventRequestSchema = new mongoose.Schema({
  Request_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  Event_ID: {
    type: String,
    required: true,
    trim: true,
    ref: 'Event'
  },
  // Simplified structure as requested
  coordinator_id: {
    type: String,
    required: true,
    trim: true,
    ref: 'Coordinator'
  },
  stakeholder_id: {
    type: String,
    required: false,
    trim: true,
    ref: 'Stakeholder'
  },
  made_by_id: {
    type: String,
    required: true,
    trim: true,
    refPath: 'made_by_role' // Dynamic reference based on role
  },
  made_by_role: {
    type: String,
    required: true,
    enum: ['SystemAdmin', 'Coordinator', 'Stakeholder']
  },
  // New hierarchical references to support Province -> District -> Municipality
  province: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Province',
    required: false
  },
  district: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'District',
    required: false
  },
  municipality: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Municipality',
    required: false
  },
  // Optional explicit stakeholder reference as ObjectId
  stakeholder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Stakeholder',
    required: false
  },
  // Category/type of the event (e.g., 'BloodDrive', 'Training', 'Advocacy')
  Category: {
    type: String,
    required: false,
    trim: true
  },
  Admin_ID: {
    type: String,
    trim: true,
    ref: 'SystemAdmin'
  },
  // Admin's decision
  AdminAction: {
    type: String,
    enum: ['Accepted', 'Rescheduled', 'Rejected', 'Cancelled', null],
    default: null
  },
  AdminNote: {
    type: String,
    trim: true,
    validate: {
      validator: function(note) {
        // If admin rescheduled, rejected, or cancelled, note is required
        if (this.AdminAction === 'Rescheduled' || this.AdminAction === 'Rejected' || this.AdminAction === 'Cancelled') {
          return note && note.trim().length > 0;
        }
        // If admin accepted, note is optional
        return true;
      },
      message: 'Note is required when admin reschedules, rejects, or cancels the request'
    }
  },
  // New date if admin rescheduled
  RescheduledDate: {
    type: Date,
    validate: {
      validator: function(date) {
        // RescheduledDate is required if AdminAction is 'Rescheduled'
        if (this.AdminAction === 'Rescheduled') {
          return date !== null && date !== undefined;
        }
        return true;
      },
      message: 'Rescheduled date is required when admin reschedules the request'
    }
  },
  AdminActionDate: {
    type: Date
  },
  // Coordinator's final decision after admin review
  CoordinatorFinalAction: {
    type: String,
    enum: ['Approved', 'Accepted', 'Rejected', 'Rescheduled', null],
    default: null
  },
  CoordinatorFinalActionDate: {
    type: Date
  },
  // Stakeholder's final confirmation after admin/coordinator review
  StakeholderFinalAction: {
    type: String,
    enum: ['Accepted', 'Rejected', 'Rescheduled', null],
    default: null
  },
  StakeholderNote: {
    type: String,
    trim: true,
    validate: {
      validator: function(note) {
        // If stakeholder rescheduled, note is required
        if (this.StakeholderFinalAction === 'Rescheduled') {
          return note && note.trim().length > 0;
        }
        // If stakeholder accepted or rejected, note is optional
        return true;
      },
      message: 'Note is required when stakeholder reschedules the request'
    }
  },
  StakeholderFinalActionDate: {
    type: Date
  },
  // Overall status tracking the workflow
  Status: {
    type: String,
    enum: [
      'Pending_Admin_Review',
      'Pending_Coordinator_Review',
      'Pending_Stakeholder_Review',
      'Accepted_By_Admin',
      'Rescheduled_By_Admin',
      'Rescheduled_By_Coordinator',
      'Rescheduled_By_Stakeholder',
      'Rejected_By_Admin',
      'Completed',
      'Rejected',
      'Cancelled'
    ],
    required: true,
    default: 'Pending_Admin_Review'
  },
  // For edit requests, store the original event data to show changes
  originalData: {
    type: Object,
    default: null
  }
}, {
  timestamps: true
});

// Pre-save hook to update status based on actions
eventRequestSchema.pre('save', function(next) {
  // Don't override if status is already set to a final state
  if (this.Status === 'Cancelled' || this.Status === 'Rejected') {
    return next();
  }

  // Update status based on admin action
  if (this.AdminAction && !this.CoordinatorFinalAction) {
    if (this.AdminAction === 'Accepted') {
      this.Status = 'Accepted_By_Admin';
    } else if (this.AdminAction === 'Rescheduled') {
      this.Status = 'Rescheduled_By_Admin';
    } else if (this.AdminAction === 'Rejected') {
      this.Status = 'Rejected_By_Admin';
    } else if (this.AdminAction === 'Cancelled') {
      this.Status = 'Cancelled';
    }
  }

  // Update status based on coordinator final action
  if (this.CoordinatorFinalAction) {
    if (this.CoordinatorFinalAction === 'Approved' || this.CoordinatorFinalAction === 'Accepted') {
      this.Status = 'Completed';
    } else if (this.CoordinatorFinalAction === 'Rejected') {
      this.Status = 'Rejected';
    } else if (this.CoordinatorFinalAction === 'Rescheduled') {
      this.Status = 'Rescheduled_By_Coordinator';
    }
  }

  // Update status based on stakeholder final action
  if (this.StakeholderFinalAction) {
    if (this.StakeholderFinalAction === 'Accepted') {
      this.Status = 'Completed';
    } else if (this.StakeholderFinalAction === 'Rejected') {
      this.Status = 'Rejected';
    } else if (this.StakeholderFinalAction === 'Rescheduled') {
      this.Status = 'Rescheduled_By_Stakeholder';
    }
  }

  // Set action dates
  if (this.AdminAction && !this.AdminActionDate) {
    this.AdminActionDate = new Date();
  }

  if (this.CoordinatorFinalAction && !this.CoordinatorFinalActionDate) {
    this.CoordinatorFinalActionDate = new Date();
  }

  if (this.StakeholderFinalAction && !this.StakeholderFinalActionDate) {
    this.StakeholderFinalActionDate = new Date();
  }

  next();
});

const EventRequest = mongoose.model('EventRequest', eventRequestSchema);

module.exports = EventRequest;

