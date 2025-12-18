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
    // Optional priority order for role selection (if multiple users have permissions)
    priority: ['system-admin', 'coordinator'],
    fallbackReviewer: 'system-admin'
  },

  // Blood bag request specific rules
  bloodBagRequest: {
    requiredPermissions: ['request.review'],
    locationScope: 'same',
    excludeRequester: true,
    fallbackReviewer: 'system-admin'
  }
};
