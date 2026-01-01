/**
 * Notification Deduplication Tests
 * 
 * Tests for duplicate notification prevention in NotificationEngine
 */

const notificationEngine = require('../../src/services/utility_services/notificationEngine.service');
const { Notification, User, EventRequest, Event } = require('../../src/models/index');

describe('Notification Deduplication', () => {
  let testUser;
  let testRequest;
  let testEvent;

  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      email: 'notification-test@test.com',
      password: 'password123',
      firstName: 'Notification',
      lastName: 'Test',
      authority: 20,
      isActive: true
    });

    // Create test event
    testEvent = await Event.create({
      Event_ID: `EVT_TEST_${Date.now()}`,
      Event_Title: 'Test Event for Notifications',
      Category: 'Blood Drive',
      Start_Date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      Status: 'Pending'
    });

    // Create test request
    testRequest = await EventRequest.create({
      Request_ID: `REQ_TEST_${Date.now()}`,
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

  describe('Duplicate Prevention', () => {
    it('should prevent duplicate notifications within 5 minute window', async () => {
      const notificationData1 = {
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Test Notification',
        Message: 'Test message',
        ActionNote: 'Test note'
      };

      const notificationData2 = {
        ...notificationData1,
        Notification_ID: notificationEngine.generateNotificationID() // Different ID
      };

      // Create first notification
      const notification1 = await notificationEngine.createNotification(notificationData1);
      expect(notification1).not.toBeNull();
      expect(notification1.NotificationType).toBe('request.rejected');

      // Try to create duplicate immediately
      const notification2 = await notificationEngine.createNotification(notificationData2);
      expect(notification2).toBeNull(); // Should be null due to deduplication

      // Verify only one notification exists
      const count = await Notification.countDocuments({
        Request_ID: testRequest.Request_ID,
        NotificationType: 'request.rejected',
        recipientUserId: testUser._id
      });
      expect(count).toBe(1);
    });

    it('should allow notifications with different types', async () => {
      const notificationData1 = {
        recipientUserId: testUser._id,
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Rejected Notification',
        Message: 'Request rejected'
      };

      const notificationData2 = {
        recipientUserId: testUser._id,
        NotificationType: 'request.rescheduled',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Rescheduled Notification',
        Message: 'Request rescheduled'
      };

      const notification1 = await notificationEngine.createNotification(notificationData1);
      const notification2 = await notificationEngine.createNotification(notificationData2);

      expect(notification1).not.toBeNull();
      expect(notification2).not.toBeNull();
      expect(notification1.NotificationType).toBe('request.rejected');
      expect(notification2.NotificationType).toBe('request.rescheduled');
    });

    it('should check both recipientUserId and Recipient_ID for duplicates', async () => {
      const notificationData1 = {
        recipientUserId: testUser._id,
        Recipient_ID: testUser.userId || testUser._id.toString(),
        NotificationType: 'request.rejected',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Test Notification',
        Message: 'Test message'
      };

      const notificationData2 = {
        ...notificationData1,
        Notification_ID: notificationEngine.generateNotificationID()
      };

      // Create first notification
      const notification1 = await notificationEngine.createNotification(notificationData1);
      expect(notification1).not.toBeNull();

      // Try to create duplicate using legacy Recipient_ID
      const notification2 = await notificationEngine.createNotification(notificationData2);
      expect(notification2).toBeNull(); // Should be null due to deduplication
    });
  });

  describe('Deduplication Window', () => {
    it('should use 5 minute window for deduplication', async () => {
      const notificationData1 = {
        recipientUserId: testUser._id,
        NotificationType: 'request.approved',
        Request_ID: testRequest.Request_ID,
        Event_ID: testEvent.Event_ID,
        Title: 'Approved Notification',
        Message: 'Request approved'
      };

      const notificationData2 = {
        ...notificationData1,
        Notification_ID: notificationEngine.generateNotificationID()
      };

      // Create first notification
      const notification1 = await notificationEngine.createNotification(notificationData1);
      expect(notification1).not.toBeNull();

      // Manually set createdAt to 4 minutes ago (within window)
      await Notification.updateOne(
        { Notification_ID: notification1.Notification_ID },
        { createdAt: new Date(Date.now() - 4 * 60 * 1000) }
      );

      // Try to create duplicate (should be blocked)
      const notification2 = await notificationEngine.createNotification(notificationData2);
      expect(notification2).toBeNull();
    });
  });
});

