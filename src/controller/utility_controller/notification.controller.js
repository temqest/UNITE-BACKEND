const notificationService = require('../../services/utility_services/notification.service');

/**
 * Notification Controller
 * Handles all HTTP requests related to notification operations
 */
class NotificationController {
  /**
   * Create a new notification
   * POST /api/notifications
   */
  async createNotification(req, res) {
    try {
      const notificationData = req.body;
      
      const result = await notificationService.createNotification(notificationData);

      return res.status(201).json({
        success: result.success,
        message: result.message,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Get notifications for a user (Admin or Coordinator)
   * GET /api/notifications
   */
  async getNotifications(req, res) {
    try {
      const { recipientId, recipientType } = req.query;

      if (!recipientId || !recipientType) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID and recipient type are required'
        });
      }

      const filters = {
        isRead: req.query.isRead !== undefined ? (req.query.isRead === 'true' || req.query.isRead === true) : undefined,
        type: req.query.type,
        date_from: req.query.date_from,
        date_to: req.query.date_to,
        request_id: req.query.request_id,
        event_id: req.query.event_id
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);

      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc'
      };

      const result = await notificationService.getNotifications(recipientId, recipientType, filters, options);

      return res.status(200).json({
        success: result.success,
        data: result.notifications,
        pagination: result.pagination,
        filters: result.filters
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve notifications'
      });
    }
  }

  /**
   * Get unread notifications count
   * GET /api/notifications/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      const { recipientId, recipientType } = req.query;

      if (!recipientId || !recipientType) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID and recipient type are required'
        });
      }

      const result = await notificationService.getUnreadCount(recipientId, recipientType);

      return res.status(200).json({
        success: result.success,
        data: result
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get unread count'
      });
    }
  }

  /**
   * Mark notification as read
   * PUT /api/notifications/:notificationId/read
   */
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const { recipientId } = req.body;

