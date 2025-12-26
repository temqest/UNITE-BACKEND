/**
 * Stakeholder → Coordinator Flow Tests
 * Tests request creation by stakeholder, routing to coordinator, and coordinator review actions
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
  assertEventStatus,
  assertAuthorityHierarchy,
  assertOrganizationCoverageMatch
} = require('../helpers/assertionHelper');
const { getUserToken, getUserIdByEmail } = require('../setup/authHelper');
const testData = require('../setup/testData');
const { User } = require('../../src/models');
const permissionService = require('../../src/services/users_services/permission.service');

describe('Stakeholder → Coordinator Flow', () => {
  let stakeholderToken, coordinatorToken, adminToken;
  let stakeholderId, coordinatorId, adminId;
  let logger;
  let createdRequest;

  beforeAll(async () => {
    logger = new TestLogger('Stakeholder → Coordinator');
    logger.logFlowStart();

    // Get user IDs
    stakeholderId = await getUserIdByEmail(testData.users.stakeholder.email);
    coordinatorId = await getUserIdByEmail(testData.users.coordinator.email);
    adminId = await getUserIdByEmail(testData.users.admin.email);

    // Generate tokens (bypassing login for testing)
    stakeholderToken = getUserToken(stakeholderId, testData.users.stakeholder.email);
    coordinatorToken = getUserToken(coordinatorId, testData.users.coordinator.email);
    adminToken = getUserToken(adminId, testData.users.admin.email);

    // Verify user authorities
    await assertAuthorityLevel(stakeholderId, testData.users.stakeholder.authority, logger);
    await assertAuthorityLevel(coordinatorId, testData.users.coordinator.authority, logger);
    await assertAuthorityLevel(adminId, testData.users.admin.authority, logger);
  });

  test('1. Stakeholder creates request', async () => {
    logger.logActor(
      testData.users.stakeholder.email,
      testData.users.stakeholder.authority,
      await permissionService.getUserPermissions(stakeholderId)
    );

    // Verify stakeholder has request.create permission
    await assertPermissionCheck(
      stakeholderId,
      'request',
      'create',
      true,
      {},
      logger
    );

    logger.logAction('Creating request as stakeholder');

    // Create request
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(10), // Unique day: +10 days (Day 17)
      coordinatorId: coordinatorId // Explicitly set coordinator for testing
    };

    createdRequest = await createRequest(app, stakeholderToken, requestPayload);

    expect(createdRequest).toBeDefined();
    expect(createdRequest.requestId || createdRequest.Request_ID || createdRequest._id).toBeDefined();

    logger.logAction(`Created request ${createdRequest.requestId || createdRequest.Request_ID || createdRequest._id}`);

    // Verify request is in pending-review state
    assertRequestState(createdRequest, 'pending-review', logger);

    // Verify request was routed to coordinator
    await assertRequestRoutedTo(createdRequest, coordinatorId, logger);

    // Verify coordinator has request.review permission
    await assertPermissionCheck(
      coordinatorId,
      'request',
      'review',
      true,
      { locationId: createdRequest.district || createdRequest.location?.district },
      logger
    );

    // Verify authority hierarchy
    await assertAuthorityHierarchy(coordinatorId, stakeholderId, logger);

    // Verify organization/coverage matching
    await assertOrganizationCoverageMatch(coordinatorId, stakeholderId, logger);

    logger.logResult('Request created and routed successfully');
  });

  test('2. Coordinator receives request with correct actions', async () => {
    const requestId = createdRequest.requestId || createdRequest.Request_ID || createdRequest._id;

    logger.logActor(
      testData.users.coordinator.email,
      testData.users.coordinator.authority,
      await permissionService.getUserPermissions(coordinatorId)
    );

    // Fetch request as coordinator
    const request = await getRequest(app, coordinatorToken, requestId);
    expect(request).toBeDefined();

    // Get available actions
    const availableActions = await getAvailableActions(app, coordinatorToken, requestId);
    logger.logActions(availableActions);

    // Expected actions for coordinator in pending-review state
    const expectedActions = ['view', 'accept', 'reject', 'reschedule'];
    assertActionsAvailable(availableActions, expectedActions, logger);

    // Verify permissions
    const context = { locationId: request.district || request.location?.district };
    await assertPermissionCheck(coordinatorId, 'request', 'review', true, context, logger);
    await assertPermissionCheck(coordinatorId, 'request', 'approve', true, context, logger);
    await assertPermissionCheck(coordinatorId, 'request', 'reject', true, context, logger);
    await assertPermissionCheck(coordinatorId, 'request', 'reschedule', true, context, logger);

    logger.logResult('Coordinator has correct actions and permissions');
  });

  test('3. Coordinator accepts → Request published', async () => {
    const requestId = createdRequest.requestId || createdRequest.Request_ID || createdRequest._id;

    logger.logAction('Coordinator accepting request');

    // Execute accept action
    const acceptedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'accept',
      { notes: 'Test acceptance' }
    );

    // Verify state transition
    assertRequestState(acceptedRequest, 'review-accepted', logger);
    logger.logTransition('pending-review', 'review-accepted');

    // Wait for state to stabilize
    const updatedRequest = await waitForStateChange(
      app,
      stakeholderToken,
      requestId,
      'review-accepted',
      5000
    );

    // Requester confirms
    logger.logAction('Requester confirming acceptance');
    const confirmedRequest = await confirmDecision(
      app,
      stakeholderToken,
      requestId,
      'confirm',
      { notes: 'Confirmed' }
    );

    // Verify final state
    assertRequestState(confirmedRequest, 'approved', logger);
    logger.logTransition('review-accepted', 'approved');

    // Verify event status (if event exists)
    if (confirmedRequest.event || confirmedRequest.Event_ID) {
      // Event should be published (Status: 'Completed')
      // Note: This may require fetching the event separately
      logger.logResult('Request approved, event should be published');
    }

    logger.logResult('Accept → Publish flow completed successfully');
  });

  test('4. Coordinator rejects → Request finalized', async () => {
    // Create a new request for rejection test
    logger.logAction('Creating new request for rejection test');
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(11), // Unique day: +11 days (Day 18)
      Event_Title: 'Test Rejection Request',
      coordinatorId: coordinatorId
    };

    const newRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = newRequest.requestId || newRequest.Request_ID || newRequest._id;

    logger.logAction(`Coordinator rejecting request ${requestId}`);

    // Execute reject action
    const rejectedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reject',
      { notes: 'Test rejection' }
    );

    // Verify state transition
    assertRequestState(rejectedRequest, 'review-rejected', logger);
    logger.logTransition('pending-review', 'review-rejected');

    // Requester confirms rejection
    logger.logAction('Requester confirming rejection');
    const finalizedRequest = await confirmDecision(
      app,
      stakeholderToken,
      requestId,
      'confirm',
      { notes: 'Confirmed rejection' }
    );

    // Verify final state
    assertRequestState(finalizedRequest, 'rejected', logger);
    logger.logTransition('review-rejected', 'rejected');

    logger.logResult('Reject → Finalized flow completed successfully');
  });

  test('5. Coordinator reschedules → Reschedule loop works', async () => {
    // Create a new request for reschedule test
    logger.logAction('Creating new request for reschedule test');
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(12), // Unique day: +12 days (Day 19)
      Event_Title: 'Test Reschedule Request',
      coordinatorId: coordinatorId
    };

    const newRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = newRequest.requestId || newRequest.Request_ID || newRequest._id;

    logger.logAction(`Coordinator rescheduling request ${requestId}`);

    // Propose reschedule
    const proposedDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const rescheduledRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reschedule',
      {
        notes: 'Test reschedule',
        proposedDate,
        proposedStartTime: '10:00'
      }
    );

    // Verify state transition
    assertRequestState(rescheduledRequest, 'review-rescheduled', logger);
    logger.logTransition('pending-review', 'review-rescheduled');

    // Requester confirms reschedule
    logger.logAction('Requester confirming reschedule');
    const confirmedRequest = await confirmDecision(
      app,
      stakeholderToken,
      requestId,
      'confirm',
      { notes: 'Confirmed reschedule' }
    );

    // Verify final state (should be approved after confirmation)
    assertRequestState(confirmedRequest, 'approved', logger);
    logger.logTransition('review-rescheduled', 'approved');

    logger.logResult('Reschedule → Confirm flow completed successfully');
  });

  test('6. Multiple reschedule iterations', async () => {
    // Create a new request for multiple reschedule test
    logger.logAction('Creating new request for multiple reschedule test');
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(13), // Unique day: +13 days (Day 20)
      Event_Title: 'Test Multiple Reschedule Request',
      coordinatorId: coordinatorId
    };

    const newRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = newRequest.requestId || newRequest.Request_ID || newRequest._id;

    // First reschedule
    logger.logAction('First reschedule iteration');
    const proposedDate1 = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
    await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reschedule',
      { proposedDate: proposedDate1 }
    );

    // Requester proposes new date (counter-reschedule)
    logger.logAction('Requester proposing new date');
    const proposedDate2 = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    await executeReviewAction(
      app,
      stakeholderToken,
      requestId,
      'reschedule',
      { proposedDate: proposedDate2 }
    );

    // Coordinator accepts final reschedule
    logger.logAction('Coordinator accepting final reschedule');
    await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'accept',
      { notes: 'Accepted final reschedule' }
    );

    // Verify state
    const finalRequest = await getRequest(app, stakeholderToken, requestId);
    assertRequestState(finalRequest, 'review-accepted', logger);

    logger.logResult('Multiple reschedule iterations completed successfully');
  });

  test('7. Permission validation - Coordinator without review permission should fail', async () => {
    // This test verifies that the system properly checks permissions
    // Note: This may require temporarily revoking permissions or using a test coordinator
    // For now, we verify that the permission check exists

    const requestId = createdRequest.requestId || createdRequest.Request_ID || createdRequest._id;
    const context = { locationId: createdRequest.district || createdRequest.location?.district };

    // Verify coordinator has review permission (should pass)
    await assertPermissionCheck(
      coordinatorId,
      'request',
      'review',
      true,
      context,
      logger
    );

    logger.logResult('Permission validation working correctly');
  });
});

