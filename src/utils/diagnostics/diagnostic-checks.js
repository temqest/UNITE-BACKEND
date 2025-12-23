/**
 * Diagnostic Script for Stakeholder Creation Blocking
 * 
 * This script verifies data integrity for:
 * - Role-permission mappings
 * - User-role assignments
 * - Coverage area assignments
 * - Organization assignments
 * 
 * Usage: node src/utils/diagnostic-checks.js [userId]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Role, Permission, UserRole, UserCoverageAssignment, User, Organization, CoverageArea } = require('../models/index');
const permissionService = require('../services/users_services/permission.service');
const authorityService = require('../services/users_services/authority.service');

// Accept multiple env names for compatibility
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
const mongoDbName = process.env.MONGO_DB_NAME || null; // optional DB name to ensure connection to a specific DB

// Validate required environment variables
if (!rawMongoUri) {
  console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
  console.error('Please create a .env file with MONGODB_URI or MONGO_URI');
  process.exit(1);
}

// If a DB name is provided separately and the URI does not already contain a DB path, append it.
// This matches the logic in server.js
let MONGO_URI = rawMongoUri;
if (mongoDbName) {
  // Determine if the URI already has a database name portion (i.e. after the host and before query '?')
  // We'll check for '/<dbname>' before any query string.
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  // If there is no DB portion (no slash followed by non-empty segment after the host), append one.
  // A simple heuristic: if beforeQuery ends with '/' or contains '/@' (unlikely), treat as missing.
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
    } else {
      MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
    }
  }
  console.log(`[DIAG] Using database name from MONGO_DB_NAME: ${mongoDbName}`);
  console.log(`[DIAG] Final MONGO_URI: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials
} else {
  console.log(`[DIAG] No MONGO_DB_NAME specified, using database from connection string`);
}

/**
 * Find user by identifier with multiple fallback methods
 * Tries: ObjectId lookup, legacy userId lookup, email lookup
 * 
 * @param {string} identifier - User ID (ObjectId, legacy userId, or email)
 * @returns {Promise<Object|null>} User document or null if not found
 */
async function findUserByIdentifier(identifier) {
  if (!identifier) {
    console.log(`[DIAG] findUserByIdentifier: No identifier provided`);
    return null;
  }
  
  console.log(`[DIAG] findUserByIdentifier called with: ${identifier} (type: ${typeof identifier})`);
  console.log(`[DIAG] Identifier length: ${identifier?.length || 'N/A'}`);
  
  let user = null;
  
  // Try as ObjectId
  const isValidObjectId = mongoose.Types.ObjectId.isValid(identifier);
  console.log(`[DIAG] Is valid ObjectId format: ${isValidObjectId}`);
  
  if (isValidObjectId) {
    console.log(`[DIAG] Attempting User.findById('${identifier}')...`);
    try {
      user = await User.findById(identifier);
      if (user) {
        console.log(`[DIAG] ✓ Found via findById: ${user.email} (_id: ${user._id}, userId: ${user.userId || 'N/A'})`);
        return user;
      }
      console.log(`[DIAG] ✗ findById returned null`);
    } catch (error) {
      console.log(`[DIAG] ✗ findById error: ${error.message}`);
    }
  } else {
    console.log(`[DIAG] Identifier is not a valid ObjectId format, skipping findById`);
  }
  
  // Try as legacy userId
  console.log(`[DIAG] Attempting User.findByLegacyId('${identifier}')...`);
  try {
    user = await User.findByLegacyId(identifier);
    if (user) {
      console.log(`[DIAG] ✓ Found via findByLegacyId: ${user.email} (_id: ${user._id}, userId: ${user.userId || 'N/A'})`);
      return user;
    }
    console.log(`[DIAG] ✗ findByLegacyId returned null`);
  } catch (error) {
    console.log(`[DIAG] ✗ findByLegacyId error: ${error.message}`);
  }
  
  // Try as email (if contains @)
  if (identifier.includes('@')) {
    console.log(`[DIAG] Attempting User.findByEmail('${identifier}')...`);
    try {
      user = await User.findByEmail(identifier);
      if (user) {
        console.log(`[DIAG] ✓ Found via findByEmail: ${user.email} (_id: ${user._id}, userId: ${user.userId || 'N/A'})`);
        return user;
      }
      console.log(`[DIAG] ✗ findByEmail returned null`);
    } catch (error) {
      console.log(`[DIAG] ✗ findByEmail error: ${error.message}`);
    }
  } else {
    console.log(`[DIAG] Identifier does not contain '@', skipping findByEmail`);
  }
  
  console.log(`[DIAG] ✗ All lookup methods failed for: ${identifier}`);
  console.log(`[DIAG] User may not exist, or identifier format is incorrect`);
  return null;
}

