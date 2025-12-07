class TypingService {
  constructor() {
    this.typingUsers = new Map(); // conversationId -> Set of userIds
  }

  // Start typing
  startTyping(conversationId, userId) {
    if (!this.typingUsers.has(conversationId)) {
      this.typingUsers.set(conversationId, new Set());
    }
    this.typingUsers.get(conversationId).add(userId);
  }

  // Stop typing
  stopTyping(conversationId, userId) {
    if (this.typingUsers.has(conversationId)) {
      this.typingUsers.get(conversationId).delete(userId);
      if (this.typingUsers.get(conversationId).size === 0) {
        this.typingUsers.delete(conversationId);
      }
    }
  }

  // Get typing users for conversation
  getTypingUsers(conversationId) {
    return this.typingUsers.get(conversationId) || new Set();
  }

  // Check if user is typing in conversation
  isTyping(conversationId, userId) {
    return this.typingUsers.has(conversationId) &&
           this.typingUsers.get(conversationId).has(userId);
  }

  // Clear all typing for user (when disconnect)
  clearUserTyping(userId) {
    for (const [conversationId, users] of this.typingUsers.entries()) {
      users.delete(userId);
      if (users.size === 0) {
        this.typingUsers.delete(conversationId);
      }
    }
  }
}

module.exports = new TypingService();