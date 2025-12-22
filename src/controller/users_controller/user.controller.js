/**
 * Unified User Controller
 * Handles HTTP requests related to the unified User model
 * Supports both new User model and legacy models during migration
 */

const { User, UserRole, UserLocation } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');
const locationService = require('../../services/utility_services/location.service');
const bcrypt = require('bcrypt');
const { signToken } = require('../../utils/jwt');

class UserController {
  /**
   * Create a new user
   * POST /api/users
   */
  async createUser(req, res) {
    try {
      const userData = req.validatedData || req.body;
      const { roles = [], locations = [] } = userData;

      // Check if email already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

      // Create user
      const user = new User({
        email: userData.email,
        firstName: userData.firstName,
        middleName: userData.middleName || null,
        lastName: userData.lastName,
        phoneNumber: userData.phoneNumber || null,
        password: hashedPassword,
        organizationType: userData.organizationType || null,
        organizationInstitution: userData.organizationInstitution || null,
        field: userData.field || null,
        isSystemAdmin: userData.isSystemAdmin || false,
        isActive: true
      });

      await user.save();

      // NEW: Validate role authority before assignment
      const requesterId = req.user?.id || req.user?._id;
      if (requesterId && roles.length > 0) {
        const authorityService = require('../../services/users_services/authority.service');
        const requesterAuthority = await authorityService.calculateUserAuthority(requesterId);
        
        for (const roleCode of roles) {
          const role = await permissionService.getRoleByCode(roleCode);
          if (role) {
            const roleAuthority = await authorityService.calculateRoleAuthority(role._id);
            if (requesterAuthority <= roleAuthority) {
              // Rollback user creation
              await User.findByIdAndDelete(user._id);
              return res.status(403).json({
                success: false,
                message: `Cannot create staff with role '${roleCode}': Your authority level is insufficient`
              });
            }
          }
        }
      }

      // Assign roles if provided
      if (roles.length > 0) {
        for (const roleCode of roles) {
          const role = await permissionService.getRoleByCode(roleCode);
          if (role) {
            await permissionService.assignRole(user._id, role._id, [], requesterId || null, null);
          }
        }
      }

      // Assign locations if provided
      if (locations.length > 0) {
        for (const loc of locations) {
          await locationService.assignUserToLocation(
            user._id,
            loc.locationId,
            loc.scope || 'exact',
            { isPrimary: loc.isPrimary || false }
          );
        }
      }

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: userResponse
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to create user'
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
      
      // Try as ObjectId first, then legacy userId
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user roles and permissions
      const roles = await permissionService.getUserRoles(user._id);
      const permissions = await permissionService.getUserPermissions(user._id);
      const locations = await locationService.getUserLocations(user._id);

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        data: {
          ...userResponse,
          roles,
          permissions,
          locations
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user'
      });
    }
  }

  /**
   * Update user
   * PUT /api/users/:userId
   */
  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updateData = req.validatedData || req.body;

      // Find user
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update user
      Object.assign(user, updateData);
      await user.save();

      // Remove password from response
      const userResponse = user.toObject();
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        message: 'User updated successfully',
        data: userResponse
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message || 'Failed to update user'
      });
    }
  }

  /**
   * Delete user (soft delete)
   * DELETE /api/users/:userId
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;

      // Find user
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Soft delete
      user.isActive = false;
      await user.save();

      return res.status(200).json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete user'
      });
    }
  }

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

      // Find user by email
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive. Please contact an administrator.'
        });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password'
        });
      }

      // Update last login
      await user.updateLastLogin();

      // Create JWT token payload (minimal - only id and email for security)
      // Role and permissions should be fetched from server, not embedded in token
      const tokenPayload = {
        id: user._id.toString(),
        email: user.email
      };

      // Sign token with shorter expiration (30 minutes default, configurable via env)
      const tokenExpiration = process.env.JWT_EXPIRES_IN || '30m';
      const token = signToken(tokenPayload, { expiresIn: tokenExpiration });

      // Prepare minimal user response for frontend
      // Full user data should be fetched via /api/auth/me endpoint
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      // Set cookie as fallback (optional, for cookie-based auth)
      // Cookie also uses minimal data for security
      const cookieData = JSON.stringify({
        id: user._id.toString(),
        email: user.email
      });

      res.cookie('unite_user', cookieData, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });

      // Return minimal user data - frontend should call /api/auth/me for full user info
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: displayName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Authentication failed'
      });
    }
  }

  /**
   * Refresh access token
   * POST /api/auth/refresh
   * 
   * Refreshes the access token if the current token is valid.
   * This allows extending the session without requiring re-login.
   * 
   * Note: This is a simple refresh mechanism. For production, consider implementing
   * a proper refresh token system with HttpOnly cookies and database storage.
   */
  async refreshToken(req, res) {
    try {
      // req.user is set by authenticate middleware
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Verify user still exists and is active
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is inactive'
        });
      }

      // Create new token with minimal payload
      const tokenPayload = {
        id: user._id.toString(),
        email: user.email
      };

      // Sign new token with same expiration as configured
      const tokenExpiration = process.env.JWT_EXPIRES_IN || '30m';
      const token = signToken(tokenPayload, { expiresIn: tokenExpiration });

      // Prepare minimal user response
      const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id.toString(),
          email: user.email,
          displayName: displayName
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to refresh token'
      });
    }
  }

  /**
   * Get current authenticated user
   * GET /api/auth/me
   * 
   * SECURITY NOTE: This endpoint returns full user data including roles, permissions, and locations.
   * This data should be:
   * - Fetched fresh from the server when needed (e.g., on app load, page refresh)
   * - Stored in memory only (React Context/State) - NEVER persisted to localStorage/sessionStorage
   * - Re-validated periodically to ensure permissions are up-to-date
   * 
   * The frontend should NOT persist this data to localStorage as it contains sensitive authorization
   * information that could be tampered with. All authorization decisions should be made server-side
   * via permission checking endpoints (/api/permissions/check, /api/pages/check, etc.).
   * 
   * Use this endpoint to:
   * - Validate the current session on app load
   * - Get fresh user data after login
   * - Re-validate user state on page refresh
   * - Check current user's roles/permissions for UI display (not for authorization decisions)
   */
  async getCurrentUser(req, res) {
    try {
      // req.user is set by authenticate middleware
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      // Find user
      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user roles and permissions from database (single source of truth)
      const roles = await permissionService.getUserRoles(user._id);
      const permissions = await permissionService.getUserPermissions(user._id);
      const locations = await locationService.getUserLocations(user._id);

      // Prepare user response
      const userResponse = user.toObject({ virtuals: true });
      delete userResponse.password;

      return res.status(200).json({
        success: true,
        user: {
          ...userResponse,
          roles: roles.map(r => ({
            _id: r._id,
            code: r.code,
            name: r.name,
            description: r.description
          })),
          permissions,
          locations
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user'
      });
    }
  }

  /**
   * List users with filtering
   * GET /api/users
   */
  async listUsers(req, res) {
    try {
      const { 
        role, 
        capability,
        organizationType, 
        isActive, 
        locationId,
        page = 1,
        limit = 50
      } = req.query;

      const query = {};

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (organizationType) {
        query.organizationType = organizationType;
      }

      // Filter by capability (permission-based)
      if (capability) {
        const capabilities = Array.isArray(capability) ? capability : [capability];
        const userIdsSet = new Set();
        
        // Get users with any of the specified capabilities
        for (const cap of capabilities) {
          const userIds = await permissionService.getUsersWithPermission(cap, { locationId });
          userIds.forEach(id => userIdsSet.add(id.toString()));
        }
        
        if (userIdsSet.size > 0) {
          // If we already have a role filter, intersect with capability filter
          if (query._id && query._id.$in) {
            const roleUserIds = new Set(query._id.$in.map(id => id.toString()));
            const intersection = Array.from(userIdsSet).filter(id => roleUserIds.has(id));
            query._id = intersection.length > 0 ? { $in: intersection } : { $in: [] };
          } else {
            query._id = { $in: Array.from(userIdsSet) };
          }
        } else {
          // No users found with these capabilities
          query._id = { $in: [] };
        }
      }

      // Filter by role (backward compatibility)
      if (role) {
        const roleDoc = await permissionService.getRoleByCode(role);
        if (roleDoc) {
          const userRoles = await UserRole.find({ 
            roleId: roleDoc._id, 
            isActive: true 
          });
          const userIds = userRoles.map(ur => ur.userId);
          
          // Intersect with existing query if capability filter was applied
          if (query._id && query._id.$in) {
            const existingIds = new Set(query._id.$in.map(id => id.toString()));
            const roleIds = new Set(userIds.map(id => id.toString()));
            const intersection = Array.from(existingIds).filter(id => roleIds.has(id));
            query._id = intersection.length > 0 ? { $in: intersection } : { $in: [] };
          } else {
            query._id = { $in: userIds };
          }
        }
      }

      // Filter by location
      if (locationId) {
        const locationUsers = await locationService.getUserLocations(null, {
          includeDescendants: true
        });
        // This would need to be implemented in locationService
        // For now, we'll filter after fetching
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const users = await User.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      // Remove passwords from response
      const usersResponse = users.map(u => {
        const userObj = u.toObject();
        delete userObj.password;
        return userObj;
      });

      return res.status(200).json({
        success: true,
        data: usersResponse,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to list users'
      });
    }
  }

  /**
   * Get user capabilities (diagnostic endpoint)
   * GET /api/users/:userId/capabilities
   */
  async getUserCapabilities(req, res) {
    try {
      const { userId } = req.params;
      
      // Find user
      let user = null;
      if (require('mongoose').Types.ObjectId.isValid(userId)) {
        user = await User.findById(userId);
      }
      if (!user) {
        user = await User.findByLegacyId(userId);
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user roles and permissions
      const roles = await permissionService.getUserRoles(user._id);
      const permissions = await permissionService.getUserPermissions(user._id);
      
      // Compute capabilities
      const capabilities = [];
      for (const perm of permissions) {
        if (perm.resource === '*') {
          if (perm.actions.includes('*')) {
            capabilities.push('*'); // All capabilities
            break;
          }
          for (const action of perm.actions) {
            capabilities.push(`*.${action}`);
          }
        } else {
          for (const action of perm.actions) {
            if (action === '*') {
              capabilities.push(`${perm.resource}.*`);
            } else {
              capabilities.push(`${perm.resource}.${action}`);
            }
          }
        }
      }

      // Check operational capabilities
      const operationalCapabilities = [
        'request.create',
        'event.create',
        'event.update',
        'staff.create',
        'staff.update'
      ];
      const hasOperational = operationalCapabilities.some(cap => capabilities.includes(cap) || capabilities.includes('*'));
      
      // Check review capabilities
      const hasReview = capabilities.includes('request.review') || capabilities.includes('*');

      return res.status(200).json({
        success: true,
        data: {
          userId: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          roles: roles.map(r => ({
            id: r._id,
            code: r.code,
            name: r.name,
            permissions: r.permissions || []
          })),
          permissions,
          capabilities: [...new Set(capabilities)],
          classification: {
            isStakeholder: hasReview,
            isCoordinator: hasOperational,
            isHybrid: hasReview && hasOperational,
            type: hasReview && hasOperational ? 'hybrid' : hasReview ? 'stakeholder' : hasOperational ? 'coordinator' : 'none'
          }
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get user capabilities'
      });
    }
  }

  /**
   * List users by permission capability
   * GET /api/users/by-capability
   */
  async listUsersByCapability(req, res) {
    try {
      const { 
        capability,
        organizationType, 
        isActive, 
        locationId,
        page = 1,
        limit = 50
      } = req.query;

      if (!capability) {
        return res.status(400).json({
          success: false,
          message: 'At least one capability parameter is required'
        });
      }

      // Get capabilities as array (support multiple capability params)
      const capabilities = Array.isArray(capability) ? capability : [capability];
      
      // Debug logging
      console.log('[listUsersByCapability] Request:', {
        capabilities,
        organizationType,
        isActive,
        locationId,
        page,
        limit
      });
      
      // Get users with ANY of the specified capabilities
      const userIdsSet = new Set();
      const capabilityResults = {};
      
      // Only pass locationId if it's defined
      const context = locationId ? { locationId } : {};
      
      for (const cap of capabilities) {
        const userIds = await permissionService.getUsersWithPermission(cap, context);
        capabilityResults[cap] = userIds.length;
        userIds.forEach(id => userIdsSet.add(id.toString()));
      }
      
      console.log('[listUsersByCapability] Capability resolution:', {
        requestedCapabilities: capabilities,
        usersPerCapability: capabilityResults,
        totalUniqueUsers: userIdsSet.size
      });

      // NEW: Authority filtering - filter out users with equal/higher authority than requester
      const requesterId = req.user?.id || req.user?._id;
      let filteredUserIds = Array.from(userIdsSet);
      
      if (requesterId && filteredUserIds.length > 0) {
        const authorityService = require('../../services/users_services/authority.service');
        filteredUserIds = await authorityService.filterUsersByAuthority(
          requesterId,
          filteredUserIds,
          context
        );
        
        console.log('[listUsersByCapability] Authority filtering:', {
          beforeFiltering: userIdsSet.size,
          afterFiltering: filteredUserIds.length
        });
      }

      // Build query
      const query = {};
      
      if (filteredUserIds.length > 0) {
        query._id = { $in: filteredUserIds };
      } else {
        // No users found with these capabilities or all filtered out by authority
        query._id = { $in: [] };
      }

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      }

      if (organizationType) {
        query.organizationType = organizationType;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const users = await User.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);
      
      console.log('[listUsersByCapability] Query results:', {
        queryUserIdCount: userIdsSet.size,
        queryConditions: Object.keys(query).length,
        totalUsers: total,
        returnedUsers: users.length,
        page,
        limit
      });

      // Remove passwords from response
      const usersResponse = users.map(u => {
        const userObj = u.toObject();
        delete userObj.password;
        return userObj;
      });

      return res.status(200).json({
        success: true,
        data: usersResponse,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to list users by capability'
      });
    }
  }
}

module.exports = new UserController();