      if (!recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID is required'
        });
      }

      const result = await notificationService.markAsRead(notificationId, recipientId);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark notification as read'
      });
    }
  }

  /**
   * Mark multiple notifications as read
   * PUT /api/notifications/mark-multiple-read
   */
  async markMultipleAsRead(req, res) {
    try {
      const { notificationIds, recipientId } = req.body;

      if (!notificationIds || !Array.isArray(notificationIds)) {
        return res.status(400).json({
          success: false,
          message: 'Notification IDs array is required'
        });
      }

      if (!recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID is required'
        });
      }

      const result = await notificationService.markMultipleAsRead(notificationIds, recipientId);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        modified_count: result.modified_count
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark notifications as read'
      });
    }
  }

  /**
   * Mark all notifications as read for a user
   * PUT /api/notifications/mark-all-read
   */
  async markAllAsRead(req, res) {
    try {
      const { recipientId, recipientType } = req.body;

      if (!recipientId || !recipientType) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID and recipient type are required'
        });
      }

      const result = await notificationService.markAllAsRead(recipientId, recipientType);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        modified_count: result.modified_count
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark all notifications as read'
      });
    }
  }

  /**
   * Get notification by ID
   * GET /api/notifications/:notificationId
   */
  async getNotificationById(req, res) {
    try {
      const { notificationId } = req.params;
      const { recipientId } = req.query;

      if (!recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID is required'
        });
      }

      const result = await notificationService.getNotificationById(notificationId, recipientId);

      return res.status(200).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'Notification not found'
      });
    }
  }

  /**
   * Delete notification
   * DELETE /api/notifications/:notificationId
   */
  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const { recipientId } = req.body;

      if (!recipientId) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID is required'
        });
      }

      const result = await notificationService.deleteNotification(notificationId, recipientId);

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete notification'
      });
    }
  }

  /**
   * Get notification statistics for a user
   * GET /api/notifications/statistics
   */
  async getNotificationStatistics(req, res) {
    try {
      const { recipientId, recipientType } = req.query;

      if (!recipientId || !recipientType) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID and recipient type are required'
        });
      }

      const result = await notificationService.getNotificationStatistics(recipientId, recipientType);

      return res.status(200).json({
        success: result.success,
        data: result.statistics
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get notification statistics'
      });
    }
  }

  /**
   * Get latest notifications (for dashboard/inbox preview)
   * GET /api/notifications/latest
   */
  async getLatestNotifications(req, res) {
    try {
      const { recipientId, recipientType } = req.query;

      if (!recipientId || !recipientType) {
        return res.status(400).json({
          success: false,
          message: 'Recipient ID and recipient type are required'
        });
      }

      const limit = parseInt(req.query.limit) || 10;

      const result = await notificationService.getLatestNotifications(recipientId, recipientType, limit);

      return res.status(200).json({
        success: result.success,
        data: result.notifications,
        total: result.total
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get latest notifications'
      });
    }
  }

  /**
   * Create new request notification (convenience method)
   * POST /api/notifications/new-request
   */
  async createNewRequestNotification(req, res) {
    try {
      const { adminId, requestId, eventId, coordinatorId } = req.body;

      if (!adminId || !requestId || !eventId || !coordinatorId) {
        return res.status(400).json({
          success: false,
          message: 'Admin ID, Request ID, Event ID, and Coordinator ID are required'
        });
      }

      const result = await notificationService.createNewRequestNotification(
        adminId,
        requestId,
        eventId,
        coordinatorId
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create admin action notification (convenience method)
   * POST /api/notifications/admin-action
   */
  async createAdminActionNotification(req, res) {
    try {
      const { coordinatorId, requestId, eventId, action, note, rescheduledDate } = req.body;

      if (!coordinatorId || !requestId || !eventId || !action) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID, Request ID, Event ID, and Action are required'
        });
      }

      const result = await notificationService.createAdminActionNotification(
        coordinatorId,
        requestId,
        eventId,
        action,
        note,
        rescheduledDate ? new Date(rescheduledDate) : null
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create coordinator action notification (convenience method)
   * POST /api/notifications/coordinator-action
   */
  async createCoordinatorActionNotification(req, res) {
    try {
      const { adminId, requestId, eventId, action } = req.body;

      if (!adminId || !requestId || !eventId || !action) {
        return res.status(400).json({
          success: false,
          message: 'Admin ID, Request ID, Event ID, and Action are required'
        });
      }

      const result = await notificationService.createCoordinatorActionNotification(
        adminId,
        requestId,
        eventId,
        action
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create admin cancellation notification (convenience method)
   * POST /api/notifications/admin-cancellation
   */
  async createAdminCancellationNotification(req, res) {
    try {
      const { coordinatorId, requestId, eventId, note } = req.body;

      if (!coordinatorId || !requestId || !eventId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID, Request ID, and Event ID are required'
        });
      }

      const result = await notificationService.createAdminCancellationNotification(
        coordinatorId,
        requestId,
        eventId,
        note
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create stakeholder cancellation notification (convenience method)
   * POST /api/notifications/stakeholder-cancellation
   */
  async createStakeholderCancellationNotification(req, res) {
    try {
      const { stakeholderId, requestId, eventId, note } = req.body;

      if (!stakeholderId || !requestId || !eventId) {
        return res.status(400).json({
          success: false,
          message: 'Stakeholder ID, Request ID, and Event ID are required'
        });
      }

      const result = await notificationService.createStakeholderCancellationNotification(
        stakeholderId,
        requestId,
        eventId,
        note
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create request deletion notification (convenience method)
   * POST /api/notifications/request-deletion
   */
  async createRequestDeletionNotification(req, res) {
    try {
      const { coordinatorId, requestId, eventId } = req.body;

      if (!coordinatorId || !requestId || !eventId) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID, Request ID, and Event ID are required'
        });
      }

      const result = await notificationService.createRequestDeletionNotification(
        coordinatorId,
        requestId,
        eventId
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create stakeholder deletion notification (convenience method)
   * POST /api/notifications/stakeholder-deletion
   */
  async createStakeholderDeletionNotification(req, res) {
    try {
      const { stakeholderId, requestId, eventId } = req.body;

      if (!stakeholderId || !requestId || !eventId) {
        return res.status(400).json({
          success: false,
          message: 'Stakeholder ID, Request ID, and Event ID are required'
        });
      }

      const result = await notificationService.createStakeholderDeletionNotification(
        stakeholderId,
        requestId,
        eventId
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create new signup request notification (convenience method)
   * POST /api/notifications/new-signup-request
   */
  async createNewSignupRequestNotification(req, res) {
    try {
      const { coordinatorId, signupRequestId, requesterName, requesterEmail } = req.body;

      if (!coordinatorId || !signupRequestId || !requesterName || !requesterEmail) {
        return res.status(400).json({
          success: false,
          message: 'Coordinator ID, Signup Request ID, Requester Name, and Requester Email are required'
        });
      }

      const result = await notificationService.createNewSignupRequestNotification(
        coordinatorId,
        signupRequestId,
        requesterName,
        requesterEmail
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create signup request approved notification (convenience method)
   * POST /api/notifications/signup-request-approved
   */
  async createSignupRequestApprovedNotification(req, res) {
    try {
      const { stakeholderId, signupRequestId, stakeholderName } = req.body;

      if (!stakeholderId || !signupRequestId || !stakeholderName) {
        return res.status(400).json({
          success: false,
          message: 'Stakeholder ID, Signup Request ID, and Stakeholder Name are required'
        });
      }

      const result = await notificationService.createSignupRequestApprovedNotification(
        stakeholderId,
        signupRequestId,
        stakeholderName
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }

  /**
   * Create signup request rejected notification (convenience method)
   * POST /api/notifications/signup-request-rejected
   */
  async createSignupRequestRejectedNotification(req, res) {
    try {
      const { email, signupRequestId, reason } = req.body;

      if (!email || !signupRequestId) {
        return res.status(400).json({
          success: false,
          message: 'Email and Signup Request ID are required'
        });
      }

      const result = await notificationService.createSignupRequestRejectedNotification(
        email,
        signupRequestId,
        reason
      );

      return res.status(201).json({
        success: result.success,
        data: result.notification
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create notification'
      });
    }
  }
}

module.exports = new NotificationController();

