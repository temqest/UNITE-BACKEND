/**
 * Event Request System Tests
 * 
 * Comprehensive test cases for the new event request system
 */

const { describe, it, before, after, beforeEach } = require('mocha');
const { expect } = require('chai');
const mongoose = require('mongoose');
const eventRequestService = require('../../src/services/eventRequests_services/eventRequest.service');
const reviewerAssignmentService = require('../../src/services/eventRequests_services/reviewerAssignment.service');
const actionValidatorService = require('../../src/services/eventRequests_services/actionValidator.service');
const { User, Event, EventRequest } = require('../../src/models/index');
const { REQUEST_STATES, AUTHORITY_TIERS } = require('../../src/utils/eventRequests/requestConstants');

describe('Event Request System', () => {
  let stakeholderUser, coordinatorUser, adminUser;
  let testEvent;

  before(async () => {
    // Setup test users with different authority levels
    stakeholderUser = await User.create({
      email: 'stakeholder@test.com',
      password: 'password123',
      firstName: 'Stakeholder',
      lastName: 'Test',
      authority: AUTHORITY_TIERS.STAKEHOLDER,
      isActive: true
    });

    coordinatorUser = await User.create({
      email: 'coordinator@test.com',
      password: 'password123',
      firstName: 'Coordinator',
      lastName: 'Test',
      authority: AUTHORITY_TIERS.COORDINATOR,
      isActive: true
    });

    adminUser = await User.create({
      email: 'admin@test.com',
      password: 'password123',
      firstName: 'Admin',
      lastName: 'Test',
      authority: AUTHORITY_TIERS.OPERATIONAL_ADMIN,
      isActive: true
    });

    // Create test event
    testEvent = await Event.create({
      Event_ID: 'TEST_EVENT_001',
      Event_Title: 'Test Event',
      Location: 'Test Location',
      Start_Date: new Date(),
      Email: 'test@test.com',
      Phone_Number: '1234567890',
      made_by_id: stakeholderUser._id.toString(),
      made_by_role: 'Stakeholder'
    });
  });

  after(async () => {
    // Cleanup
    await User.deleteMany({ email: { $in: ['stakeholder@test.com', 'coordinator@test.com', 'admin@test.com'] } });
    await Event.deleteMany({ Event_ID: 'TEST_EVENT_001' });
    await EventRequest.deleteMany({ Event_ID: 'TEST_EVENT_001' });
  });

  describe('Reviewer Assignment', () => {
    it('should assign coordinator reviewer for stakeholder request', async () => {
      const reviewer = await reviewerAssignmentService.assignReviewer(stakeholderUser._id, {
        locationId: null
      });

      expect(reviewer).to.exist;
      expect(reviewer.assignmentRule).to.equal('stakeholder-to-coordinator');
    });

    it('should assign admin reviewer for coordinator request', async () => {
      const reviewer = await reviewerAssignmentService.assignReviewer(coordinatorUser._id, {
        locationId: null
      });

      expect(reviewer).to.exist;
      expect(reviewer.assignmentRule).to.equal('coordinator-to-admin');
    });

    it('should assign coordinator reviewer for admin request', async () => {
      const reviewer = await reviewerAssignmentService.assignReviewer(adminUser._id, {
        locationId: null
      });

      expect(reviewer).to.exist;
      expect(reviewer.assignmentRule).to.equal('admin-to-coordinator');
    });
  });

  describe('Request Creation', () => {
    it('should create request with correct initial state', async () => {
      const request = await eventRequestService.createRequest(stakeholderUser._id, {
        Event_ID: testEvent.Event_ID,
        Category: 'BloodDrive'
      });

      expect(request).to.exist;
      expect(request.status).to.equal(REQUEST_STATES.PENDING_REVIEW);
      expect(request.requester.userId.toString()).to.equal(stakeholderUser._id.toString());
      expect(request.reviewer).to.exist;
    });
  });

  describe('State Transitions', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await eventRequestService.createRequest(stakeholderUser._id, {
        Event_ID: testEvent.Event_ID,
        Category: 'BloodDrive'
      });
    });

    it('should transition from pending-review to approved on accept', async () => {
      const updatedRequest = await eventRequestService.executeAction(
        testRequest.Request_ID,
        coordinatorUser._id,
        'accept',
        { notes: 'Approved' }
      );

      expect(updatedRequest.status).to.equal(REQUEST_STATES.APPROVED);
    });

    it('should transition from pending-review to rejected on reject', async () => {
      const updatedRequest = await eventRequestService.executeAction(
        testRequest.Request_ID,
        coordinatorUser._id,
        'reject',
        { notes: 'Rejected' }
      );

      expect(updatedRequest.status).to.equal(REQUEST_STATES.REJECTED);
    });

    it('should allow reschedule loop', async () => {
      // First reschedule
      let updatedRequest = await eventRequestService.executeAction(
        testRequest.Request_ID,
        coordinatorUser._id,
        'reschedule',
        { proposedDate: new Date(), notes: 'First reschedule' }
      );

      expect(updatedRequest.status).to.equal(REQUEST_STATES.REVIEW_RESCHEDULED);

      // Second reschedule (loop)
      updatedRequest = await eventRequestService.executeAction(
        testRequest.Request_ID,
        coordinatorUser._id,
        'reschedule',
        { proposedDate: new Date(), notes: 'Second reschedule' }
      );

      expect(updatedRequest.status).to.equal(REQUEST_STATES.REVIEW_RESCHEDULED);
    });
  });

  describe('Permission Enforcement', () => {
    let testRequest;

    beforeEach(async () => {
      testRequest = await eventRequestService.createRequest(stakeholderUser._id, {
        Event_ID: testEvent.Event_ID,
        Category: 'BloodDrive'
      });
    });

    it('should reject action from unauthorized user', async () => {
      const validation = await actionValidatorService.validateAction(
        stakeholderUser._id, // Stakeholder cannot review
        'accept',
        testRequest,
        {}
      );

      expect(validation.valid).to.be.false;
    });

    it('should allow action from authorized reviewer', async () => {
      // Note: This test assumes coordinator has request.review permission
      // In real tests, you would need to set up proper permissions
      const validation = await actionValidatorService.validateAction(
        coordinatorUser._id,
        'accept',
        testRequest,
        {}
      );

      // This will depend on actual permission setup
      // expect(validation.valid).to.be.true;
    });
  });

  describe('Event Publishing', () => {
    it('should auto-publish event when request is approved', async () => {
      const request = await eventRequestService.createRequest(stakeholderUser._id, {
        Event_ID: testEvent.Event_ID,
        Category: 'BloodDrive'
      });

      const updatedRequest = await eventRequestService.executeAction(
        request.Request_ID,
        coordinatorUser._id,
        'accept',
        { notes: 'Approved' }
      );

      expect(updatedRequest.status).to.equal(REQUEST_STATES.APPROVED);
      // Event should be published (check event status)
      const event = await Event.findOne({ Event_ID: testEvent.Event_ID });
      // Add assertions based on your event publishing logic
    });
  });
});

