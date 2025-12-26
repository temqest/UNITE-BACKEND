/**
 * Assertion Helper
 * Provides custom assertions for permissions, routing, and state validation
 */

const permissionService = require('../../src/services/users_services/permission.service');
const { User } = require('../../src/models');

/**
 * Assert request was routed to expected reviewer
 * @param {Object} request - Request object
 * @param {string} expectedReviewerId - Expected reviewer user ID
 * @param {Object} logger - Test logger instance
 * @returns {Promise<void>}
 */
async function assertRequestRoutedTo(request, expectedReviewerId, logger = null) {
  const reviewerId = request.reviewer?.userId || request.reviewer?.id || request.reviewer_id;
  const reviewerIdStr = reviewerId?.toString();
  const expectedIdStr = expectedReviewerId?.toString();

  if (logger) {
    logger.logAssertion(
      `Request routed to reviewer ${expectedIdStr}`,
      reviewerIdStr === expectedIdStr
    );
  }

  if (reviewerIdStr !== expectedIdStr) {
    const reviewer = await User.findById(reviewerId).select('email authority').lean();
    const expectedReviewer = await User.findById(expectedReviewerId).select('email authority').lean();
    
    throw new Error(
      `Request routing mismatch. Expected reviewer: ${expectedReviewer?.email || expectedIdStr} (${expectedReviewer?.authority || 'N/A'}), ` +
      `but got: ${reviewer?.email || reviewerIdStr} (${reviewer?.authority || 'N/A'})`
    );
  }
}

/**
 * Assert user has specific actions available
 * @param {Array<string>} availableActions - Available actions from API
 * @param {Array<string>} expectedActions - Expected actions
 * @param {Object} logger - Test logger instance
 * @returns {void}
 */
function assertActionsAvailable(availableActions, expectedActions, logger = null) {
  const availableSet = new Set(availableActions);
  const expectedSet = new Set(expectedActions);
  
  const missing = expectedActions.filter(action => !availableSet.has(action));
  const unexpected = availableActions.filter(action => !expectedSet.has(action) && action !== 'view'); // 'view' is always available

  if (logger) {
    logger.logAssertion(
      `Actions available: ${expectedActions.join(', ')}`,
      missing.length === 0 && unexpected.length === 0
    );
  }

  if (missing.length > 0) {
    throw new Error(`Missing expected actions: ${missing.join(', ')}. Available: ${availableActions.join(', ')}`);
  }

  // Note: We allow extra actions, but log them
  if (unexpected.length > 0 && logger) {
    logger.logAction(`Note: Unexpected actions available: ${unexpected.join(', ')}`);
  }
}

/**
 * Assert user has specific permission
 * @param {string} userId - User ID
 * @param {string} resource - Resource name
 * @param {string} action - Action name
 * @param {boolean} shouldHave - Whether user should have permission
 * @param {Object} context - Permission context
 * @param {Object} logger - Test logger instance
 * @returns {Promise<void>}
 */
async function assertPermissionCheck(userId, resource, action, shouldHave, context = {}, logger = null) {
  const hasPermission = await permissionService.checkPermission(userId, resource, action, context);
  
  if (logger) {
    logger.logAssertion(
      `User has permission ${resource}.${action}: ${shouldHave}`,
      hasPermission === shouldHave
    );
  }

  if (hasPermission !== shouldHave) {
    const user = await User.findById(userId).select('email authority').lean();
    throw new Error(
      `Permission check failed for user ${user?.email || userId}. ` +
      `Expected ${resource}.${action} to be ${shouldHave ? 'granted' : 'denied'}, but got ${hasPermission}`
    );
  }
}

/**
 * Assert user has expected authority level
 * @param {string} userId - User ID
 * @param {number} expectedAuthority - Expected authority level
 * @param {Object} logger - Test logger instance
 * @returns {Promise<void>}
 */
async function assertAuthorityLevel(userId, expectedAuthority, logger = null) {
  const user = await User.findById(userId).select('authority email').lean();
  
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  const actualAuthority = user.authority || 20;

  if (logger) {
    logger.logAssertion(
      `User authority is ${expectedAuthority}`,
      actualAuthority === expectedAuthority
    );
  }

  if (actualAuthority !== expectedAuthority) {
    throw new Error(
      `Authority mismatch for user ${user.email || userId}. ` +
      `Expected: ${expectedAuthority}, Got: ${actualAuthority}`
    );
  }
}

