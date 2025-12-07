const { presenceService } = require('../../services/chat_services');

class PresenceController {
  // Get user presence
  async getPresence(req, res) {
    try {
      const { userId } = req.params;
      const presence = await presenceService.getPresence(userId);

      res.status(200).json({
        success: true,
        data: presence
      });
    } catch (error) {
      console.error('Get presence error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get presence'
      });
    }
  }

  // Get presence for multiple users
  async getPresences(req, res) {
    try {
      const { userIds } = req.body; // Array of user IDs

      if (!Array.isArray(userIds)) {
        return res.status(400).json({
          success: false,
          message: 'userIds must be an array'
        });
      }

      const presences = await presenceService.getPresences(userIds);

      res.status(200).json({
        success: true,
        data: presences
      });
    } catch (error) {
      console.error('Get presences error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get presences'
      });
    }
  }

  // Get all online users
  async getOnlineUsers(req, res) {
    try {
      const onlineUsers = await presenceService.getOnlineUsers();

      res.status(200).json({
        success: true,
        data: onlineUsers
      });
    } catch (error) {
      console.error('Get online users error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get online users'
      });
    }
  }
}

module.exports = new PresenceController();