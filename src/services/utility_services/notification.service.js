const { Notification, EventRequest, Event, User } = require('../../models/index');

class NotificationService {
  /**
   * Generate unique notification ID
   * @returns {string} Unique notification ID
   */
  generateNotificationID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `NOTIF_${timestamp}_${random}`;
  }

  /**
   * Create a new notification
   * Supports both new (recipientUserId) and legacy (Recipient_ID + RecipientType) formats
   * @param {Object} notificationData 
   * @returns {Object} Created notification
   */
  async createNotification(notificationData) {
    try {
      if (!notificationData.Notification_ID) {
        notificationData.Notification_ID = this.generateNotificationID();
      }

      // If recipientUserId is provided, ensure legacy fields are also set for backward compatibility
      if (notificationData.recipientUserId && !notificationData.Recipient_ID) {
        try {
          const user = await User.findById(notificationData.recipientUserId);
          if (user) {
            notificationData.Recipient_ID = user.userId || user._id.toString();
            if (!notificationData.RecipientType) {
              // Infer recipient type from user
              if (user.isSystemAdmin || user.authority >= 100) {
                notificationData.RecipientType = 'Admin';
              } else if (user.authority >= 60) {
                notificationData.RecipientType = 'Coordinator';
              } else {
                notificationData.RecipientType = 'Stakeholder';
              }
            }
          }
        } catch (userError) {
          console.warn('[NOTIFICATION SERVICE] Could not resolve user for legacy fields:', userError.message);
        }
      }

      // If only legacy fields are provided, try to resolve recipientUserId
      if (!notificationData.recipientUserId && notificationData.Recipient_ID) {
        try {
          // Try to find user by legacy userId field or _id
          let user = await User.findOne({ userId: notificationData.Recipient_ID });
          if (!user && notificationData.Recipient_ID.match(/^[0-9a-fA-F]{24}$/)) {
            user = await User.findById(notificationData.Recipient_ID);
          }
          if (user) {
            notificationData.recipientUserId = user._id;
          }
        } catch (userError) {
          console.warn('[NOTIFICATION SERVICE] Could not resolve recipientUserId from legacy fields:', userError.message);
        }
      }

      // Set default delivery status if not provided
      if (!notificationData.deliveryStatus) {
        notificationData.deliveryStatus = {
          inApp: true,
          email: false
        };
      }

      const notification = new Notification(notificationData);
      const savedNotification = await notification.save();

      return {
        success: true,
        message: 'Notification created successfully',
        notification: savedNotification.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Get notifications for a user
   * Supports both new (recipientUserId) and legacy (Recipient_ID + RecipientType) query formats
   * @param {string|ObjectId} recipientId - User ID (ObjectId) or legacy Recipient_ID (string)
   * @param {string} recipientType - Legacy RecipientType (optional if using recipientUserId)
   * @param {Object} filters 
   * @param {Object} options 
   * @returns {Object} Notifications list
   */
  async getNotifications(recipientId, recipientType, filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const skip = (page - 1) * limit;

      // Build query - support both new and legacy formats
      const query = {
        $or: []
      };

      // Try to resolve recipientUserId if recipientId looks like an ObjectId
      let recipientUserId = null;
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            recipientUserId = user._id;
            query.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {
          // Not a valid ObjectId or user not found
        }
      }

      // Legacy query support
      if (recipientId) {
        query.$or.push({ Recipient_ID: recipientId });
        if (recipientType) {
          query.$or.push({ RecipientType: recipientType });
        }
      }

      // If no $or conditions, fall back to legacy format
      if (query.$or.length === 0) {
        query.Recipient_ID = recipientId;
        if (recipientType) {
          query.RecipientType = recipientType;
        }
        delete query.$or;
      } else if (query.$or.length === 1) {
        // Only one condition, simplify query
        Object.assign(query, query.$or[0]);
        delete query.$or;
      }

      // Read status filter
      if (filters.isRead !== undefined) {
        query.IsRead = filters.isRead === true || filters.isRead === 'true';
      }

      // Notification type filter
      if (filters.type) {
        if (Array.isArray(filters.type)) {
          query.NotificationType = { $in: filters.type };
        } else {
          query.NotificationType = filters.type;
        }
      }

      // Date range filter
      if (filters.date_from || filters.date_to) {
        query.createdAt = {};
        if (filters.date_from) {
          query.createdAt.$gte = new Date(filters.date_from);
        }
        if (filters.date_to) {
          query.createdAt.$lte = new Date(filters.date_to);
        }
      }

      // Request ID filter
      if (filters.request_id) {
        query.Request_ID = filters.request_id;
      }

      // Event ID filter
      if (filters.event_id) {
        query.Event_ID = filters.event_id;
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const notifications = await Notification.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort);

      const total = await Notification.countDocuments(query);

      // Enrich notifications with event/request details
      const enrichedNotifications = await Promise.all(
        notifications.map(async (notification) => {
          const enriched = notification.toObject();

          // Get event details if available
          if (notification.Event_ID) {
            const event = await Event.findOne({ Event_ID: notification.Event_ID });
            if (event) {
              enriched.event = {
                Event_ID: event.Event_ID,
                Event_Title: event.Event_Title,
                Location: event.Location,
                Start_Date: event.Start_Date
              };
            }
          }

          // Get request details if available
          if (notification.Request_ID) {
            const request = await EventRequest.findOne({ Request_ID: notification.Request_ID });
            if (request) {
              enriched.request = {
                Request_ID: request.Request_ID,
                Status: request.Status,
                Event_ID: request.Event_ID
              };
            }
          }

          return enriched;
        })
      );

      return {
        success: true,
        notifications: enrichedNotifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        filters: filters
      };

    } catch (error) {
      throw new Error(`Failed to get notifications: ${error.message}`);
    }
  }

  /**
   * Get unread notifications count
   * Supports both new (recipientUserId) and legacy (Recipient_ID + RecipientType) formats
   * @param {string|ObjectId} recipientId 
   * @param {string} recipientType 
   * @returns {Object} Unread count
   */
  async getUnreadCount(recipientId, recipientType) {
    try {
      // Build query - support both new and legacy formats
      const query = {
        IsRead: false,
        $or: []
      };

      // Try to resolve recipientUserId
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            query.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {}
      }

      // Legacy query
      if (recipientId) {
        const legacyQuery = { Recipient_ID: recipientId };
        if (recipientType) {
          legacyQuery.RecipientType = recipientType;
        }
        query.$or.push(legacyQuery);
      }

      // Simplify query if only one condition
      if (query.$or.length === 1) {
        Object.assign(query, query.$or[0]);
        delete query.$or;
      } else if (query.$or.length === 0) {
        // Fallback to legacy
        query.Recipient_ID = recipientId;
        if (recipientType) {
          query.RecipientType = recipientType;
        }
        delete query.$or;
      }

      const count = await Notification.countDocuments(query);

      return {
        success: true,
        unread_count: count
      };

    } catch (error) {
      throw new Error(`Failed to get unread count: ${error.message}`);
    }
  }

  /**
   * Mark notification as read
   * Supports both new (recipientUserId) and legacy (Recipient_ID) formats
   * @param {string} notificationId 
   * @param {string|ObjectId} recipientId 
   * @returns {Object} Updated notification
   */
  async markAsRead(notificationId, recipientId) {
    try {
      const notification = await Notification.findOne({ Notification_ID: notificationId });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Verify recipient owns this notification (support both new and legacy formats)
      const isOwner = (notification.recipientUserId && notification.recipientUserId.toString() === recipientId.toString()) ||
                     (notification.Recipient_ID && notification.Recipient_ID === recipientId);
      if (!isOwner) {
        throw new Error('Unauthorized: Notification does not belong to this user');
      }

      // Mark as read
      await notification.markAsRead();

      return {
        success: true,
        message: 'Notification marked as read',
        notification: notification.toObject()
      };

    } catch (error) {
      throw new Error(`Failed to mark notification as read: ${error.message}`);
    }
  }

  /**
   * Mark multiple notifications as read
   * @param {Array} notificationIds 
   * @param {string} recipientId 
   * @returns {Object} Updated notifications
   */
  async markMultipleAsRead(notificationIds, recipientId) {
    try {
      // Build query - support both new and legacy formats
      const query = {
        Notification_ID: { $in: notificationIds },
        IsRead: false,
        $or: []
      };

      // Try recipientUserId
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            query.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {}
      }

      // Legacy format
      query.$or.push({ Recipient_ID: recipientId });

      // Simplify if only one condition
      if (query.$or.length === 1) {
        Object.assign(query, query.$or[0]);
        delete query.$or;
      }

      const result = await Notification.updateMany(
        query,
        {
          IsRead: true,
          ReadAt: new Date()
        }
      );

      return {
        success: true,
        message: `${result.modifiedCount} notification(s) marked as read`,
        modified_count: result.modifiedCount
      };

    } catch (error) {
      throw new Error(`Failed to mark notifications as read: ${error.message}`);
    }
  }

  /**
   * Mark all notifications as read for a user
   * @param {string} recipientId 
   * @param {string} recipientType 
   * @returns {Object} Result
   */
  async markAllAsRead(recipientId, recipientType) {
    try {
      // Build query - support both new and legacy formats
      const query = {
        IsRead: false,
        $or: []
      };

      // Try recipientUserId
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            query.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {}
      }

      // Legacy format
      const legacyQuery = { Recipient_ID: recipientId };
      if (recipientType) {
        legacyQuery.RecipientType = recipientType;
      }
      query.$or.push(legacyQuery);

      // Simplify if only one condition
      if (query.$or.length === 1) {
        Object.assign(query, query.$or[0]);
        delete query.$or;
      } else if (query.$or.length === 0) {
        // Fallback
        query.Recipient_ID = recipientId;
        if (recipientType) {
          query.RecipientType = recipientType;
        }
        delete query.$or;
      }

      const result = await Notification.updateMany(
        query,
        {
          IsRead: true,
          ReadAt: new Date()
        }
      );

      return {
        success: true,
        message: `All notifications marked as read`,
        modified_count: result.modifiedCount
      };

    } catch (error) {
      throw new Error(`Failed to mark all notifications as read: ${error.message}`);
    }
  }

  /**
   * Get notification by ID
   * @param {string} notificationId 
   * @param {string} recipientId 
   * @returns {Object} Notification details
   */
  async getNotificationById(notificationId, recipientId) {
    try {
      const notification = await Notification.findOne({ Notification_ID: notificationId });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Verify recipient owns this notification
      if (notification.Recipient_ID !== recipientId) {
        throw new Error('Unauthorized: Notification does not belong to this user');
      }

      // Enrich with event and request details
      const enriched = notification.toObject();

      if (notification.Event_ID) {
        const event = await Event.findOne({ Event_ID: notification.Event_ID });
        if (event) {
          enriched.event = {
            Event_ID: event.Event_ID,
            Event_Title: event.Event_Title,
            Location: event.Location,
            Start_Date: event.Start_Date,
            Status: event.Status
          };
        }
      }

      if (notification.Request_ID) {
        const request = await EventRequest.findOne({ Request_ID: notification.Request_ID });
        if (request) {
          enriched.request = {
            Request_ID: request.Request_ID,
            Status: request.Status,
            Event_ID: request.Event_ID,
            AdminAction: request.AdminAction,
            CoordinatorFinalAction: request.CoordinatorFinalAction
          };
        }
      }

      return {
        success: true,
        notification: enriched
      };

    } catch (error) {
      throw new Error(`Failed to get notification: ${error.message}`);
    }
  }

  /**
   * Delete notification
   * @param {string} notificationId 
   * @param {string} recipientId 
   * @returns {Object} Success message
   */
  async deleteNotification(notificationId, recipientId) {
    try {
      const notification = await Notification.findOne({ Notification_ID: notificationId });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Verify recipient owns this notification (support both new and legacy formats)
      const isOwner = notification.recipientUserId && notification.recipientUserId.toString() === recipientId.toString() ||
                     notification.Recipient_ID === recipientId;
      if (!isOwner) {
        throw new Error('Unauthorized: Notification does not belong to this user');
      }

      await Notification.deleteOne({ Notification_ID: notificationId });

      return {
        success: true,
        message: 'Notification deleted successfully'
      };

    } catch (error) {
      throw new Error(`Failed to delete notification: ${error.message}`);
    }
  }

  /**
   * Get notification statistics for a user
   * @param {string} recipientId 
   * @param {string} recipientType 
   * @returns {Object} Statistics
   */
  async getNotificationStatistics(recipientId, recipientType) {
    try {
      // Build query - support both new and legacy formats
      const baseQuery = {
        $or: []
      };

      // Try recipientUserId
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            baseQuery.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {}
      }

      // Legacy format
      const legacyQuery = { Recipient_ID: recipientId };
      if (recipientType) {
        legacyQuery.RecipientType = recipientType;
      }
      baseQuery.$or.push(legacyQuery);

      // Simplify query
      let query = {};
      if (baseQuery.$or.length === 1) {
        query = baseQuery.$or[0];
      } else if (baseQuery.$or.length > 1) {
        query = baseQuery;
      } else {
        query = legacyQuery;
      }

      const total = await Notification.countDocuments(query);

      const unreadQuery = { ...query, IsRead: false };
      const unread = await Notification.countDocuments(unreadQuery);

      const read = total - unread;

      // Group by type
      const byType = await Notification.aggregate([
        {
          $match: query
        },
        {
          $group: {
            _id: '$NotificationType',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Group by read status
      const readStatus = {
        read: read,
        unread: unread,
        total: total
      };

      // Recent notifications (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentQuery = { ...query, createdAt: { $gte: sevenDaysAgo } };
      const recentCount = await Notification.countDocuments(recentQuery);

      return {
        success: true,
        statistics: {
          total: total,
          read: read,
          unread: unread,
          read_percentage: total > 0 ? Math.round((read / total) * 100) : 0,
          unread_percentage: total > 0 ? Math.round((unread / total) * 100) : 0,
          by_type: byType.map(item => ({
            type: item._id,
            count: item.count
          })),
          recent_count: recentCount
        }
      };

    } catch (error) {
      throw new Error(`Failed to get notification statistics: ${error.message}`);
    }
  }

  /**
   * Get latest notifications (for dashboard/inbox preview)
   * @param {string} recipientId 
   * @param {string} recipientType 
   * @param {number} limit 
   * @returns {Object} Latest notifications
   */
  async getLatestNotifications(recipientId, recipientType, limit = 10) {
    try {
      // Build query - support both new and legacy formats
      const query = {
        $or: []
      };

      // Try recipientUserId
      if (recipientId && typeof recipientId === 'string' && recipientId.match(/^[0-9a-fA-F]{24}$/)) {
        try {
          const user = await User.findById(recipientId);
          if (user) {
            query.$or.push({ recipientUserId: user._id });
          }
        } catch (e) {}
      }

      // Legacy format
      const legacyQuery = { Recipient_ID: recipientId };
      if (recipientType) {
        legacyQuery.RecipientType = recipientType;
      }
      query.$or.push(legacyQuery);

      // Simplify query
      let finalQuery = {};
      if (query.$or.length === 1) {
        finalQuery = query.$or[0];
      } else if (query.$or.length > 1) {
        finalQuery = query;
      } else {
        finalQuery = legacyQuery;
      }

      const notifications = await Notification.find(finalQuery)
      .sort({ createdAt: -1 })
      .limit(limit);

      const enrichedNotifications = await Promise.all(
        notifications.map(async (notification) => {
          const enriched = notification.toObject();

          if (notification.Event_ID) {
            const event = await Event.findOne({ Event_ID: notification.Event_ID });
            if (event) {
              enriched.event = {
                Event_ID: event.Event_ID,
                Event_Title: event.Event_Title
              };
            }
          }

          return enriched;
        })
      );

      return {
        success: true,
        notifications: enrichedNotifications,
        total: enrichedNotifications.length
      };

    } catch (error) {
      throw new Error(`Failed to get latest notifications: ${error.message}`);
    }
  }

  /**
   * Create notification using model static methods (for workflow)
   * These are convenience wrappers around the model static methods
   */
  
  async createNewRequestNotification(recipientId, requestId, eventId, coordinatorId, recipientType = null) {
    try {
      const notification = await Notification.createNewRequestNotification(
        recipientId,
        requestId,
        eventId,
        coordinatorId,
        recipientType
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createAdminActionNotification(coordinatorId, requestId, eventId, action, note, rescheduledDate, originalDate = null) {
    try {
      // The model helper now accepts recipientId and optional recipientType
      const notification = await Notification.createAdminActionNotification(
        coordinatorId,
        requestId,
        eventId,
        action,
        note,
        rescheduledDate,
        // default recipientType maintained by caller; the service wrapper keeps signature
        'Coordinator',
        originalDate
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createCoordinatorActionNotification(adminId, requestId, eventId, action) {
    try {
      const notification = await Notification.createCoordinatorActionNotification(
        adminId,
        requestId,
        eventId,
        action
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createAdminCancellationNotification(coordinatorId, requestId, eventId, note) {
    try {
      const notification = await Notification.createAdminCancellationNotification(
        coordinatorId,
        requestId,
        eventId,
        note
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createStakeholderCancellationNotification(stakeholderId, requestId, eventId, note) {
    try {
      const notification = await Notification.createStakeholderCancellationNotification(
        stakeholderId,
        requestId,
        eventId,
        note
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createRequestDeletionNotification(coordinatorId, requestId, eventId) {
    try {
      const notification = await Notification.createRequestDeletionNotification(
        coordinatorId,
        requestId,
        eventId
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createStakeholderDeletionNotification(stakeholderId, requestId, eventId) {
    try {
      const notification = await Notification.createStakeholderDeletionNotification(
        stakeholderId,
        requestId,
        eventId
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createNewSignupRequestNotification(coordinatorId, signupRequestId, requesterName, requesterEmail) {
    try {
      const notification = await Notification.createNewSignupRequestNotification(
        coordinatorId,
        signupRequestId,
        requesterName,
        requesterEmail
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createSignupRequestApprovedNotification(stakeholderId, signupRequestId, stakeholderName) {
    try {
      const notification = await Notification.createSignupRequestApprovedNotification(
        stakeholderId,
        signupRequestId,
        stakeholderName
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  async createSignupRequestRejectedNotification(email, signupRequestId, reason) {
    try {
      const notification = await Notification.createSignupRequestRejectedNotification(
        email,
        signupRequestId,
        reason
      );
      return {
        success: true,
        notification: notification.toObject()
      };
    } catch (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }
  }

  /**
   * Create a new message notification
   * @param {string} recipientId 
   * @param {string} recipientType 
   * @param {string} senderId 
   * @param {string} messageId 
   * @param {string} conversationId 
   * @param {string} messageContent 
   * @returns {Object} Created notification
   */
  async createNewMessageNotification(recipientId, recipientType, senderId, messageId, conversationId, messageContent) {
    try {
      // Get sender details
      const sender = await User.findById(senderId) || await User.findOne({ userId: senderId });
      if (!sender) {
        throw new Error('Sender not found');
      }

      const notificationData = {
        Notification_ID: this.generateNotificationID(),
        Recipient_ID: recipientId,
        RecipientType: recipientType,
        Title: 'New Message',
        Message: `You have a new message from ${sender.firstName} ${sender.lastName}`,
        NotificationType: 'NewMessage',
        Message_ID: messageId,
        Sender_ID: senderId,
        Conversation_ID: conversationId
      };

      return await this.createNotification(notificationData);
    } catch (error) {
      throw new Error(`Failed to create message notification: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();

