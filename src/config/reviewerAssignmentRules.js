/**
 * Reviewer Assignment Rules Configuration
 * 
 * Defines configurable rules for assigning reviewers to requests based on
 * requester permissions and context. These rules are used by ReviewerAssignmentService.
 */

module.exports = {
  // Default rule for any request type
  default: {
    // Required permissions for reviewer
    requiredPermissions: ['request.review'],
    // Location scope requirement
    locationScope: 'same-or-parent', // Reviewer must be in same or parent location
    // Exclude requester from being assigned as reviewer
    excludeRequester: true,
    // Fallback reviewer role (if no one with permissions found)
    fallbackReviewer: 'system-admin'
  },

  // Event request specific rules
  eventRequest: {
    requiredPermissions: ['request.review', 'event.approve'],
    locationScope: 'same-or-parent',
    excludeRequester: true,
    // Permission-based priority: users with more permissions get higher priority
    priority: [
      { permissions: ['request.review', 'event.approve', '*'], weight: 1 }, // Highest priority: full access or both permissions
      { permissions: ['request.review', 'event.approve'], weight: 2 }, // High priority: both required permissions
      { permissions: ['request.review'], weight: 3 } // Lower priority: only review permission
    ],
    fallbackReviewer: 'system-admin' // Fallback role code (used for lookup, not logic)
  },

  // Blood bag request specific rules
  bloodBagRequest: {
    requiredPermissions: ['request.review'],
    locationScope: 'same',
    excludeRequester: true,
    fallbackReviewer: 'system-admin'
  }
};