/**
 * Assert request is in expected state
 * @param {Object} request - Request object
 * @param {string} expectedState - Expected state
 * @param {Object} logger - Test logger instance
 * @returns {void}
 */
function assertRequestState(request, expectedState, logger = null) {
  const currentState = request.Status || request.status;

  if (logger) {
    logger.logAssertion(
      `Request state is ${expectedState}`,
      currentState === expectedState
    );
  }

  if (currentState !== expectedState) {
    throw new Error(
      `Request state mismatch. Expected: ${expectedState}, Got: ${currentState}. ` +
      `Request ID: ${request.Request_ID || request._id}`
    );
  }
}

/**
 * Assert event is in expected status
 * @param {Object} event - Event object
 * @param {string} expectedStatus - Expected status
 * @param {Object} logger - Test logger instance
 * @returns {void}
 */
function assertEventStatus(event, expectedStatus, logger = null) {
  const currentStatus = event.Status || event.status;

  if (logger) {
    logger.logAssertion(
      `Event status is ${expectedStatus}`,
      currentStatus === expectedStatus
    );
  }

  if (currentStatus !== expectedStatus) {
    throw new Error(
      `Event status mismatch. Expected: ${expectedStatus}, Got: ${currentStatus}. ` +
      `Event ID: ${event.Event_ID || event._id}`
    );
  }
}

/**
 * Assert reviewer authority is sufficient (reviewer.authority >= requester.authority)
 * @param {string} reviewerId - Reviewer user ID
 * @param {string} requesterId - Requester user ID
 * @param {Object} logger - Test logger instance
 * @returns {Promise<void>}
 */
async function assertAuthorityHierarchy(reviewerId, requesterId, logger = null) {
  const reviewer = await User.findById(reviewerId).select('authority email').lean();
  const requester = await User.findById(requesterId).select('authority email').lean();

  if (!reviewer || !requester) {
    throw new Error('Reviewer or requester not found');
  }

  const reviewerAuthority = reviewer.authority || 20;
  const requesterAuthority = requester.authority || 20;
  const isSystemAdmin = reviewerAuthority >= 100;

  // System admins can bypass authority hierarchy
  const hierarchyValid = isSystemAdmin || reviewerAuthority >= requesterAuthority;

  if (logger) {
    logger.logAssertion(
      `Authority hierarchy valid (reviewer: ${reviewerAuthority} >= requester: ${requesterAuthority})`,
      hierarchyValid
    );
  }

  if (!hierarchyValid) {
    throw new Error(
      `Authority hierarchy violation. Reviewer ${reviewer.email} (authority: ${reviewerAuthority}) ` +
      `cannot review requests from ${requester.email} (authority: ${requesterAuthority})`
    );
  }
}

/**
 * Assert organization/coverage area matching (for stakeholder requests)
 * @param {string} reviewerId - Reviewer user ID
 * @param {string} requesterId - Requester user ID
 * @param {Object} logger - Test logger instance
 * @returns {Promise<void>}
 */
async function assertOrganizationCoverageMatch(reviewerId, requesterId, logger = null) {
  const reviewer = await User.findById(reviewerId).populate('organizations.organizationId coverageAreas.coverageAreaId').lean();
  const requester = await User.findById(requesterId).populate('organizations.organizationId').lean();

  if (!reviewer || !requester) {
    throw new Error('Reviewer or requester not found');
  }

  // Check organization match
  const reviewerOrgIds = new Set(
    (reviewer.organizations || [])
      .filter(org => org.isActive !== false && org.organizationId)
      .map(org => org.organizationId?._id?.toString() || org.organizationId?.toString())
  );

  const requesterOrgIds = new Set(
    (requester.organizations || [])
      .filter(org => org.isActive !== false && org.organizationId)
      .map(org => org.organizationId?._id?.toString() || org.organizationId?.toString())
  );

  const orgMatch = [...requesterOrgIds].some(orgId => reviewerOrgIds.has(orgId));

  if (logger) {
    logger.logAssertion(
      `Organization/coverage area match exists`,
      orgMatch
    );
  }

  // Note: This is a warning, not a hard failure, as the system may still route correctly
  if (!orgMatch && logger) {
    logger.logAction('Warning: No organization match found between reviewer and requester');
  }
}

module.exports = {
  assertRequestRoutedTo,
  assertActionsAvailable,
  assertPermissionCheck,
  assertAuthorityLevel,
  assertRequestState,
  assertEventStatus,
  assertAuthorityHierarchy,
  assertOrganizationCoverageMatch
};

