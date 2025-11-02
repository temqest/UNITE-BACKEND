const bloodbankStaffService = require('../../services/users_services/bloodbankStaff.service');

/**
 * Bloodbank Staff Controller
 * Handles all HTTP requests related to staff authentication and user management
 */
class BloodbankStaffController {
  /**
   * Authenticate user (login)
   * POST /api/auth/login
   */
  async authenticateUser(req, res) {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      const result = await bloodbankStaffService.authenticateUser(username, password);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.user
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: error.message || 'Authentication failed'
      });
    }
  }

  /**
   * Verify password for a user
   * POST /api/users/:userId/verify-password
   */
  async verifyPassword(req, res) {
    try {
      const { userId } = req.params;
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'Password is required'
        });
      }

      const isValid = await bloodbankStaffService.verifyPassword(userId, password);

      return res.status(200).json({
        success: true,
        is_valid: isValid
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Password verification failed'
      });
    }
  }

  /**
   * Change user password
   * PUT /api/users/:userId/password
   */
  async changePassword(req, res) {
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password and new password are required'
        });
      }

      const result = await bloodbankStaffService.changePassword(
        userId,
        currentPassword,
        newPassword
      );

      return res.status(200).json({
        success: result.success,
        message: result.message
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to change password'
      });
    }
  }

  /**
   * Reset password (admin operation)
   * PUT /api/users/:userId/reset-password
   */
  async resetPassword(req, res) {
    try {
      const { userId } = req.params;
      const { newPassword } = req.body;
      
      if (!newPassword) {
        return res.status(400).json({
          success: false,
          message: 'New password is required'
        });
      }

      const result = await bloodbankStaffService.resetPassword(userId, newPassword);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        credentials: result.credentials
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to reset password'
      });
    }
  }

  /**
   * Get user by ID
   * GET /api/users/:userId
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      
      const result = await bloodbankStaffService.getUserById(userId);

      return res.status(200).json({
        success: result.success,
        data: result.user
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'User not found'
      });
    }
  }

  /**
   * Get user by username
   * GET /api/users/username/:username
   */
  async getUserByUsername(req, res) {
    try {
      const { username } = req.params;
      
      const result = await bloodbankStaffService.getUserByUsername(username);

      return res.status(200).json({
        success: result.success,
        data: result.user
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'User not found'
      });
    }
  }

  /**
   * Check if username is available
   * GET /api/users/check-username/:username
   */
  async isUsernameAvailable(req, res) {
    try {
      const { username } = req.params;
      
      const isAvailable = await bloodbankStaffService.isUsernameAvailable(username);

      return res.status(200).json({
        success: true,
        is_available: isAvailable,
        username: username
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check username availability'
      });
    }
  }

  /**
   * Check if email is available
   * GET /api/users/check-email/:email
   */
  async isEmailAvailable(req, res) {
    try {
      const { email } = req.params;
      
      const isAvailable = await bloodbankStaffService.isEmailAvailable(email);

      return res.status(200).json({
        success: true,
        is_available: isAvailable,
        email: email
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check email availability'
      });
    }
  }

  /**
   * Update user profile
   * PUT /api/users/:userId/profile
   */
  async updateProfile(req, res) {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      
      const result = await bloodbankStaffService.updateProfile(userId, updateData);

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: result.user
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update profile'
      });
    }
  }

  /**
   * Get full name of user
   * GET /api/users/:userId/full-name
   */
  async getFullName(req, res) {
    try {
      const { userId } = req.params;
      
      const fullName = await bloodbankStaffService.getFullName(userId);

      return res.status(200).json({
        success: true,
        full_name: fullName,
        user_id: userId
      });
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: error.message || 'User not found'
      });
    }
  }

  /**
   * Search users by name or username
   * GET /api/users/search
   */
  async searchUsers(req, res) {
    try {
      const searchTerm = req.query.q || req.query.search;
      const limit = parseInt(req.query.limit) || 10;
      
      if (!searchTerm) {
        return res.status(400).json({
          success: false,
          message: 'Search term is required'
        });
      }

      const result = await bloodbankStaffService.searchUsers(searchTerm, limit);

      return res.status(200).json({
        success: result.success,
        data: result.users
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Search failed'
      });
    }
  }

  /**
   * Check if staff ID exists and is valid
   * GET /api/users/check-staff/:staffId
   */
  async staffExists(req, res) {
    try {
      const { staffId } = req.params;
      
      const exists = await bloodbankStaffService.staffExists(staffId);

      return res.status(200).json({
        success: true,
        exists: exists,
        staff_id: staffId
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to check staff existence'
      });
    }
  }
}

module.exports = new BloodbankStaffController();

