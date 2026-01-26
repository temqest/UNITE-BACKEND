/**
 * Event Request Constants
 * 
 * Defines all constants used in the event request system
 */

// Request States
const REQUEST_STATES = Object.freeze({
  PENDING_REVIEW: 'pending-review',
  REVIEW_ACCEPTED: 'review-accepted',
  REVIEW_REJECTED: 'review-rejected',
  REVIEW_RESCHEDULED: 'review-rescheduled',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
});

// Request Actions
const REQUEST_ACTIONS = Object.freeze({
  VIEW: 'view',
  ACCEPT: 'accept',
  REJECT: 'reject',
  RESCHEDULE: 'reschedule',
  CONFIRM: 'confirm',
  DECLINE: 'decline',
  CANCEL: 'cancel',
  DELETE: 'delete',
  EDIT: 'edit',
  MANAGE_STAFF: 'manage-staff'
});

// Authority Tiers (matching AuthorityService)
const AUTHORITY_TIERS = Object.freeze({
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 30,
  BASIC_USER: 20
});

// Reviewer Assignment Rules
const ASSIGNMENT_RULES = Object.freeze({
  STAKEHOLDER_TO_COORDINATOR: 'stakeholder-to-coordinator',
  COORDINATOR_TO_ADMIN: 'coordinator-to-admin',
  ADMIN_TO_COORDINATOR: 'admin-to-coordinator',
  AUTO_ASSIGNED: 'auto-assigned',
  MANUAL: 'manual'
});

// Status Labels (generic, not role-specific)
const STATUS_LABELS = Object.freeze({
  [REQUEST_STATES.PENDING_REVIEW]: 'Waiting for Review',
  [REQUEST_STATES.REVIEW_ACCEPTED]: 'Review Accepted',
  [REQUEST_STATES.REVIEW_REJECTED]: 'Review Rejected',
  [REQUEST_STATES.REVIEW_RESCHEDULED]: 'Reschedule Proposed',
  [REQUEST_STATES.APPROVED]: 'Approved',
  [REQUEST_STATES.REJECTED]: 'Rejected',
  [REQUEST_STATES.COMPLETED]: 'Completed',
  [REQUEST_STATES.CANCELLED]: 'Cancelled'
});

module.exports = {
  REQUEST_STATES,
  REQUEST_ACTIONS,
  AUTHORITY_TIERS,
  ASSIGNMENT_RULES,
  STATUS_LABELS
};

