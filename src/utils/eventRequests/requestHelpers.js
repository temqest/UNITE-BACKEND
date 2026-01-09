/**
 * Event Request Helpers
 * 
 * Utility functions for event requests
 */

const { STATUS_LABELS } = require('./requestConstants');

/**
 * Format request status label
 * @param {string} status - Request status
 * @returns {string} Formatted status label
 */
function formatStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * Check if request is in pending state
 * @param {string} status - Request status
 * @returns {boolean} True if pending
 */
function isPending(status) {
  return status === 'pending-review' || status === 'review-rescheduled';
}

/**
 * Check if request is approved
 * @param {string} status - Request status
 * @returns {boolean} True if approved
 */
function isApproved(status) {
  return status === 'approved';
}

/**
 * Check if request is rejected
 * @param {string} status - Request status
 * @returns {boolean} True if rejected
 */
function isRejected(status) {
  return status === 'rejected';
}

/**
 * Check if request is completed
 * @param {string} status - Request status
 * @returns {boolean} True if completed
 */
function isCompleted(status) {
  return status === 'completed';
}

module.exports = {
  formatStatusLabel,
  isPending,
  isApproved,
  isRejected,
  isCompleted
};

