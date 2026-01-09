/**
 * Notification Notes Display Tests
 * 
 * Tests for ActionNote field in reject/reschedule notifications
 */

const notificationEngine = require('../../src/services/utility_services/notificationEngine.service');
const emailNotificationService = require('../../src/services/utility_services/emailNotification.service');
const notificationService = require('../../src/services/utility_services/notification.service');
const { Notification, User, EventRequest, Event } = require('../../src/models/index');

describe('Notification Notes Display', () => {
  let testUser;
  let testRequest;
  let testEvent;

  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      email: 'notes-test@test.com',
      password: 'password123',
      firstName: 'Notes',
      lastName: 'Test',
      authority: 20,
      isActive: true
    });

    // Create test event
    testEvent = await Event.create({
      Event_ID: `EVT_NOTES_${Date.now()}`,
      Event_Title: 'Test Event for Notes',
      Category: 'Blood Drive',
      Start_Date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      Status: 'Pending'
    });

    // Create test request
    testRequest = await EventRequest.create({
      Request_ID: `REQ_NOTES_${Date.now()}`,
      Event_ID: testEvent.Event_ID,
      Event_Title: testEvent.Event_Title,
      requester: {
        userId: testUser._id,
        name: `${testUser.firstName} ${testUser.lastName}`,
        roleSnapshot: 'stakeholder',
        authoritySnapshot: 20
      },
      status: 'pending-review'
    });
  });

  afterAll(async () => {
    // Cleanup
    await Notification.deleteMany({ Request_ID: testRequest.Request_ID });
    await EventRequest.deleteOne({ Request_ID: testRequest.Request_ID });
    await Event.deleteOne({ Event_ID: testEvent.Event_ID });
    await User.deleteOne({ _id: testUser._id });
  });

  beforeEach(async () => {
    // Clean up notifications before each test
    await Notification.deleteMany({ Request_ID: testRequest.Request_ID });
  });

  describe('ActionNote Storage', () => {
    it('should store ActionNote in reject notification', async () => {
      const testNote = 'This request does not meet the requirements for approval.';
      
      const notification = await notificationEngine.createNotification({
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: testNote
      });

      expect(notification).not.toBeNull();
      expect(notification.ActionNote).toBe(testNote);
      expect(notification.Message).not.toContain(testNote); // Note should not be in message
    });

    it('should store ActionNote in reschedule notification', async () => {
      const testNote = 'Please reschedule to a more suitable date.';
      
      const notification = await notificationEngine.createNotification({
        recipientUserId: testUser._id,
        NotificationType: 'request.rescheduled',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Request Rescheduled',
        Message: 'Your event request has been rescheduled.',
        ActionNote: testNote,
        RescheduledDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      });

      expect(notification).not.toBeNull();
      expect(notification.ActionNote).toBe(testNote);
      expect(notification.Message).not.toContain(testNote); // Note should not be in message
    });

    it('should handle long notes without truncation', async () => {
      const longNote = 'A'.repeat(1000); // 1000 character note
      
      const notification = await notificationEngine.createNotification({
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: longNote
      });

      expect(notification).not.toBeNull();
      expect(notification.ActionNote).toBe(longNote);
      expect(notification.ActionNote.length).toBe(1000);
    });
  });

  describe('Email Template Note Display', () => {
    it('should include ActionNote in email HTML for reject notification', () => {
      const notification = {
        NotificationType: 'request.rejected',
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: 'Test rejection note',
        actor: {
          name: 'Test Admin',
          userId: testUser._id
        }
      };

      const { html } = emailNotificationService.generateEmailContent(notification);
      
      expect(html).toContain('Test rejection note');
      expect(html).toContain('Reason:'); // Label for rejection notes
    });

    it('should include ActionNote in email HTML for reschedule notification', () => {
      const notification = {
        NotificationType: 'request.rescheduled',
        Title: 'Request Rescheduled',
        Message: 'Your event request has been rescheduled.',
        ActionNote: 'Test reschedule note',
        actor: {
          name: 'Test Admin',
          userId: testUser._id
        }
      };

      const { html } = emailNotificationService.generateEmailContent(notification);
      
      expect(html).toContain('Test reschedule note');
      expect(html).toContain('Note:'); // Label for reschedule notes
    });

    it('should include ActionNote in email text content', () => {
      const notification = {
        NotificationType: 'request.rejected',
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: 'Test rejection note'
      };

      const { text } = emailNotificationService.generateEmailContent(notification);
      
      expect(text).toContain('Test rejection note');
      expect(text).toContain('Reason:');
    });
  });

  describe('API Response Note Display', () => {
    it('should return ActionNote in API response', async () => {
      const testNote = 'API test note';
      
      const notification = await notificationEngine.createNotification({
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: testNote
      });

      // Get notification via API service
      const result = await notificationService.getNotificationById(
        notification.Notification_ID,
        testUser._id.toString()
      );

      expect(result.success).toBe(true);
      expect(result.notification.ActionNote).toBe(testNote);
    });

    it('should return ActionNote in notifications list', async () => {
      const testNote = 'List test note';
      
      await notificationEngine.createNotification({
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Request Rejected',
        Message: 'Your event request has been rejected.',
        ActionNote: testNote
      });

      // Get notifications via API service
      const result = await notificationService.getNotifications(
        testUser._id.toString(),
        null,
        {},
        { page: 1, limit: 10 }
      );

      expect(result.success).toBe(true);
      expect(result.notifications.length).toBeGreaterThan(0);
      
      const notification = result.notifications.find(n => n.ActionNote === testNote);
      expect(notification).toBeDefined();
      expect(notification.ActionNote).toBe(testNote);
    });
  });
});

