/**
 * Notification Preferences Controller
 * 
 * Handles HTTP requests for user notification preferences
 */

const { UserNotificationPreferences, User } = require('../../models/index');

class NotificationPreferencesController {
  /**
   * Get current user's notification preferences
   * GET /api/users/me/notification-preferences
   */
  async getMyPreferences(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      return res.status(200).json({
        success: true,
        data: {
          preferences: preferences.toObject()
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error getting my preferences:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get notification preferences'
      });
    }
  }

  /**
   * Get user notification preferences
   * GET /api/users/:userId/notification-preferences
   */
  async getPreferences(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;

      // Allow users to read their own preferences without permission check
      const requesterIdStr = requesterId ? requesterId.toString() : null;
      const targetUserIdStr = userId ? userId.toString() : null;

      if (requesterIdStr && targetUserIdStr && requesterIdStr !== targetUserIdStr) {
        // Reading another user's preferences - check permission
        const permissionService = require('../../services/users_services/permission.service');
        const canRead = await permissionService.checkPermission(requesterId, 'user', 'read');
        if (!canRead) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to read this user\'s preferences'
          });
        }
      }

      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      return res.status(200).json({
        success: true,
        data: {
          preferences: preferences.toObject()
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error getting preferences:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get notification preferences'
      });
    }
  }

  /**
   * Update current user's notification preferences
   * PUT /api/users/me/notification-preferences
   */
  async updateMyPreferences(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const updateData = req.body;
      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      // Validate critical notification types cannot be disabled
      const CRITICAL_TYPES = ['request.approved', 'request.rejected', 'request.rescheduled'];
      if (updateData.enabledNotificationTypes !== undefined) {
        const newEnabledTypes = updateData.enabledNotificationTypes;
        // If it's an array (not empty), ensure critical types are included
        if (Array.isArray(newEnabledTypes) && newEnabledTypes.length > 0) {
          const missingCritical = CRITICAL_TYPES.filter(type => !newEnabledTypes.includes(type));
          if (missingCritical.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Critical notification types cannot be disabled: ${missingCritical.join(', ')}`
            });
          }
        }
      }

      // Update allowed fields
      const allowedFields = [
        'emailNotificationsEnabled',
        'emailDigestMode',
        'emailDigestFrequency',
        'enabledNotificationTypes',
        'mutedUntil',
        'autoDigestThreshold',
        'autoDigestRevertHours'
      ];

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          preferences[field] = updateData[field];
        }
      }

      // If disabling temporary digest mode manually, clear it
      if (updateData.emailDigestMode === false && preferences.temporaryDigestMode) {
        await preferences.disableTemporaryDigest();
      }

      // Validate mute duration (max 30 days)
      if (preferences.mutedUntil) {
        const maxMuteDate = new Date();
        maxMuteDate.setDate(maxMuteDate.getDate() + 30);
        if (preferences.mutedUntil > maxMuteDate) {
          return res.status(400).json({
            success: false,
            message: 'Mute duration cannot exceed 30 days'
          });
        }
      }

      await preferences.save();

      return res.status(200).json({
        success: true,
        message: 'Notification preferences updated successfully',
        data: {
          preferences: preferences.toObject()
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error updating my preferences:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update notification preferences'
      });
    }
  }

  /**
   * Update user notification preferences
   * PUT /api/users/:userId/notification-preferences
   */
  async updatePreferences(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;
      const updateData = req.body;

      // Allow users to update their own preferences without permission check
      const requesterIdStr = requesterId ? requesterId.toString() : null;
      const targetUserIdStr = userId ? userId.toString() : null;

      if (requesterIdStr && targetUserIdStr && requesterIdStr !== targetUserIdStr) {
        // Updating another user's preferences - check permission
        const permissionService = require('../../services/users_services/permission.service');
        const canUpdate = await permissionService.checkPermission(requesterId, 'user', 'update');
        if (!canUpdate) {
          return res.status(403).json({
            success: false,
            message: 'You do not have permission to update this user\'s preferences'
          });
        }
      }

      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      // Validate critical notification types cannot be disabled
      const CRITICAL_TYPES = ['request.approved', 'request.rejected', 'request.rescheduled'];
      if (updateData.enabledNotificationTypes !== undefined) {
        const newEnabledTypes = updateData.enabledNotificationTypes;
        // If it's an array (not empty), ensure critical types are included
        if (Array.isArray(newEnabledTypes) && newEnabledTypes.length > 0) {
          const missingCritical = CRITICAL_TYPES.filter(type => !newEnabledTypes.includes(type));
          if (missingCritical.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Critical notification types cannot be disabled: ${missingCritical.join(', ')}`
            });
          }
        }
      }

      // Update allowed fields
      const allowedFields = [
        'emailNotificationsEnabled',
        'emailDigestMode',
        'emailDigestFrequency',
        'enabledNotificationTypes',
        'mutedUntil',
        'autoDigestThreshold',
        'autoDigestRevertHours'
      ];

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          preferences[field] = updateData[field];
        }
      }

      // If disabling temporary digest mode manually, clear it
      if (updateData.emailDigestMode === false && preferences.temporaryDigestMode) {
        await preferences.disableTemporaryDigest();
      }

      // Validate mute duration (max 30 days)
      if (preferences.mutedUntil) {
        const maxMuteDate = new Date();
        maxMuteDate.setDate(maxMuteDate.getDate() + 30);
        if (preferences.mutedUntil > maxMuteDate) {
          return res.status(400).json({
            success: false,
            message: 'Mute duration cannot exceed 30 days'
          });
        }
      }

      await preferences.save();

      return res.status(200).json({
        success: true,
        message: 'Notification preferences updated successfully',
        data: {
          preferences: preferences.toObject()
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error updating preferences:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update notification preferences'
      });
    }
  }

  /**
   * Toggle digest mode
   * POST /api/users/:userId/notification-preferences/toggle-digest
   */
  async toggleDigestMode(req, res) {
    try {
      const { userId } = req.params;
      const requesterId = req.user?.id || req.user?._id;

      // Allow users to toggle their own digest mode
      const requesterIdStr = requesterId ? requesterId.toString() : null;
      const targetUserIdStr = userId ? userId.toString() : null;

      if (requesterIdStr && targetUserIdStr && requesterIdStr !== targetUserIdStr) {
        return res.status(403).json({
          success: false,
          message: 'You can only toggle your own digest mode'
        });
      }

      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      // Toggle digest mode
      preferences.emailDigestMode = !preferences.emailDigestMode;

      // If disabling digest mode, also disable temporary digest mode
      if (!preferences.emailDigestMode && preferences.temporaryDigestMode) {
        await preferences.disableTemporaryDigest();
      }

      await preferences.save();

      return res.status(200).json({
        success: true,
        message: `Digest mode ${preferences.emailDigestMode ? 'enabled' : 'disabled'}`,
        data: {
          emailDigestMode: preferences.emailDigestMode,
          temporaryDigestMode: preferences.temporaryDigestMode
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error toggling digest mode:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to toggle digest mode'
      });
    }
  }

  /**
   * Mute or unmute notifications for current user
   * POST /api/users/me/notification-preferences/mute
   */
  async muteNotifications(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const { mutedUntil } = req.body;
      const preferences = await UserNotificationPreferences.getOrCreate(userId);

      if (mutedUntil === null || mutedUntil === undefined) {
        // Unmute
        await preferences.unmute();
        return res.status(200).json({
          success: true,
          message: 'Notifications unmuted',
          data: {
            preferences: preferences.toObject()
          }
        });
      }

      // Validate mute duration (max 30 days)
      const muteDate = new Date(mutedUntil);
      const maxMuteDate = new Date();
      maxMuteDate.setDate(maxMuteDate.getDate() + 30);
      
      if (muteDate > maxMuteDate) {
        return res.status(400).json({
          success: false,
          message: 'Mute duration cannot exceed 30 days'
        });
      }

      if (muteDate <= new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Mute date must be in the future'
        });
      }

      preferences.mutedUntil = muteDate;
      await preferences.save();

      return res.status(200).json({
        success: true,
        message: `Notifications muted until ${muteDate.toISOString()}`,
        data: {
          preferences: preferences.toObject()
        }
      });
    } catch (error) {
      console.error('[NOTIFICATION PREFERENCES CONTROLLER] Error muting notifications:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to mute notifications'
      });
    }
  }
}

module.exports = new NotificationPreferencesController();

