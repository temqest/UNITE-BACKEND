/**
 * Coordinator → Admin Flow Tests
 * Tests request creation by coordinator, routing to admin, and admin review actions
 */

const request = require('supertest');
const app = require('../../server');
const TestLogger = require('../helpers/logger');
const {
  createRequest,
  getRequest,
  getAvailableActions,
  executeReviewAction,
  confirmDecision,
  waitForStateChange
} = require('../helpers/requestHelper');
const {
  assertRequestRoutedTo,
  assertActionsAvailable,
  assertPermissionCheck,
  assertAuthorityLevel,
  assertRequestState,
  assertAuthorityHierarchy
} = require('../helpers/assertionHelper');
const { getUserToken, getUserIdByEmail } = require('../setup/authHelper');
const testData = require('../setup/testData');
const { User } = require('../../src/models');
const permissionService = require('../../src/services/users_services/permission.service');

describe('Coordinator → Admin Flow', () => {
  let coordinatorToken, adminToken;
  let coordinatorId, adminId;
  let logger;
  let createdRequest;

  beforeAll(async () => {
    logger = new TestLogger('Coordinator → Admin');
    logger.logFlowStart();

    // Get user IDs
    coordinatorId = await getUserIdByEmail(testData.users.coordinator.email);
    adminId = await getUserIdByEmail(testData.users.admin.email);

    // Generate tokens
    coordinatorToken = getUserToken(coordinatorId, testData.users.coordinator.email);
    adminToken = getUserToken(adminId, testData.users.admin.email);

    // Verify user authorities
    await assertAuthorityLevel(coordinatorId, testData.users.coordinator.authority, logger);
    await assertAuthorityLevel(adminId, testData.users.admin.authority, logger);
  });

  test('1. Coordinator creates request', async () => {
    logger.logActor(
      testData.users.coordinator.email,
      testData.users.coordinator.authority,
      await permissionService.getUserPermissions(coordinatorId)
    );

    // Verify coordinator has request.create permission
    await assertPermissionCheck(
      coordinatorId,
      'request',
      'create',
      true,
      {},
      logger
    );

    logger.logAction('Creating request as coordinator');

    // Create request (should route to admin)
    const requestPayload = {
      ...testData.requestPayloads.coordinator(20) // Unique day: +20 days (Day 30)
      // Don't specify reviewer - should auto-route to admin
    };

    createdRequest = await createRequest(app, coordinatorToken, requestPayload);

    expect(createdRequest).toBeDefined();
    expect(createdRequest.requestId || createdRequest.Request_ID || createdRequest._id).toBeDefined();

    logger.logAction(`Created request ${createdRequest.requestId || createdRequest.Request_ID || createdRequest._id}`);

    // Verify request is in pending-review state
    assertRequestState(createdRequest, 'pending-review', logger);

    // Verify request was routed to admin (authority >= 80)
    const reviewerId = createdRequest.reviewer?.userId || createdRequest.reviewer?.id || createdRequest.reviewer_id;
    const reviewer = await User.findById(reviewerId).select('authority email').lean();
    
    expect(reviewer).toBeDefined();
    expect(reviewer.authority).toBeGreaterThanOrEqual(80);
    
    logger.logRouting(reviewer.email, reviewer.authority);

    // Verify admin has request.review permission
    const context = { locationId: createdRequest.district || createdRequest.location?.district };
    await assertPermissionCheck(
      reviewer._id,
      'request',
      'review',
      true,
      context,
      logger
    );

    // Verify authority hierarchy
    await assertAuthorityHierarchy(reviewer._id, coordinatorId, logger);

    logger.logResult('Request created and routed to admin successfully');
  });

  test('2. Admin receives request with correct actions', async () => {
    const requestId = createdRequest.requestId || createdRequest.Request_ID || createdRequest._id;
    const reviewerId = createdRequest.reviewer?.userId || createdRequest.reviewer?.id || createdRequest.reviewer_id;

    logger.logActor(
      testData.users.admin.email,
      testData.users.admin.authority,
      await permissionService.getUserPermissions(reviewerId)
    );

    // Fetch request as admin
    const request = await getRequest(app, adminToken, requestId);
    expect(request).toBeDefined();

    // Get available actions
    const availableActions = await getAvailableActions(app, adminToken, requestId);
    logger.logActions(availableActions);

    // Expected actions for admin in pending-review state
    const expectedActions = ['view', 'accept', 'reject', 'reschedule'];
    assertActionsAvailable(availableActions, expectedActions, logger);

    // Verify permissions
    const context = { locationId: request.district || request.location?.district };
    await assertPermissionCheck(reviewerId, 'request', 'review', true, context, logger);
    await assertPermissionCheck(reviewerId, 'request', 'approve', true, context, logger);
    await assertPermissionCheck(reviewerId, 'request', 'reject', true, context, logger);
    await assertPermissionCheck(reviewerId, 'request', 'reschedule', true, context, logger);

    logger.logResult('Admin has correct actions and permissions');
  });

  test('3. Admin accepts → Request published', async () => {
    const requestId = createdRequest.requestId || createdRequest.Request_ID || createdRequest._id;

    logger.logAction('Admin accepting request');

    // Execute accept action
    const acceptedRequest = await executeReviewAction(
      app,
      adminToken,
      requestId,
      'accept',
      { notes: 'Admin acceptance' }
    );

    // Verify state transition
    assertRequestState(acceptedRequest, 'review-accepted', logger);
    logger.logTransition('pending-review', 'review-accepted');

    // Requester (coordinator) confirms
    logger.logAction('Coordinator confirming acceptance');
    const confirmedRequest = await confirmDecision(
      app,
      coordinatorToken,
      requestId,
      'confirm',
      { notes: 'Confirmed' }
    );

    // Verify final state
    assertRequestState(confirmedRequest, 'approved', logger);
    logger.logTransition('review-accepted', 'approved');

    logger.logResult('Accept → Publish flow completed successfully');
  });

  test('4. Admin rejects → Request finalized', async () => {
    // Create a new request for rejection test
    logger.logAction('Creating new request for rejection test');
    const requestPayload = {
      ...testData.requestPayloads.coordinator(21), // Unique day: +21 days (Day 31)
      Event_Title: 'Test Admin Rejection Request'
    };

    const newRequest = await createRequest(app, coordinatorToken, requestPayload);
    const requestId = newRequest.requestId || newRequest.Request_ID || newRequest._id;

    logger.logAction(`Admin rejecting request ${requestId}`);

    // Execute reject action
    const rejectedRequest = await executeReviewAction(
      app,
      adminToken,
      requestId,
      'reject',
      { notes: 'Admin rejection' }
    );

    // Verify state transition
    assertRequestState(rejectedRequest, 'review-rejected', logger);
    logger.logTransition('pending-review', 'review-rejected');

    // Requester confirms rejection
    logger.logAction('Coordinator confirming rejection');
    const finalizedRequest = await confirmDecision(
      app,
      coordinatorToken,
      requestId,
      'confirm',
      { notes: 'Confirmed rejection' }
    );

    // Verify final state
    assertRequestState(finalizedRequest, 'rejected', logger);
    logger.logTransition('review-rejected', 'rejected');

    logger.logResult('Reject → Finalized flow completed successfully');
  });

  test('5. Admin reschedules → Reschedule loop works', async () => {
    // Create a new request for reschedule test
    logger.logAction('Creating new request for reschedule test');
    const requestPayload = {
      ...testData.requestPayloads.coordinator(22), // Unique day: +22 days (Day 32)
      Event_Title: 'Test Admin Reschedule Request'
    };

    const newRequest = await createRequest(app, coordinatorToken, requestPayload);
    const requestId = newRequest.requestId || newRequest.Request_ID || newRequest._id;

    logger.logAction(`Admin rescheduling request ${requestId}`);

    // Propose reschedule
    const proposedDate = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    const rescheduledRequest = await executeReviewAction(
      app,
      adminToken,
      requestId,
      'reschedule',
      {
        notes: 'Admin reschedule',
        proposedDate,
        proposedStartTime: '11:00'
      }
    );

    // Verify state transition
    assertRequestState(rescheduledRequest, 'review-rescheduled', logger);
    logger.logTransition('pending-review', 'review-rescheduled');

    // Requester confirms reschedule
    logger.logAction('Coordinator confirming reschedule');
    const confirmedRequest = await confirmDecision(
      app,
      coordinatorToken,
      requestId,
      'confirm',
      { notes: 'Confirmed reschedule' }
    );

    // Verify final state
    assertRequestState(confirmedRequest, 'approved', logger);
    logger.logTransition('review-rescheduled', 'approved');

    logger.logResult('Reschedule → Confirm flow completed successfully');
  });

  test('6. Authority validation - Admin authority >= 80', async () => {
    const reviewerId = createdRequest.reviewer?.userId || createdRequest.reviewer?.id || createdRequest.reviewer_id;
    const reviewer = await User.findById(reviewerId).select('authority email').lean();

    expect(reviewer.authority).toBeGreaterThanOrEqual(80);
    logger.logAssertion(
      `Admin authority >= 80`,
      reviewer.authority >= 80
    );

    logger.logResult('Authority validation passed');
  });
});

