const mongoose = require('mongoose');
const { Role, Permission, UserRole, UserCoverageAssignment, CoverageArea } = require('../../models/index');
const userCoverageAssignmentService = require('./userCoverageAssignment.service');

class PermissionService {
  /**
   * Check if a user has a specific permission
   * @param {string|ObjectId} userId - User ID
   * @param {string} resource - Resource name (e.g., 'event', 'request', 'user')
   * @param {string} action - Action name (e.g., 'create', 'read', 'update', 'delete', 'review', 'approve')
   * @param {Object} context - Optional context (e.g., { locationId: ObjectId })
   * @returns {Promise<boolean>} True if user has permission
   */
  async checkPermission(userId, resource, action, context = {}) {
    try {
      // 1. Get all active roles for user
      let userRoles = await UserRole.find({ 
        userId, 
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      if (userRoles.length === 0) {
        return false;
      }

      // 2. Check location scope if provided (backward compatible)
      if (context.locationId) {
        userRoles = await this.filterByLocationScope(userRoles, context.locationId);
      }
      
      // 3. Check coverage area scope if provided
      if (context.coverageAreaId) {
        userRoles = await this.filterByCoverageAreaScope(userRoles, context.coverageAreaId);
      }
      
      // 4. Check geographic unit via coverage areas if provided
      if (context.geographicUnitId) {
        userRoles = await this.filterByGeographicUnitViaCoverage(userRoles, context.geographicUnitId);
      }

      // 5. Aggregate permissions from all roles
      const permissions = await this.aggregatePermissions(userRoles);

      // 6. Check if permission exists
      return permissions.some(p => {
        // Handle wildcard permissions
        if (p.resource === '*' && (p.actions.includes('*') || p.actions.includes(action))) {
          return true;
        }
        if (p.resource === resource && (p.actions.includes('*') || p.actions.includes(action))) {
          return true;
        }
        return false;
      });
    } catch (error) {
      console.error('Error checking permission:', error);
      return false;
    }
  }

  /**
   * Get all permissions for a user with optional location scope
   * @param {string|ObjectId} userId - User ID
   * @param {ObjectId|Object} locationScopeOrContext - Optional location ID to filter by, or context object
   * @param {Object} context - Optional context object (if locationScopeOrContext is not an object)
   * @returns {Promise<Array>} Array of permission objects
   */
  async getUserPermissions(userId, locationScopeOrContext = null, context = {}) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] getUserPermissions called with userId: ${userId}, type: ${typeof userId}`);
      
      // Handle backward compatibility: if second param is an object with context properties, treat it as context
      let locationScope = null;
      let actualContext = context;
      
      if (locationScopeOrContext && typeof locationScopeOrContext === 'object' && 
          (locationScopeOrContext.locationId !== undefined || locationScopeOrContext.coverageAreaId !== undefined || locationScopeOrContext.geographicUnitId !== undefined)) {
        // It's a context object (has context properties)
        actualContext = locationScopeOrContext;
        locationScope = actualContext.locationId || null;
      } else {
        // It's a locationScope (backward compatibility - could be ObjectId, string, or null)
        locationScope = locationScopeOrContext;
      }

      // Convert userId to ObjectId if it's a valid ObjectId string
      let actualUserId = userId;
      let userIdIsObjectId = false;
      
      if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        actualUserId = new mongoose.Types.ObjectId(userId);
        userIdIsObjectId = true;
        console.log(`[DIAG] Converted userId string to ObjectId: ${actualUserId}`);
      } else if (userId instanceof mongoose.Types.ObjectId) {
        userIdIsObjectId = true;
        console.log(`[DIAG] userId is already ObjectId: ${actualUserId}`);
      } else {
        console.log(`[DIAG] userId is string format: ${actualUserId}`);
      }
      
      console.log(`[DIAG] Querying UserRole.find({ userId: ${actualUserId}, isActive: true })`);

      let userRoles = await UserRole.find({ 
        userId: actualUserId, 
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');
      
      console.log(`[DIAG] Found ${userRoles.length} active role assignments`);
      
      // Fallback: if no roles found and userId was converted to ObjectId, try original string format
      if (userRoles.length === 0 && userIdIsObjectId && typeof userId === 'string') {
        console.log(`[DIAG] No roles found with ObjectId, trying string format: ${userId}`);
        userRoles = await UserRole.find({ 
          userId: userId, 
          isActive: true,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }).populate('roleId');
        console.log(`[DIAG] Found ${userRoles.length} active role assignments with string format`);
      }
      
      // Diagnostic: Check if roles are populated
      for (let i = 0; i < userRoles.length; i++) {
        const ur = userRoles[i];
        const role = ur.roleId;
        console.log(`[DIAG] UserRole[${i}]:`, {
          userRoleId: ur._id,
          roleIdRef: ur.roleId,
          roleIsPopulated: role && typeof role === 'object' && role._id,
          roleType: typeof role,
          roleCode: role?.code,
          roleName: role?.name,
          hasPermissions: !!(role && role.permissions),
          permissionsLength: role?.permissions?.length || 0
        });
      }

      if (locationScope) {
        userRoles = await this.filterByLocationScope(userRoles, locationScope);
      }

      // Support coverage area scope (new)
      if (actualContext?.coverageAreaId) {
        userRoles = await this.filterByCoverageAreaScope(userRoles, actualContext.coverageAreaId);
        console.log(`[DIAG] After coverage area filter: ${userRoles.length} roles`);
      }

      const permissions = await this.aggregatePermissions(userRoles);
      console.log(`[DIAG] Aggregated ${permissions.length} permissions from ${userRoles.length} roles`);
      
      return permissions;
    } catch (error) {
      console.error('[DIAG] Error getting user permissions:', error);
      return [];
    }
  }

  /**
   * Assign a role to a user
   * @param {string|ObjectId} userId - User ID
   * @param {string|ObjectId} roleId - Role ID
   * @param {Array<ObjectId>} locationScope - Optional array of location IDs
   * @param {string|ObjectId} assignedBy - User ID who assigned the role
   * @param {Date} expiresAt - Optional expiration date
   * @returns {Promise<Object>} Created UserRole document
   */
  async assignRole(userId, roleId, locationScope = [], assignedBy = null, expiresAt = null, coverageAreaScope = [], session = null) {
    try {
      // Verify role exists
      const role = await Role.findById(roleId).session(session);
      if (!role) {
        throw new Error('Role not found');
      }

      // Check if user already has this role (active)
      const existingRole = await UserRole.findOne({
        userId,
        roleId,
        isActive: true
      }).session(session);

      if (existingRole) {
        // Update existing role assignment
        existingRole.context = existingRole.context || {};
        existingRole.context.locationScope = locationScope || existingRole.context.locationScope || [];
        existingRole.context.coverageAreaScope = coverageAreaScope || existingRole.context.coverageAreaScope || [];
        existingRole.assignedBy = assignedBy;
        existingRole.expiresAt = expiresAt;
        existingRole.assignedAt = new Date();
        return await existingRole.save({ session });
      }

      // Create new role assignment
      const userRole = new UserRole({
        userId,
        roleId,
        assignedBy,
        expiresAt,
        context: {
          locationScope: locationScope || [],
          coverageAreaScope: coverageAreaScope || []
        }
      });

      return await userRole.save({ session });
    } catch (error) {
      throw new Error(`Failed to assign role: ${error.message}`);
    }
  }

  /**
   * Revoke a role from a user
   * @param {string|ObjectId} userId - User ID
   * @param {string|ObjectId} roleId - Role ID (optional, if not provided, revokes all roles)
   * @returns {Promise<Object>} Update result
   */
  async revokeRole(userId, roleId = null) {
    try {
      const query = { userId, isActive: true };
      if (roleId) {
        query.roleId = roleId;
      }

      return await UserRole.updateMany(query, { isActive: false });
    } catch (error) {
      throw new Error(`Failed to revoke role: ${error.message}`);
    }
  }

  /**
   * Find users who have a specific permission
   * @param {string} permission - Permission code (e.g., 'request.review') or object with resource and action
   * @param {ObjectId|Object} locationScopeOrContext - Optional location ID to filter by, or context object
   * @param {Object} context - Optional context object (if locationScopeOrContext is not an object)
   * @returns {Promise<Array>} Array of user IDs
   */
  async getUsersWithPermission(permission, locationScopeOrContext = null, context = {}) {
    try {
      // Handle backward compatibility: if second param is an object with context properties, treat it as context
      let locationScope = null;
      let actualContext = context;
      
      if (locationScopeOrContext && typeof locationScopeOrContext === 'object' && 
          (locationScopeOrContext.locationId !== undefined || locationScopeOrContext.coverageAreaId !== undefined || locationScopeOrContext.geographicUnitId !== undefined)) {
        // It's a context object (has context properties)
        actualContext = locationScopeOrContext;
        locationScope = actualContext.locationId || null;
      } else {
        // It's a locationScope (backward compatibility - could be ObjectId, string, or null)
        locationScope = locationScopeOrContext;
      }

      let resource, action;
      
      // Handle permission string format (e.g., 'request.review')
      if (typeof permission === 'string') {
        const parts = permission.split('.');
        resource = parts[0];
        action = parts[1];
      } else {
        resource = permission.resource;
        action = permission.action;
      }

      // Get all roles that have this permission
      const roles = await Role.find({
        $or: [
          { 'permissions.resource': '*', 'permissions.actions': { $in: ['*', action] } },
          { 'permissions.resource': resource, 'permissions.actions': { $in: ['*', action] } }
        ]
      });

      console.log(`[getUsersWithPermission] Found ${roles.length} roles with permission ${resource}.${action}:`, 
        roles.map(r => ({ id: r._id, code: r.code, name: r.name })));

      if (roles.length === 0) {
        console.log(`[getUsersWithPermission] No roles found with permission ${resource}.${action}`);
        return [];
      }

      const roleIds = roles.map(r => r._id);

      // Get all user roles with these role IDs
      let userRoles = await UserRole.find({
        roleId: { $in: roleIds },
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      console.log(`[getUsersWithPermission] Found ${userRoles.length} active UserRole assignments for permission ${resource}.${action}`);

      // Filter by location scope if provided (backward compatible)
      // Only filter if locationScope is a valid value (not null, undefined, or empty object)
      if (locationScope && 
          locationScope !== null && 
          locationScope !== undefined &&
          !(typeof locationScope === 'object' && Object.keys(locationScope).length === 0)) {
        userRoles = await this.filterByLocationScope(userRoles, locationScope);
      }
      
      // Support coverage area scope (new)
      if (actualContext?.coverageAreaId) {
        userRoles = await this.filterByCoverageAreaScope(userRoles, actualContext.coverageAreaId);
      }

      // Extract unique user IDs
      const userIds = [...new Set(userRoles.map(ur => ur.userId.toString()))];
      console.log(`[getUsersWithPermission] Returning ${userIds.length} unique user IDs for permission ${resource}.${action}:`, userIds);
      return userIds;
    } catch (error) {
      console.error('Error getting users with permission:', error);
      return [];
    }
  }

  /**
   * Get all roles for a user
   * @param {string|ObjectId} userId - User ID
   * @returns {Promise<Array>} Array of role documents
   */
  async getUserRoles(userId) {
    try {
      // Diagnostic logging
      console.log(`[DIAG] getUserRoles called with userId: ${userId}, type: ${typeof userId}`);
      
      // Convert userId to ObjectId if it's a valid ObjectId string
      let actualUserId = userId;
      if (typeof userId === 'string' && mongoose.Types.ObjectId.isValid(userId)) {
        actualUserId = new mongoose.Types.ObjectId(userId);
        console.log(`[DIAG] Converted userId string to ObjectId: ${actualUserId}`);
      }
      
      console.log(`[DIAG] Querying UserRole.find({ userId: ${actualUserId}, isActive: true })`);
      
      const userRoles = await UserRole.find({
        userId: actualUserId,
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      console.log(`[DIAG] Found ${userRoles.length} active role assignments for user ${userId}`);
      if (userRoles.length > 0) {
        console.log(`[DIAG] Role codes: [${userRoles.map(ur => ur.roleId?.code || 'N/A').join(', ')}]`);
      }

      return userRoles.map(ur => ur.roleId).filter(r => r !== null);
    } catch (error) {
      console.error('[DIAG] Error getting user roles:', error);
      return [];
    }
  }

  /**
   * Aggregate permissions from user roles
   * @private
   * @param {Array} userRoles - Array of UserRole documents with populated roleId
   * @returns {Promise<Array>} Array of permission objects
   */
  async aggregatePermissions(userRoles) {
    const permissionsMap = new Map();

    console.log(`[DIAG] aggregatePermissions called with ${userRoles.length} userRoles`);
    
    if (!userRoles || userRoles.length === 0) {
      console.log(`[DIAG] aggregatePermissions: No userRoles provided, returning empty permissions`);
      return [];
    }
    
    let processedRoles = 0;
    let skippedRoles = 0;
    
    for (const userRole of userRoles) {
      let role = userRole.roleId;
      
      // Check if role is a Mongoose document (not just an ObjectId reference)
      const isMongooseDocument = role && typeof role === 'object' && role._id && role.constructor && role.constructor.name !== 'Object';
      const isObjectId = role && (role instanceof mongoose.Types.ObjectId || (typeof role === 'object' && role.toString && role.toString().length === 24));
      
      console.log(`[DIAG] Processing userRole:`, {
        userRoleId: userRole._id,
        roleId: role?._id || role,
        roleType: typeof role,
        roleIsObject: role && typeof role === 'object',
        isMongooseDocument,
        isObjectId,
        hasRole: !!role,
        hasPermissions: !!(role && role.permissions),
        permissionsCount: role?.permissions?.length || 0,
        roleCode: role?.code,
        roleName: role?.name
      });
      
      if (!role) {
        skippedRoles++;
        console.log(`[DIAG] Skipping userRole ${userRole._id}: role is null/undefined`);
        continue;
      }
      
      // If role is just an ObjectId (not populated), try to populate it
      if (isObjectId && !isMongooseDocument) {
        console.log(`[RBAC] aggregatePermissions - Role not populated for userRole ${userRole._id}, attempting to populate...`);
        try {
          const roleId = userRole.roleId;
          const populatedRole = await Role.findById(roleId);
          if (populatedRole) {
            userRole.roleId = populatedRole;
            role = populatedRole;
            console.log(`[RBAC] aggregatePermissions - Successfully populated role ${populatedRole.code} for userRole ${userRole._id}`);
          } else {
            skippedRoles++;
            console.error(`[RBAC] aggregatePermissions - Role ${roleId} not found in database for userRole ${userRole._id}`);
            continue;
          }
        } catch (populateError) {
          skippedRoles++;
          console.error(`[RBAC] aggregatePermissions - Failed to populate role for userRole ${userRole._id}:`, populateError.message);
          continue;
        }
      }
      
      if (!role.permissions) {
        skippedRoles++;
        console.log(`[DIAG] Skipping userRole ${userRole._id}: role.permissions is null/undefined`);
        continue;
      }
      
      if (!Array.isArray(role.permissions)) {
        skippedRoles++;
        console.log(`[DIAG] Skipping userRole ${userRole._id}: role.permissions is not an array (type: ${typeof role.permissions})`);
        continue;
      }
      
      if (role.permissions.length === 0) {
        skippedRoles++;
        console.log(`[DIAG] Skipping userRole ${userRole._id}: role.permissions is empty array`);
        continue;
      }

      processedRoles++;
      console.log(`[DIAG] Processing permissions from role ${role.code || role._id} (${role.permissions.length} permissions)`);

      for (const perm of role.permissions) {
        // Validate permission structure
        if (!perm || typeof perm !== 'object') {
          console.log(`[DIAG] Skipping invalid permission object in role ${role.code || role._id}`);
          continue;
        }
        
        if (!perm.resource || typeof perm.resource !== 'string') {
          console.log(`[DIAG] Skipping permission with invalid resource in role ${role.code || role._id}`);
          continue;
        }
        
        if (!perm.actions || !Array.isArray(perm.actions) || perm.actions.length === 0) {
          console.log(`[DIAG] Skipping permission with invalid actions in role ${role.code || role._id}`);
          continue;
        }
        // Use resource as key to merge all permissions for same resource
        const key = perm.resource;
        if (!permissionsMap.has(key)) {
          permissionsMap.set(key, {
            resource: perm.resource,
            actions: [...perm.actions],
            metadata: perm.metadata ? { ...perm.metadata } : {}
          });
        } else {
          // Merge actions
          const existing = permissionsMap.get(key);
          const newActions = [...new Set([...existing.actions, ...perm.actions])];
          
          // Merge metadata (for staff types, combine arrays)
          const mergedMetadata = { ...existing.metadata };
          if (perm.metadata) {
            if (perm.metadata.allowedStaffTypes && existing.metadata.allowedStaffTypes) {
              // If either has '*', allow all types
              if (existing.metadata.allowedStaffTypes.includes('*') || perm.metadata.allowedStaffTypes.includes('*')) {
                mergedMetadata.allowedStaffTypes = ['*'];
              } else {
                mergedMetadata.allowedStaffTypes = [
                  ...new Set([...existing.metadata.allowedStaffTypes, ...perm.metadata.allowedStaffTypes])
                ];
              }
            } else if (perm.metadata.allowedStaffTypes) {
              mergedMetadata.allowedStaffTypes = perm.metadata.allowedStaffTypes;
            } else if (existing.metadata.allowedStaffTypes) {
              // Keep existing if new doesn't have it
              mergedMetadata.allowedStaffTypes = existing.metadata.allowedStaffTypes;
            }
            // Merge other metadata fields
            Object.assign(mergedMetadata, perm.metadata);
          }
          
          permissionsMap.set(key, {
            resource: perm.resource,
            actions: newActions,
            metadata: mergedMetadata
          });
        }
      }
    }

    const finalPermissions = Array.from(permissionsMap.values());
    console.log(`[DIAG] aggregatePermissions summary:`, {
      totalUserRoles: userRoles.length,
      processedRoles,
      skippedRoles,
      finalPermissionsCount: finalPermissions.length,
      permissions: finalPermissions.map(p => `${p.resource}.${p.actions?.join(',') || '[]'}`)
    });

    return finalPermissions;
  }

  /**
   * Filter user roles by location scope
   * @private
   * @param {Array} userRoles - Array of UserRole documents
   * @param {ObjectId} locationId - Location ID to check
   * @returns {Promise<Array>} Filtered array of UserRole documents
   */
  async filterByLocationScope(userRoles, locationId) {
    const { Location, UserLocation } = require('../../models');
    const locationService = require('../utility_services/location.service');
    
    // If locationId is not provided or is an empty object, return all userRoles (no filtering)
    // Check for null, undefined, empty string, or empty object
    if (!locationId || 
        locationId === null || 
        locationId === undefined ||
        locationId === '' ||
        (typeof locationId === 'object' && Object.keys(locationId).length === 0 && !locationId.toString)) {
      return userRoles;
    }
    
    // Get all user IDs from userRoles
    const userIds = [...new Set(userRoles.map(ur => ur.userId.toString()))];
    
    // For each user, check if they have access to the location
    const validUserRoles = [];
    
    for (const userRole of userRoles) {
      const userId = userRole.userId.toString();
      const locationScope = userRole.context?.locationScope || [];
      
      // If no location scope is set in the role, check UserLocation assignments
      if (locationScope.length === 0) {
        // Only check location access if locationId is valid (not empty object or invalid)
        const mongoose = require('mongoose');
        const isValidLocationId = locationId && 
                                  locationId !== null && 
                                  locationId !== undefined &&
                                  !(typeof locationId === 'object' && Object.keys(locationId).length === 0) &&
                                  mongoose.Types.ObjectId.isValid(locationId);
        
        if (isValidLocationId) {
          // Check if user has location assignment that grants access
          const hasAccess = await locationService.checkLocationAccess(userId, locationId);
          if (hasAccess) {
            validUserRoles.push(userRole);
          }
        }
      } else {
        // Check if locationId is in the role's locationScope
        const inScope = locationScope.some(locId => locId.toString() === locationId.toString());
        
        if (inScope) {
          validUserRoles.push(userRole);
        } else {
          // Also check if any scope location is an ancestor/descendant of the target location
          // This allows hierarchical access
          let hasHierarchicalAccess = false;
          for (const scopeLocId of locationScope) {
            const scopeLocation = await Location.findById(scopeLocId);
            if (!scopeLocation) continue;
            
            // Check if target location is a descendant of scope location
            const descendants = await locationService.getLocationDescendants(scopeLocId);
            if (descendants.some(d => d._id.toString() === locationId.toString())) {
              hasHierarchicalAccess = true;
              break;
            }
            
            // Check if target location is an ancestor of scope location
            const ancestors = await locationService.getLocationAncestors(scopeLocId);
            if (ancestors.some(a => a._id.toString() === locationId.toString())) {
              hasHierarchicalAccess = true;
              break;
            }
          }
          
          if (hasHierarchicalAccess) {
            validUserRoles.push(userRole);
          }
        }
      }
    }
    
    return validUserRoles;
  }

  /**
   * Filter user roles by coverage area scope
   * @private
   * @param {Array} userRoles - Array of UserRole documents
   * @param {ObjectId} coverageAreaId - Coverage area ID to check
   * @returns {Promise<Array>} Filtered array of UserRole documents
   */
  async filterByCoverageAreaScope(userRoles, coverageAreaId) {
    const validUserRoles = [];
    
    for (const userRole of userRoles) {
      const userId = userRole.userId.toString();
      const coverageAreaScope = userRole.context?.coverageAreaScope || [];
      
      // If no coverage area scope is set in the role, check UserCoverageAssignment
      if (coverageAreaScope.length === 0) {
        // Check if user has coverage area assignment that grants access
        const assignments = await UserCoverageAssignment.findUserCoverageAreas(userId, false);
        const hasAccess = assignments.some(assignment => {
          if (assignment.isExpired() || !assignment.isActive) return false;
          const caId = assignment.coverageAreaId?._id || assignment.coverageAreaId;
          return caId.toString() === coverageAreaId.toString();
        });
        
        if (hasAccess) {
          validUserRoles.push(userRole);
        }
      } else {
        // Check if coverageAreaId is in the role's coverageAreaScope
        const inScope = coverageAreaScope.some(caId => caId.toString() === coverageAreaId.toString());
        
        if (inScope) {
          validUserRoles.push(userRole);
        }
      }
    }
    
    return validUserRoles;
  }

  /**
   * Filter user roles by geographic unit via coverage areas
   * @private
   * @param {Array} userRoles - Array of UserRole documents
   * @param {ObjectId} geographicUnitId - Geographic unit (Location) ID to check
   * @returns {Promise<Array>} Filtered array of UserRole documents
   */
  async filterByGeographicUnitViaCoverage(userRoles, geographicUnitId) {
    const validUserRoles = [];
    
    for (const userRole of userRoles) {
      const userId = userRole.userId.toString();
      
      // Check if user has access to this geographic unit via coverage areas
      const hasAccess = await userCoverageAssignmentService.userHasAccessToGeographicUnit(
        userId, 
        geographicUnitId
      );
      
      if (hasAccess) {
        validUserRoles.push(userRole);
      }
    }
    
    return validUserRoles;
  }

  /**
   * Create a new role
   * @param {Object} roleData - Role data
   * @returns {Promise<Object>} Created role
   */
  async createRole(roleData) {
    try {
      const role = new Role(roleData);
      return await role.save();
    } catch (error) {
      throw new Error(`Failed to create role: ${error.message}`);
    }
  }

  /**
   * Get role by code
   * @param {string} code - Role code
   * @returns {Promise<Object|null>} Role document or null
   */
  async getRoleByCode(code) {
    try {
      return await Role.findOne({ code: code.toLowerCase() });
    } catch (error) {
      console.error('Error getting role by code:', error);
      return null;
    }
  }

  /**
   * Get all roles
   * @returns {Promise<Array>} Array of role documents
   */
  async getAllRoles() {
    try {
      return await Role.find().sort({ name: 1 });
    } catch (error) {
      console.error('Error getting all roles:', error);
      return [];
    }
  }

  /**
   * Check if user can access a specific page
   * @param {string|ObjectId} userId - User ID
   * @param {string} pageRoute - Page route (e.g., '/dashboard', '/events', '/requests')
   * @param {Object} context - Optional context
   * @returns {Promise<boolean>} True if user can access the page
   */
  async canAccessPage(userId, pageRoute, context = {}) {
    try {
      // Normalize page route (remove leading/trailing slashes, convert to lowercase)
      const normalizedRoute = pageRoute.replace(/^\/+|\/+$/g, '').toLowerCase();
      
      // NEW: Authority-based access rules for specific pages
      if (normalizedRoute === 'coordinator-management') {
        // Coordinator management page requires SYSTEM_ADMIN or OPERATIONAL_ADMIN authority
        const authorityService = require('./authority.service');
        const userAuthority = await authorityService.calculateUserAuthority(userId, context);
        // OPERATIONAL_ADMIN = 80, so user must have at least 80
        const requiredAuthority = 80;
        
        if (userAuthority < requiredAuthority) {
          return false;
        }
      }
      
      // Check for page permission
      return await this.checkPermission(userId, 'page', normalizedRoute, context);
    } catch (error) {
      console.error('Error checking page access:', error);
      return false;
    }
  }

  /**
   * Check if user can use a specific feature
   * @param {string|ObjectId} userId - User ID
   * @param {string} featureCode - Feature code (e.g., 'create-event', 'request-blood', 'manage-inventory')
   * @param {Object} context - Optional context
   * @returns {Promise<boolean>} True if user can use the feature
   */
  async canUseFeature(userId, featureCode, context = {}) {
    try {
      return await this.checkPermission(userId, 'feature', featureCode, context);
    } catch (error) {
      console.error('Error checking feature access:', error);
      return false;
    }
  }

  /**
   * Check if user can manage staff with specific constraints
   * @param {string|ObjectId} userId - User ID
   * @param {string} action - Action (e.g., 'create', 'update', 'delete')
   * @param {string} staffType - Staff type to check (e.g., 'coordinator', 'stakeholder', 'system-admin')
   * @param {Object} context - Optional context
   * @returns {Promise<boolean>} True if user can perform the action on the staff type
   */
  async canManageStaff(userId, action, staffType = null, context = {}) {
    try {
      // First check if user has general staff management permission
      const hasGeneralPermission = await this.checkPermission(userId, 'staff', action, context);
      if (!hasGeneralPermission) {
        return false;
      }

      // If staffType is specified, check metadata constraints
      if (staffType) {
        const userRoles = await UserRole.find({ 
          userId, 
          isActive: true,
          $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }).populate('roleId');

        if (context.locationId) {
          const filteredRoles = await this.filterByLocationScope(userRoles, context.locationId);
          if (filteredRoles.length === 0) return false;
        }

        const permissions = await this.aggregatePermissions(userRoles);
        
        // Check if any permission allows this staff type
        for (const perm of permissions) {
          if (perm.resource === 'staff' && (perm.actions.includes('*') || perm.actions.includes(action))) {
            // Check metadata for allowed staff types
            // If metadata.allowedStaffTypes exists, check if staffType is in the list
            // If metadata.allowedStaffTypes doesn't exist or is empty, allow all types
            if (perm.metadata && perm.metadata.allowedStaffTypes) {
              if (perm.metadata.allowedStaffTypes.includes(staffType) || 
                  perm.metadata.allowedStaffTypes.includes('*')) {
                return true;
              }
            } else {
              // No metadata constraint, allow all types
              return true;
            }
          }
        }
        
        return false;
      }

      return hasGeneralPermission;
    } catch (error) {
      console.error('Error checking staff management permission:', error);
      return false;
    }
  }

  /**
   * Get all pages user can access
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Optional context
   * @returns {Promise<Array>} Array of page routes user can access
   */
  async getAccessiblePages(userId, context = {}) {
    try {
      const permissions = await this.getUserPermissions(userId, context);
      const pages = [];
      let hasWildcard = false;
      
      for (const perm of permissions) {
        // Check for wildcard permission (system-admin)
        if (perm.resource === '*' && (perm.actions.includes('*') || perm.actions.includes('page'))) {
          hasWildcard = true;
          break; // Wildcard grants all access, no need to check further
        }
        
        if (perm.resource === 'page') {
          // Actions array contains page routes
          pages.push(...perm.actions);
        }
      }
      
      // If user has wildcard permission, return all available page routes
      if (hasWildcard) {
        // Get all page permissions from database to return all possible pages
        // Permission is already imported at the top of the file
        const allPagePermissions = await Permission.find({ 
          resource: 'page',
          type: 'page'
        }).select('action -_id');
        
        return allPagePermissions.map(p => p.action);
      }
      
      return [...new Set(pages)]; // Remove duplicates
    } catch (error) {
      console.error('Error getting accessible pages:', error);
      return [];
    }
  }

  /**
   * Get all features user can use
   * @param {string|ObjectId} userId - User ID
   * @param {Object} context - Optional context
   * @returns {Promise<Array>} Array of feature codes user can use
   */
  async getAvailableFeatures(userId, context = {}) {
    try {
      const permissions = await this.getUserPermissions(userId, context);
      const features = [];
      
      for (const perm of permissions) {
        if (perm.resource === 'feature') {
          // Actions array contains feature codes
          features.push(...perm.actions);
        }
      }
      
      return [...new Set(features)]; // Remove duplicates
    } catch (error) {
      console.error('Error getting available features:', error);
      return [];
    }
  }

  /**
   * Get staff types user can manage
   * @param {string|ObjectId} userId - User ID
   * @param {string} action - Action (e.g., 'create', 'update', 'delete')
   * @param {Object} context - Optional context
   * @returns {Promise<Array>} Array of staff types user can manage
   */
  async getAllowedStaffTypes(userId, action, context = {}) {
    try {
      const userRoles = await UserRole.find({ 
        userId, 
        isActive: true,
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }).populate('roleId');

      if (context.locationId) {
        const filteredRoles = await this.filterByLocationScope(userRoles, context.locationId);
        if (filteredRoles.length === 0) return [];
      }

      const permissions = await this.aggregatePermissions(userRoles);
      const allowedTypes = new Set();
      
      for (const perm of permissions) {
        if (perm.resource === 'staff' && (perm.actions.includes('*') || perm.actions.includes(action))) {
          if (perm.metadata && perm.metadata.allowedStaffTypes) {
            perm.metadata.allowedStaffTypes.forEach(type => allowedTypes.add(type));
          } else {
            // No metadata constraint means all types allowed
            return ['*']; // Return wildcard to indicate all types
          }
        }
      }
      
      return Array.from(allowedTypes);
    } catch (error) {
      console.error('Error getting allowed staff types:', error);
      return [];
    }
  }

  /**
   * Get all roles that have a specific permission capability
   * @param {string} capability - Permission capability (e.g., 'request.review', 'request.create', 'event.manage')
   * @returns {Promise<Array>} Array of role documents
   */
  async getRolesByCapability(capability) {
    try {
      let resource, action;
      
      // Handle permission string format (e.g., 'request.review')
      if (typeof capability === 'string' && capability.includes('.')) {
        const parts = capability.split('.');
        resource = parts[0];
        action = parts[1];
      } else {
        throw new Error('Capability must be in format "resource.action"');
      }

      // Find roles that have this permission
      const roles = await Role.find({
        $or: [
          { 'permissions.resource': '*', 'permissions.actions': { $in: ['*', action] } },
          { 'permissions.resource': resource, 'permissions.actions': { $in: ['*', action] } }
        ]
      }).sort({ name: 1 });

      return roles;
    } catch (error) {
      console.error('Error getting roles by capability:', error);
      return [];
    }
  }

  /**
   * Check if a role has a specific capability
   * @param {string|ObjectId} roleId - Role ID
   * @param {string} capability - Permission capability (e.g., 'request.review', 'request.create')
   * @returns {Promise<boolean>} True if role has the capability
   */
  async roleHasCapability(roleId, capability) {
    try {
      let resource, action;
      
      // Handle permission string format (e.g., 'request.review')
      if (typeof capability === 'string' && capability.includes('.')) {
        const parts = capability.split('.');
        resource = parts[0];
        action = parts[1];
      } else {
        throw new Error('Capability must be in format "resource.action"');
      }

      const role = await Role.findById(roleId);
      if (!role || !role.permissions) {
        return false;
      }

      // Check if role has this permission
      return role.permissions.some(perm => {
        // Check wildcard permissions
        if (perm.resource === '*' && (perm.actions.includes('*') || perm.actions.includes(action))) {
          return true;
        }
        // Check specific resource permission
        if (perm.resource === resource && (perm.actions.includes('*') || perm.actions.includes(action))) {
          return true;
        }
        return false;
      });
    } catch (error) {
      console.error('Error checking role capability:', error);
      return false;
    }
  }

  /**
   * Get all capabilities for a role
   * @param {string|ObjectId} roleId - Role ID
   * @returns {Promise<Array>} Array of capability strings (e.g., ['request.review', 'request.create'])
   */
  async getRoleCapabilities(roleId) {
    try {
      const role = await Role.findById(roleId);
      if (!role || !role.permissions) {
        return [];
      }

      const capabilities = [];
      
      for (const perm of role.permissions) {
        // Handle wildcard permissions
        if (perm.resource === '*') {
          // Wildcard resource with wildcard actions means all capabilities
          if (perm.actions.includes('*')) {
            // Return a special marker or fetch all possible capabilities
            // For now, we'll return a wildcard indicator
            return ['*']; // Indicates all capabilities
          }
          // Wildcard resource with specific actions - not typical, but handle it
          for (const action of perm.actions) {
            capabilities.push(`*.${action}`);
          }
        } else {
          // Specific resource permissions
          for (const action of perm.actions) {
            if (action === '*') {
              // All actions for this resource - we'd need to know all possible actions
              // For now, just add the resource.* pattern
              capabilities.push(`${perm.resource}.*`);
            } else {
              capabilities.push(`${perm.resource}.${action}`);
            }
          }
        }
      }

      return [...new Set(capabilities)]; // Remove duplicates
    } catch (error) {
      console.error('Error getting role capabilities:', error);
      return [];
    }
  }
}

module.exports = new PermissionService();