async function checkRolePermissionMappings() {
  console.log('\n=== 1. Role-Permission Mappings ===\n');
  
  const roles = await Role.find().sort({ code: 1 });
  
  for (const role of roles) {
    console.log(`Role: ${role.code} (${role.name})`);
    
    // Check if role has request.review capability
    const hasReview = await permissionService.roleHasCapability(role._id, 'request.review');
    console.log(`  - Has request.review: ${hasReview ? '✓' : '❌'}`);
    
    // Check if role has staff.create permission
    const hasStaffCreate = await permissionService.roleHasCapability(role._id, 'staff.create');
    console.log(`  - Has staff.create: ${hasStaffCreate ? '✓' : '❌'}`);
    
    // Get all capabilities
    const capabilities = await permissionService.getRoleCapabilities(role._id);
    console.log(`  - All capabilities: [${capabilities.join(', ')}]`);
    
    // Calculate role authority
    const roleAuthority = await authorityService.calculateRoleAuthority(role._id);
    console.log(`  - Authority: ${roleAuthority}`);
    
    console.log('');
  }
}

async function checkUserRoleAssignments(userId) {
  console.log('\n=== 2. User-Role Assignments ===\n');
  
  if (!userId) {
    console.log('No userId provided. Checking all users with roles...\n');
    const allUserRoles = await UserRole.find({ isActive: true })
      .populate('userId', 'email firstName lastName')
      .populate('roleId', 'code name')
      .limit(10);
    
    console.log(`Found ${allUserRoles.length} active role assignments (showing first 10):`);
    for (const ur of allUserRoles) {
      const user = ur.userId;
      const role = ur.roleId;
      console.log(`  - User: ${user?.email || 'N/A'} (${user?.firstName} ${user?.lastName})`);
      console.log(`    Role: ${role?.code || 'N/A'} (${role?.name || 'N/A'})`);
      console.log(`    Active: ${ur.isActive}, Expires: ${ur.expiresAt || 'Never'}`);
      console.log('');
    }
    return;
  }
  
  const user = await findUserByIdentifier(userId);
  if (!user) {
    console.log(`❌ User not found: ${userId}`);
    console.log(`[DIAG] All lookup methods exhausted. User may not exist or ID format is incorrect.`);
    return;
  }
  
  console.log(`User: ${user.email} (${user.firstName} ${user.lastName})`);
  console.log(`  - isSystemAdmin: ${user.isSystemAdmin ? '✓' : '❌'}`);
  console.log(`  - isActive: ${user.isActive ? '✓' : '❌'}`);
  
  const userRoles = await UserRole.find({ 
    userId: user._id, 
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('roleId');
  
  console.log(`\nActive Role Assignments: ${userRoles.length}`);
  for (const ur of userRoles) {
    const role = ur.roleId;
    console.log(`  - Role: ${role?.code || 'N/A'} (${role?.name || 'N/A'})`);
    console.log(`    Assigned at: ${ur.assignedAt}`);
    console.log(`    Expires at: ${ur.expiresAt || 'Never'}`);
    
    // Check role capabilities
    if (role) {
      const capabilities = await permissionService.getRoleCapabilities(role._id);
      console.log(`    Capabilities: [${capabilities.join(', ')}]`);
    }
  }
  
  // Calculate user authority
  const userAuthority = await authorityService.calculateUserAuthority(user._id);
  console.log(`\nUser Authority: ${userAuthority}`);
  const tierName = userAuthority >= 100 ? 'SYSTEM_ADMIN' :
                   userAuthority >= 80 ? 'OPERATIONAL_ADMIN' :
                   userAuthority >= 60 ? 'COORDINATOR' :
                   userAuthority >= 40 ? 'STAKEHOLDER' : 'BASIC_USER';
  console.log(`Authority Tier: ${tierName}`);
}

async function checkCoverageAreaAssignments(userId) {
  console.log('\n=== 3. Coverage Area Assignments ===\n');
  
  if (!userId) {
    console.log('No userId provided. Skipping coverage area check.');
    return;
  }
  
  const user = await findUserByIdentifier(userId);
  if (!user) {
    console.log(`❌ User not found: ${userId}`);
    console.log(`[DIAG] All lookup methods exhausted. User may not exist or ID format is incorrect.`);
    return;
  }
  
  const assignments = await UserCoverageAssignment.find({
    userId: user._id,
    isActive: true
  }).populate('coverageAreaId');
  
  console.log(`User: ${user.email}`);
  console.log(`Active Coverage Area Assignments: ${assignments.length}`);
  
  if (assignments.length === 0) {
    console.log('  ⚠️  WARNING: User has no coverage area assignments!');
    console.log('  This may prevent stakeholder creation for non-system-admins.');
  }
  
  for (const assignment of assignments) {
    const ca = assignment.coverageAreaId;
    console.log(`  - Coverage Area: ${ca?.name || 'N/A'} (${ca?._id || 'N/A'})`);
    console.log(`    Assigned at: ${assignment.assignedAt}`);
    console.log(`    Is Primary: ${assignment.isPrimary ? '✓' : '❌'}`);
    console.log(`    Expires at: ${assignment.expiresAt || 'Never'}`);
  }
  
  // Check jurisdiction service
  const jurisdictionService = require('../services/users_services/jurisdiction.service');
  const jurisdiction = await jurisdictionService.getCreatorJurisdiction(user._id);
  console.log(`\nJurisdiction Service Result: ${jurisdiction.length} coverage areas`);
}

async function checkOrganizationAssignments(userId) {
  console.log('\n=== 4. Organization Assignments ===\n');
  
  if (!userId) {
    console.log('No userId provided. Skipping organization check.');
    return;
  }
  
  const user = await findUserByIdentifier(userId);
  if (!user) {
    console.log(`❌ User not found: ${userId}`);
    console.log(`[DIAG] All lookup methods exhausted. User may not exist or ID format is incorrect.`);
    return;
  }
  
  console.log(`User: ${user.email}`);
  console.log(`  - organizationId: ${user.organizationId || '❌ NONE'}`);
  console.log(`  - organizationType: ${user.organizationType || 'N/A'}`);
  console.log(`  - organizationInstitution: ${user.organizationInstitution || 'N/A'}`);
  
  if (user.organizationId) {
    const org = await Organization.findById(user.organizationId);
    if (org) {
      console.log(`\nOrganization Details:`);
      console.log(`  - Name: ${org.name}`);
      console.log(`  - Type: ${org.type}`);
      console.log(`  - Is Active: ${org.isActive ? '✓' : '❌'}`);
    } else {
      console.log(`\n⚠️  WARNING: Organization ${user.organizationId} not found in database!`);
    }
  } else {
    console.log(`\n⚠️  WARNING: User has no organization assigned!`);
    console.log('  This may prevent organization selection for non-system-admins.');
  }
}

async function checkAssignableRoles(userId) {
  console.log('\n=== 5. Assignable Roles Check ===\n');
  
  if (!userId) {
    console.log('No userId provided. Skipping assignable roles check.');
    return;
  }
  
  const user = await findUserByIdentifier(userId);
  if (!user) {
    console.log(`❌ User not found: ${userId}`);
    console.log(`[DIAG] All lookup methods exhausted. User may not exist or ID format is incorrect.`);
    return;
  }
  
  const userAuthority = await authorityService.calculateUserAuthority(user._id);
  console.log(`User Authority: ${userAuthority}`);
  
  const allRoles = await Role.find().sort({ name: 1 });
  console.log(`\nChecking ${allRoles.length} roles for assignability:`);
  
  const assignableRoles = [];
  for (const role of allRoles) {
    const roleAuthority = await authorityService.calculateRoleAuthority(role._id);
    const canAssign = userAuthority > roleAuthority;
    const capabilities = await permissionService.getRoleCapabilities(role._id);
    const hasReview = capabilities.includes('request.review') || capabilities.includes('*');
    
    console.log(`\n  Role: ${role.code} (${role.name})`);
    console.log(`    - Role Authority: ${roleAuthority}`);
    console.log(`    - Can Assign: ${canAssign ? '✓' : '❌'}`);
    console.log(`    - Has request.review: ${hasReview ? '✓' : '❌'}`);
    console.log(`    - Capabilities: [${capabilities.join(', ')}]`);
    
    if (canAssign && hasReview) {
      // Check if it would be filtered out by operational exclusion
      const operationalCapabilities = ['request.create', 'event.create', 'staff.create', 'staff.update'];
      const hasOperational = capabilities.some(cap => 
        operationalCapabilities.includes(cap) || cap === '*'
      );
      const wouldBeExcluded = hasOperational && !hasReview;
      
      if (!wouldBeExcluded) {
        assignableRoles.push({
          code: role.code,
          name: role.name,
          authority: roleAuthority,
          capabilities
        });
        console.log(`    - ✓ Would appear in assignable roles for stakeholder-management`);
      } else {
        console.log(`    - ⚠️  Would be EXCLUDED by operational filter`);
      }
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total assignable roles for stakeholder-management: ${assignableRoles.length}`);
  if (assignableRoles.length === 0) {
    console.log(`\n❌ PROBLEM: No assignable roles found!`);
    console.log(`This will cause the role dropdown to be disabled in the UI.`);
  } else {
    console.log(`Assignable roles:`);
    assignableRoles.forEach(r => {
      console.log(`  - ${r.code} (${r.name})`);
    });
  }
}

async function runDiagnostics() {
  try {
    console.log('Connecting to MongoDB...');
    console.log(`[DIAG] Database name: ${mongoDbName || 'from connection string'}`);
    
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB');
    console.log(`[DIAG] Connected to database: ${mongoose.connection.name}`);
    console.log('');
    
    const userId = process.argv[2] || null;
    
    if (userId) {
      console.log(`Running diagnostics for user: ${userId}\n`);
    } else {
      console.log('Running general diagnostics (no specific user)\n');
    }
    
    await checkRolePermissionMappings();
    await checkUserRoleAssignments(userId);
    await checkCoverageAreaAssignments(userId);
    await checkOrganizationAssignments(userId);
    
    if (userId) {
      await checkAssignableRoles(userId);
    }
    
    console.log('\n=== Diagnostics Complete ===\n');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error running diagnostics:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runDiagnostics();
}

module.exports = {
  checkRolePermissionMappings,
  checkUserRoleAssignments,
  checkCoverageAreaAssignments,
  checkOrganizationAssignments,
  checkAssignableRoles
};

