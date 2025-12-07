const { Presence } = require('../../models');

class PresenceService {
  // Set user online
  async setOnline(userId, socketId) {
    try {
      const presence = await Presence.findOneAndUpdate(
        { userId },
        {
          status: 'online',
          lastSeen: new Date(),
          socketId
        },
        { upsert: true, new: true }
      );
      return presence;
    } catch (error) {
      throw new Error(`Failed to set online: ${error.message}`);
    }
  }

  // Set user offline
  async setOffline(userId) {
    try {
      const presence = await Presence.findOneAndUpdate(
        { userId },
        {
          status: 'offline',
          lastSeen: new Date(),
          socketId: null
        },
        { upsert: true, new: true }
      );
      return presence;
    } catch (error) {
      throw new Error(`Failed to set offline: ${error.message}`);
    }
  }

  // Set user idle
  async setIdle(userId) {
    try {
      const presence = await Presence.findOneAndUpdate(
        { userId },
        {
          status: 'idle',
          lastSeen: new Date()
        },
        { upsert: true, new: true }
      );
      return presence;
    } catch (error) {
      throw new Error(`Failed to set idle: ${error.message}`);
    }
  }

  // Get user presence
  async getPresence(userId) {
    try {
      const presence = await Presence.findOne({ userId });
      return presence || { userId, status: 'offline', lastSeen: new Date() };
    } catch (error) {
      throw new Error(`Failed to get presence: ${error.message}`);
    }
  }

  // Get presence for multiple users
  async getPresences(userIds) {
    try {
      const presences = await Presence.find({ userId: { $in: userIds } });
      const presenceMap = {};

      userIds.forEach(id => {
        const presence = presences.find(p => p.userId === id);
        presenceMap[id] = presence || { userId: id, status: 'offline', lastSeen: new Date() };
      });

      return presenceMap;
    } catch (error) {
      throw new Error(`Failed to get presences: ${error.message}`);
    }
  }

  // Get all online users
  async getOnlineUsers() {
    try {
      const onlineUsers = await Presence.find({ status: 'online' });
      return onlineUsers;
    } catch (error) {
      throw new Error(`Failed to get online users: ${error.message}`);
    }
  }

  // Update last seen
  async updateLastSeen(userId) {
    try {
      await Presence.findOneAndUpdate(
        { userId },
        { lastSeen: new Date() },
        { upsert: true }
      );
    } catch (error) {
      // Silently fail last seen update
    }
  }
}

module.exports = new PresenceService();