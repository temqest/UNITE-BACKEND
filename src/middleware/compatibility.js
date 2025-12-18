/**
 * Backward Compatibility Middleware
 * 
 * Provides compatibility layer for legacy role names, API formats, and data structures
 * during the migration period. Supports dual-write strategy.
 */

const { User } = require('../models');
const permissionService = require('../services/users_services/permission.service');

/**
 * Map legacy role names to new role codes
 */
const ROLE_MAP = {
  'Admin': 'system-admin',
  'SystemAdmin': 'system-admin',
  'Coordinator': 'coordinator',
  'Stakeholder': 'stakeholder'
};

/**
 * Normalize legacy role to new role code
 */
function normalizeLegacyRole(role) {
  if (!role) return null;
  const r = String(role).toLowerCase();
  if (r === 'admin' || r === 'systemadmin' || r === 'sysadmin') {
    return 'system-admin';
  }
  if (r === 'coordinator') {
    return 'coordinator';
  }
  if (r === 'stakeholder') {
    return 'stakeholder';
  }
  return role;
}

/**
 * Middleware to normalize legacy role in JWT token
 */
function normalizeTokenRoles(req, res, next) {
  if (req.user) {
    // Map legacy role names to new role codes
    if (req.user.role && ROLE_MAP[req.user.role]) {
      req.user.role = ROLE_MAP[req.user.role];
    }
    if (req.user.StaffType && ROLE_MAP[req.user.StaffType]) {
      req.user.StaffType = ROLE_MAP[req.user.StaffType];
      req.user.role = req.user.role || ROLE_MAP[req.user.StaffType];
    }
  }
  next();
}

/**
 * Middleware to resolve user from legacy ID
 */
async function resolveLegacyUser(req, res, next) {
  if (req.user && req.user.id) {
    // Try to find user by legacy ID
    const user = await User.findByLegacyId(req.user.id);
    if (user) {
      // Update req.user with new User model data
      req.user._id = user._id;
      req.user.userId = user.userId || req.user.id; // Preserve legacy ID
      
      // Get user roles
      const roles = await permissionService.getUserRoles(user._id);
      if (roles.length > 0) {
        req.user.role = roles[0].code;
      }
    }
  }
  next();
}

/**
 * Translate legacy API request format to new format
 */
function translateLegacyRequest(body) {
  const translated = { ...body };

  // Map legacy coordinator_id/stakeholder_id to requester
  if (body.coordinator_id || body.stakeholder_id) {
    translated.requester = {
      id: body.coordinator_id || body.stakeholder_id,
      roleSnapshot: body.made_by_role || (body.coordinator_id ? 'coordinator' : 'stakeholder')
    };
  }

  // Map legacy location fields to new location structure
  if (body.province || body.district || body.municipality) {
    translated.location = {
      province: body.province,
      district: body.district,
      municipality: body.municipality
    };
  }

  return translated;
}

/**
 * Translate new API response format to legacy format
 */
function translateToLegacyResponse(data) {
  if (!data) return data;

  const legacy = { ...data };

  // Map requester to legacy fields
  if (data.requester) {
    if (data.requester.roleSnapshot === 'coordinator') {
      legacy.coordinator_id = data.requester.id || data.requester.userId;
    } else if (data.requester.roleSnapshot === 'stakeholder') {
      legacy.stakeholder_id = data.requester.id || data.requester.userId;
    }
    legacy.made_by_id = data.requester.id || data.requester.userId;
    legacy.made_by_role = data.requester.roleSnapshot;
  }

  // Map location to legacy fields
  if (data.location) {
    legacy.province = data.location.province;
    legacy.district = data.location.district;
    legacy.municipality = data.location.municipality;
  }

  return legacy;
}

/**
 * Dual-write helper: Write to both old and new models
 */
async function dualWrite(oldModel, newModel, data, oldIdField, newIdField) {
  try {
    // Write to new model
    const newRecord = await newModel.create(data);
    
    // Write to old model if it exists
    if (oldModel) {
      const oldData = {
        ...data,
        [oldIdField]: data[newIdField] || newRecord[newIdField]
      };
      try {
        await oldModel.create(oldData);
      } catch (err) {
        // Ignore errors in old model write (it may not exist)
        console.warn('Dual-write to old model failed (expected during migration):', err.message);
      }
    }
    
    return newRecord;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if system is in migration mode
 */
function isMigrationMode() {
  return process.env.MIGRATION_MODE === 'true' || process.env.ENABLE_DUAL_WRITE === 'true';
}

module.exports = {
  normalizeLegacyRole,
  normalizeTokenRoles,
  resolveLegacyUser,
  translateLegacyRequest,
  translateToLegacyResponse,
  dualWrite,
  isMigrationMode,
  ROLE_MAP
};
