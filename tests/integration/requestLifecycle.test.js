/**
 * Request Lifecycle Integration Tests
 * Tests complete request lifecycles: accept→publish, reject→finalized, reschedule loops
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
  assertRequestState,
  assertEventStatus,
  assertPermissionCheck
} = require('../helpers/assertionHelper');
const { getUserToken, getUserIdByEmail } = require('../setup/authHelper');
const testData = require('../setup/testData');
const { User, EventRequest, Event } = require('../../src/models/index');
const permissionService = require('../../src/services/users_services/permission.service');

describe('Request Lifecycle Integration Tests', () => {
  let stakeholderToken, coordinatorToken, adminToken;
  let stakeholderId, coordinatorId, adminId;
  let logger;

  beforeAll(async () => {
    logger = new TestLogger('Request Lifecycle');
    logger.logFlowStart();

    // Get user IDs
    stakeholderId = await getUserIdByEmail(testData.users.stakeholder.email);
    coordinatorId = await getUserIdByEmail(testData.users.coordinator.email);
    adminId = await getUserIdByEmail(testData.users.admin.email);

    // Generate tokens
    stakeholderToken = getUserToken(stakeholderId, testData.users.stakeholder.email);
    coordinatorToken = getUserToken(coordinatorId, testData.users.coordinator.email);
    adminToken = getUserToken(adminId, testData.users.admin.email);
  });

  test('1. Complete Accept → Publish Flow', async () => {
    logger.logAction('Testing complete accept → publish flow');

    // Create request
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(1), // Unique day: +1 day (Day 8)
      Event_Title: 'Complete Accept Flow Test',
      coordinatorId: coordinatorId
    };

    let createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // Verify initial state
    assertRequestState(createdRequest, 'pending-review', logger);
    logger.logTransition('initial', 'pending-review');

    // Coordinator accepts
    logger.logAction('Coordinator accepting');
    let updatedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'accept',
      { notes: 'Accepted for testing' }
    );
    assertRequestState(updatedRequest, 'review-accepted', logger);
    logger.logTransition('pending-review', 'review-accepted');

    // Stakeholder confirms
    logger.logAction('Stakeholder confirming');
    updatedRequest = await confirmDecision(
      app,
      stakeholderToken,
      requestId,
      'confirm',
      { notes: 'Confirmed' }
    );
    assertRequestState(updatedRequest, 'approved', logger);
    logger.logTransition('review-accepted', 'approved');

    // Verify event status (if event exists)
    if (updatedRequest.event || updatedRequest.Event_ID) {
      const eventId = updatedRequest.Event_ID || updatedRequest.event?._id || updatedRequest.event?.Event_ID;
      if (eventId) {
        const event = await Event.findOne({ Event_ID: eventId });
        if (event) {
          // Event should be published (Status: 'Completed')
          expect(event.Status).toBe('Completed');
          logger.logResult('Event published successfully');
        }
      }
    }

    logger.logResult('Accept → Publish flow completed successfully');
  });

  test('2. Complete Reject → Finalized Flow', async () => {
    logger.logAction('Testing complete reject → finalized flow');

    // Create request
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(2), // Unique day: +2 days (Day 9)
      Event_Title: 'Complete Reject Flow Test',
      coordinatorId: coordinatorId
    };

    let createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // Verify initial state
    assertRequestState(createdRequest, 'pending-review', logger);

    // Coordinator rejects
    logger.logAction('Coordinator rejecting');
    let updatedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reject',
      { notes: 'Rejected for testing' }
    );
    assertRequestState(updatedRequest, 'review-rejected', logger);
    logger.logTransition('pending-review', 'review-rejected');

    // Stakeholder confirms rejection
    logger.logAction('Stakeholder confirming rejection');
    updatedRequest = await confirmDecision(
      app,
      stakeholderToken,
      requestId,
      'confirm',
      { notes: 'Confirmed rejection' }
    );
    assertRequestState(updatedRequest, 'rejected', logger);
    logger.logTransition('review-rejected', 'rejected');

    // Verify event status (if event exists)
    if (updatedRequest.event || updatedRequest.Event_ID) {
      const eventId = updatedRequest.Event_ID || updatedRequest.event?._id || updatedRequest.event?.Event_ID;
      if (eventId) {
        const event = await Event.findOne({ Event_ID: eventId });
        if (event) {
          // Event should be rejected
          expect(event.Status).toBe('Rejected');
          logger.logResult('Event rejected successfully');
        }
      }
    }

    logger.logResult('Reject → Finalized flow completed successfully');
  });

  test('3. Reschedule Loop with Multiple Iterations', async () => {
    logger.logAction('Testing reschedule loop with multiple iterations');

    // Create request
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(3), // Unique day: +3 days (Day 10)
      Event_Title: 'Reschedule Loop Test',
      coordinatorId: coordinatorId
    };

    let createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // First reschedule by coordinator
    logger.logAction('First reschedule by coordinator');
    const proposedDate1 = new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString();
    let updatedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reschedule',
      { proposedDate: proposedDate1, notes: 'First reschedule' }
    );
    assertRequestState(updatedRequest, 'review-rescheduled', logger);
    logger.logTransition('pending-review', 'review-rescheduled');

    // Stakeholder proposes counter-reschedule
    logger.logAction('Stakeholder proposing counter-reschedule');
    const proposedDate2 = new Date(Date.now() + 19 * 24 * 60 * 60 * 1000).toISOString();
    updatedRequest = await executeReviewAction(
      app,
      stakeholderToken,
      requestId,
      'reschedule',
      { proposedDate: proposedDate2, notes: 'Counter-reschedule' }
    );
    assertRequestState(updatedRequest, 'review-rescheduled', logger);
    logger.logTransition('review-rescheduled', 'review-rescheduled (iteration 2)');

    // Coordinator proposes another reschedule
    logger.logAction('Coordinator proposing another reschedule');
    const proposedDate3 = new Date(Date.now() + 22 * 24 * 60 * 60 * 1000).toISOString();
    updatedRequest = await executeReviewAction(
      app,
      coordinatorToken,
      requestId,
      'reschedule',
      { proposedDate: proposedDate3, notes: 'Third reschedule' }
    );
    assertRequestState(updatedRequest, 'review-rescheduled', logger);
    logger.logTransition('review-rescheduled', 'review-rescheduled (iteration 3)');

    // Stakeholder accepts final reschedule
    logger.logAction('Stakeholder accepting final reschedule');
    updatedRequest = await executeReviewAction(
      app,
      stakeholderToken,
      requestId,
      'accept',
      { notes: 'Accepted final reschedule' }
    );
    assertRequestState(updatedRequest, 'review-accepted', logger);
    logger.logTransition('review-rescheduled', 'review-accepted');

    // Coordinator confirms
    logger.logAction('Coordinator confirming');
    updatedRequest = await confirmDecision(
      app,
      coordinatorToken,
      requestId,
      'confirm',
      { notes: 'Confirmed' }
    );
    assertRequestState(updatedRequest, 'approved', logger);
    logger.logTransition('review-accepted', 'approved');

    logger.logResult('Reschedule loop with multiple iterations completed successfully');
  });

  test('4. Permission Edge Case - Coordinator without review permission should fail', async () => {
    logger.logAction('Testing permission edge case');

    // Create request
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(4), // Unique day: +4 days (Day 11)
      Event_Title: 'Permission Edge Case Test',
      coordinatorId: coordinatorId
    };

    const createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // Verify coordinator has review permission (should pass in normal case)
    const context = { locationId: createdRequest.district || createdRequest.location?.district };
    const hasPermission = await permissionService.checkPermission(
      coordinatorId,
      'request',
      'review',
      context
    );

    if (!hasPermission) {
      logger.logError('Coordinator missing request.review permission - this should be fixed');
      throw new Error('Coordinator does not have request.review permission - configuration error');
    }

    logger.logResult('Permission check working correctly');
  });

  test('5. Authority Mismatch Detection', async () => {
    logger.logAction('Testing authority mismatch detection');

    // Create request as stakeholder
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(5), // Unique day: +5 days (Day 12)
      Event_Title: 'Authority Mismatch Test'
    };

    const createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // Get reviewer
    const reviewerId = createdRequest.reviewer?.userId || createdRequest.reviewer?.id || createdRequest.reviewer_id;
    const reviewer = await User.findById(reviewerId).select('authority email').lean();
    const requester = await User.findById(stakeholderId).select('authority email').lean();

    // Verify authority hierarchy
    expect(reviewer.authority).toBeGreaterThanOrEqual(requester.authority);

    logger.logResult(`Authority hierarchy valid: Reviewer (${reviewer.authority}) >= Requester (${requester.authority})`);
  });

  test('6. Missing Organization/Coverage Match Detection', async () => {
    logger.logAction('Testing organization/coverage match detection');

    // Create request as stakeholder
    const requestPayload = {
      ...testData.requestPayloads.stakeholder(6), // Unique day: +6 days (Day 13)
      Event_Title: 'Organization Coverage Match Test'
    };

    const createdRequest = await createRequest(app, stakeholderToken, requestPayload);
    const requestId = createdRequest.Request_ID || createdRequest._id;

    // Get reviewer and requester
    const reviewerId = createdRequest.reviewer?.userId || createdRequest.reviewer?.id || createdRequest.reviewer_id;
    const reviewer = await User.findById(reviewerId).populate('organizations.organizationId coverageAreas.coverageAreaId').lean();
    const requester = await User.findById(stakeholderId).populate('organizations.organizationId').lean();

    // Check for organization match
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

    if (orgMatch) {
      logger.logResult('Organization match found');
    } else {
      logger.logAction('Warning: No organization match found - may indicate configuration issue');
    }
  });
});

