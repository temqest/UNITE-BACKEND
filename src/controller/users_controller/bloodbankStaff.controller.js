const bloodbankStaffService = require('../../services/users_services/bloodbankStaff.service');
const { signToken } = require('../../utils/jwt');
const coordinatorService = require('../../services/users_services/coordinator.service');
const stakeholderService = require('../../services/users_services/stakeholder.service');

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
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }

      const result = await bloodbankStaffService.authenticateUser(email, password);

      const token = signToken({ id: result.user.id, role: result.user.staff_type, district_id: result.user.role_data?.district_id || null });

      // Set a server-side cookie so the Next.js frontend can read user info
      // during SSR and show admin/coordinator links immediately.
      try {
        const staffType = result.user.staff_type || null;
        const staffTypeStr = String(staffType || '').toLowerCase();
        // System admin is determined by StaffType === 'Admin'
        const isAdminFlag = staffType === 'Admin' || /sys|system/.test(staffTypeStr) || staffTypeStr.includes('admin');
        const cookieValue = JSON.stringify({
          role: staffType || null,
          StaffType: staffType || null, // Include StaffType for frontend compatibility
          isAdmin: !!isAdminFlag,
          First_Name: result.user.first_name || result.user.First_Name || result.user.FirstName || null,
          email: result.user.email || result.user.Email || null,
          id: result.user.id || null,
        });
        // Development: do not log cookie content to avoid leaking sensitive data
        const cookieOpts = {
          // Make cookie HttpOnly so it's only sent to the server and cannot be read by JS.
          httpOnly: true,
          // Secure cookies are required in production when SameSite='none'. During
          // local development we avoid setting secure so the cookie can be stored
          // on localhost without HTTPS. Use SameSite='lax' in development to avoid
          // browsers rejecting the cookie when Secure is false.
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000,
          path: '/',
        };
        // Ensure any previous cookie (possibly set without HttpOnly) is removed
        // before setting the new one. This prevents stale cookie values when
        // switching accounts in the same browser session.
        try {
          res.clearCookie('unite_user', { path: '/' });
        } catch (e) {}

        // Do not force domain in case different local hosts (127.0.0.1 vs localhost)
        res.cookie('unite_user', cookieValue, cookieOpts);
      } catch (e) {
        // ignore cookie set errors
      }

      // Ensure response includes StaffType for frontend compatibility
      const responseData = {
        ...result.user,
        StaffType: result.user.staff_type || null, // Add StaffType field for frontend
      };

      return res.status(200).json({
        success: result.success,
        message: result.message,
        data: responseData,
        token
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
   * Get current authenticated user info
   * GET /api/auth/me
   */
  async getCurrentUser(req, res) {
    try {
      const user = req.user || {};
      
      // If we have a user ID, fetch full user details from database
      if (user.id) {
        try {
          const result = await bloodbankStaffService.getUserById(user.id);
          if (result.success && result.user) {
            // Return user data with StaffType for frontend compatibility
            const userData = {
              ...result.user,
              StaffType: result.user.staff_type || user.StaffType || null,
              role: result.user.staff_type || user.role || null,
              isAdmin: user.StaffType === 'Admin' || (result.user.staff_type === 'Admin') || !!user.isAdmin
            };
            return res.status(200).json({
              success: true,
              data: userData
            });
          }
        } catch (e) {
          // If getUserById fails, fall through to return basic user info
        }
      }
      
      // Fallback: return basic user info from token/cookie
      return res.status(200).json({
        success: true,
        data: {
          id: user.id || null,
          role: user.role || user.StaffType || null,
          StaffType: user.StaffType || user.role || null,
          email: user.email || null,
          isAdmin: !!user.isAdmin || (user.role === 'Admin' || user.StaffType === 'Admin')
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get current user'
      });
    }
  }

  /**
   * Logout endpoint - clears cookies and server session if present
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      try {
        res.clearCookie('unite_user', { path: '/' });
        res.clearCookie('connect.sid', { path: '/' });
      } catch (e) {}

      try {
        if (req.session && typeof req.session.destroy === 'function') {
          req.session.destroy(() => {});
        }
      } catch (e) {}

      return res.status(200).json({ success: true, message: 'Logged out' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to logout' });
    }
  }

  /**
   * List users for admin or coordinator
   * Admin: return all coordinators and stakeholders (exclude the requesting admin)
   * Coordinator: return stakeholders in their district
   */
  async listUsers(req, res) {
    try {
      const requester = req.user || {};
      const role = requester.role || requester.Roles || null;
      const requesterId = requester.id;

      // Pagination params
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;

      if (role === 'Admin') {
        // Get coordinators (all)
        const coordResult = await coordinatorService.getAllCoordinators({}, 1, 1000);
        const coords = Array.isArray(coordResult?.coordinators) ? coordResult.coordinators : coordResult?.coordinators || [];

        // Get stakeholders (all)
        const stakeResult = await stakeholderService.list({}, 1, 1000);
        const stakes = Array.isArray(stakeResult?.data) ? stakeResult.data : [];

        // Normalize and combine
        const coordinators = coords
          .filter(c => !(c.Staff && (c.Staff.ID === requesterId || c.Staff.ID === requesterId)))
          .map(c => ({
            type: 'coordinator',
            id: c.Coordinator_ID,
            staff: c.Staff,
            district: c.District
          }));

        const stakeholders = stakes.map(s => ({
          type: 'stakeholder',
          id: s.Stakeholder_ID,
          first_name: s.First_Name,
          last_name: s.Last_Name,
          email: s.Email,
          district_id: s.District_ID
        }));

        return res.status(200).json({ success: true, data: { coordinators, stakeholders } });
      } else if (role === 'Coordinator') {
        // Coordinator can only see stakeholders in their district
        const districtId = requester.district_id || (requester.role_data && requester.role_data.district_id) || null;
        if (!districtId) {
          return res.status(400).json({ success: false, message: 'Coordinator district_id not found' });
        }

        const stakeResult = await stakeholderService.list({ district_id: districtId }, page, limit);
        return res.status(200).json({ success: true, data: stakeResult.data, pagination: stakeResult.pagination });
      }

      return res.status(403).json({ success: false, message: 'Admin or Coordinator access required' });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message || 'Failed to list users' });
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

