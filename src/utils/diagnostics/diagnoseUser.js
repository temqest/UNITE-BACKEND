/**
 * User Completeness Diagnostic Script
 * 
 * This script checks if a user has complete information including:
 * - Role assignments (UserRole)
 * - Permissions (derived from roles)
 * - Organization assignments
 * - Coverage area assignments
 * 
 * Usage:
 *   node src/utils/diagnoseUser.js <userId|email>
 *   node src/utils/diagnoseUser.js user@example.com
 *   node src/utils/diagnoseUser.js 507f1f77bcf86cd799439011
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { 
  User, 
  UserRole, 
  Role, 
  UserCoverageAssignment, 
  CoverageArea,
  Organization,
  UserLocation,
  Location
} = require('../models/index');

const permissionService = require('../services/users_services/permission.service');
const authorityService = require('../services/users_services/authority.service');
const userCoverageAssignmentService = require('../services/users_services/userCoverageAssignment.service');
const locationService = require('../services/utility_services/location.service');

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
}

/**
 * Find user by ID or email
 */
async function findUser(identifier) {
  if (!identifier) {
    return null;
  }

  // Try as ObjectId first
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const user = await User.findById(identifier);
    if (user) {
      return user;
    }
  }

  // Try as email
  const user = await User.findOne({ email: identifier.toLowerCase().trim() });
  if (user) {
    return user;
  }

  // Try as legacy userId
  const userByLegacy = await User.findOne({ userId: identifier });
  if (userByLegacy) {
    return userByLegacy;
  }

  return null;
}

/**
 * Check user role assignments
 */
async function checkUserRoles(userId) {
  console.log('\n📋 ROLE ASSIGNMENTS');
  console.log('─'.repeat(60));
  
  const userRoles = await UserRole.find({
    userId: userId,
    isActive: true
  }).populate('roleId').populate('assignedBy');

  if (userRoles.length === 0) {
    console.log('❌ NO ACTIVE ROLES ASSIGNED');
    console.log('   This is a critical issue - user has no role assignments.');
    return {
      hasRoles: false,
      roles: [],
      issues: ['NO_ROLES']
    };
  }

  console.log(`✓ Found ${userRoles.length} active role assignment(s):\n`);

  const roles = [];
  const issues = [];

  for (const userRole of userRoles) {
    const role = userRole.roleId;
    
    if (!role) {
      console.log(`   ❌ Role ID ${userRole.roleId} not found in database (role may be deleted)`);
      issues.push('INVALID_ROLE_REFERENCE');
      continue;
    }

    console.log(`   Role: ${role.code} (${role.name})`);
    console.log(`     - Role ID: ${role._id}`);
    console.log(`     - Assigned At: ${userRole.assignedAt || 'N/A'}`);
    console.log(`     - Assigned By: ${userRole.assignedBy ? (userRole.assignedBy.email || userRole.assignedBy._id) : 'System'}`);
    console.log(`     - Expires At: ${userRole.expiresAt || 'Never'}`);
    console.log(`     - Is Active: ${userRole.isActive ? 'Yes' : 'No'}`);
    
    if (userRole.expiresAt && new Date(userRole.expiresAt) < new Date()) {
      console.log(`     ⚠️  WARNING: Role assignment has expired!`);
      issues.push('EXPIRED_ROLE');
    }

    roles.push({
      roleId: role._id,
      roleCode: role.code,
      roleName: role.name,
      userRoleId: userRole._id,
      assignedAt: userRole.assignedAt,
      expiresAt: userRole.expiresAt,
      isExpired: userRole.expiresAt && new Date(userRole.expiresAt) < new Date()
    });

    console.log('');
  }

  return {
    hasRoles: true,
    roles: roles,
    issues: issues
  };
}

/**
 * Check user permissions
 */
async function checkUserPermissions(userId) {
  console.log('\n🔐 PERMISSIONS');
  console.log('─'.repeat(60));

  try {
    const permissions = await permissionService.getUserPermissions(userId);
    
    if (permissions.length === 0) {
      console.log('❌ NO PERMISSIONS FOUND');
      console.log('   User has no effective permissions. This could mean:');
      console.log('   - User has no roles assigned');
      console.log('   - Roles have no permissions configured');
      console.log('   - Permission resolution is failing');
      return {
        hasPermissions: false,
        permissions: [],
        capabilities: [],
        issues: ['NO_PERMISSIONS']
      };
    }

    console.log(`✓ Found ${permissions.length} permission(s):\n`);

    const capabilities = [];
    for (const perm of permissions) {
      if (perm.resource === '*') {
        if (perm.actions.includes('*')) {
          capabilities.push('*');
          console.log(`   ✓ *.* (All permissions)`);
        } else {
          perm.actions.forEach(action => {
            capabilities.push(`*.${action}`);
            console.log(`   ✓ *.${action}`);
          });
        }
      } else {
        perm.actions.forEach(action => {
          if (action === '*') {
            capabilities.push(`${perm.resource}.*`);
            console.log(`   ✓ ${perm.resource}.*`);
          } else {
            const cap = `${perm.resource}.${action}`;
            capabilities.push(cap);
            console.log(`   ✓ ${cap}`);
          }
        });
      }
    }

    const uniqueCapabilities = [...new Set(capabilities)];
    console.log(`\n   Total unique capabilities: ${uniqueCapabilities.length}`);

    // Check for operational capabilities
    const operationalCapabilities = ['request.create', 'event.create', 'event.update', 'staff.create', 'staff.update'];
    const hasOperational = operationalCapabilities.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );

    // Check for review capabilities
    const reviewCapabilities = ['request.review'];
    const hasReview = reviewCapabilities.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );

    console.log(`\n   Operational capabilities: ${hasOperational ? '✓ YES' : '❌ NO'}`);
    console.log(`   Review capabilities: ${hasReview ? '✓ YES' : '❌ NO'}`);

    const issues = [];
    if (!hasOperational && !hasReview) {
      issues.push('NO_REQUIRED_CAPABILITIES');
    }

    return {
      hasPermissions: true,
      permissions: permissions,
      capabilities: uniqueCapabilities,
      hasOperational: hasOperational,
      hasReview: hasReview,
      issues: issues
    };
  } catch (error) {
    console.log(`❌ ERROR CHECKING PERMISSIONS: ${error.message}`);
    return {
      hasPermissions: false,
      permissions: [],
      capabilities: [],
      issues: ['PERMISSION_CHECK_ERROR']
    };
  }
}

/**
 * Check user authority
 */
async function checkUserAuthority(userId) {
  console.log('\n👑 AUTHORITY');
  console.log('─'.repeat(60));

  try {
    const authority = await authorityService.calculateUserAuthority(userId);
    const tierName = authorityService.AuthorityService.getAuthorityTierName(authority);

    console.log(`   Authority Tier: ${authority} (${tierName})`);

    const tierDescriptions = {
      100: 'System Admin - Full system access',
      80: 'Operational Admin - Can manage all staff types',
      60: 'Coordinator - Has operational capabilities',
      30: 'Stakeholder - Has review-only capabilities',
      20: 'Basic User - Minimal permissions'
    };

    console.log(`   Description: ${tierDescriptions[authority] || 'Unknown tier'}`);

    return {
      authority: authority,
      tierName: tierName
    };
  } catch (error) {
    console.log(`❌ ERROR CALCULATING AUTHORITY: ${error.message}`);
    return {
      authority: null,
      tierName: 'ERROR'
    };
  }
}

/**
 * Check organization assignments
 */
async function checkOrganizations(userId) {
  console.log('\n🏢 ORGANIZATIONS');
  console.log('─'.repeat(60));

  const user = await User.findById(userId);
  if (!user) {
    return { hasOrganization: false, organizations: [], issues: ['USER_NOT_FOUND'] };
  }

  const organizations = [];
  const issues = [];
  let foundAny = false;

  // Check organizationId field on User document
  if (user.organizationId) {
    const organization = await Organization.findById(user.organizationId);
    if (organization) {
      foundAny = true;
      organizations.push({
        _id: organization._id,
        name: organization.name,
        type: organization.type,
        isActive: organization.isActive,
        source: 'User.organizationId',
        organizationType: user.organizationType,
        organizationInstitution: user.organizationInstitution
      });
      
      console.log(`✓ Organization assigned (User.organizationId): ${organization.name}`);
      console.log(`   - Organization ID: ${organization._id}`);
      console.log(`   - Organization Type: ${user.organizationType || 'N/A'}`);
      console.log(`   - Organization Institution: ${user.organizationInstitution || 'N/A'}`);
      console.log(`   - Is Active: ${organization.isActive ? 'Yes' : 'No'}`);
      
      if (!organization.isActive) {
        console.log(`   ⚠️  WARNING: Organization is not active!`);
        issues.push('INACTIVE_ORGANIZATION');
      }
      console.log('');
    } else {
      console.log(`❌ Organization ID ${user.organizationId} not found in database`);
      issues.push('INVALID_ORGANIZATION_REFERENCE');
    }
  }

  // Check UserRole.context.organizationScope (organizations per role)
  const userRoles = await UserRole.find({ userId: userId, isActive: true }).populate('roleId');
  const roleOrganizations = [];
  
  for (const userRole of userRoles) {
    if (userRole.context && userRole.context.organizationScope) {
      const orgId = userRole.context.organizationScope;
      const organization = await Organization.findById(orgId);
      
      if (organization) {
        // Check if we already added this organization (avoid duplicates)
        const alreadyAdded = organizations.find(org => org._id.toString() === organization._id.toString());
        
        if (!alreadyAdded) {
          foundAny = true;
          organizations.push({
            _id: organization._id,
            name: organization.name,
            type: organization.type,
            isActive: organization.isActive,
            source: `UserRole.context.organizationScope (Role: ${userRole.roleId?.code || userRole.roleId?._id || 'unknown'})`
          });
        }
        
        roleOrganizations.push({
          roleCode: userRole.roleId?.code || 'unknown',
          roleName: userRole.roleId?.name || 'unknown',
          organizationId: organization._id,
          organizationName: organization.name,
          isActive: organization.isActive
        });
      } else {
        console.log(`   ⚠️  WARNING: Role ${userRole.roleId?.code || 'unknown'} references organization ${orgId} that doesn't exist`);
        issues.push('INVALID_ROLE_ORGANIZATION_REFERENCE');
      }
    }
  }

  if (roleOrganizations.length > 0) {
    console.log(`✓ Found ${roleOrganizations.length} organization(s) in role context:\n`);
    for (const roleOrg of roleOrganizations) {
      console.log(`   Role: ${roleOrg.roleName} (${roleOrg.roleCode})`);
      console.log(`     - Organization: ${roleOrg.organizationName}`);
      console.log(`     - Organization ID: ${roleOrg.organizationId}`);
      console.log(`     - Is Active: ${roleOrg.isActive ? 'Yes' : 'No'}`);
      console.log('');
    }
  }
  
  // Note about multiple organizations
  if (foundAny && organizations.length > 1) {
    console.log(`ℹ️  NOTE: User has ${organizations.length} organization(s) assigned (from different sources).`);
    console.log(`   The system currently supports one organization per user (User.organizationId).`);
    console.log(`   Additional organizations may be stored in UserRole.context.organizationScope.`);
    console.log('');
  }

  // Summary
  if (!foundAny) {
    console.log('⚠️  NO ORGANIZATION ASSIGNED');
    console.log('   User has no organizationId field set.');
    console.log('   No organizations found in UserRole.context.organizationScope.');
    
    if (user.organizationType) {
      console.log(`   Note: organizationType is set to "${user.organizationType}" but no organizationId`);
    }

    return {
      hasOrganization: false,
      organizations: [],
      organizationType: user.organizationType || null,
      organizationInstitution: user.organizationInstitution || null,
      issues: ['NO_ORGANIZATION']
    };
  }

  return {
    hasOrganization: true,
    organizations: organizations,
    organizationType: user.organizationType || null,
    organizationInstitution: user.organizationInstitution || null,
    issues: issues
  };
}

/**
 * Check coverage area assignments
 */
async function checkCoverageAreas(userId) {
  console.log('\n📍 COVERAGE AREAS');
  console.log('─'.repeat(60));

  try {
    const assignments = await userCoverageAssignmentService.getUserCoverageAreas(userId, { includeInactive: false });

    if (assignments.length === 0) {
      console.log('❌ NO COVERAGE AREAS ASSIGNED');
      console.log('   This is required for coordinators.');
      console.log('   User will not be able to access location-based features.');
      return {
        hasCoverageAreas: false,
        assignments: [],
        issues: ['NO_COVERAGE_AREAS']
      };
    }

    console.log(`✓ Found ${assignments.length} active coverage area assignment(s):\n`);

    const coverageAreas = [];
    const issues = [];
    let primaryCount = 0;

    for (const assignment of assignments) {
      let coverageArea = assignment.coverageAreaId;
      
      // Populate if needed
      if (typeof coverageArea === 'string' || !coverageArea.name) {
        coverageArea = await CoverageArea.findById(assignment.coverageAreaId);
      }

      if (!coverageArea) {
        console.log(`   ❌ Coverage Area ID ${assignment.coverageAreaId} not found`);
        issues.push('INVALID_COVERAGE_AREA_REFERENCE');
        continue;
      }

      if (assignment.isPrimary) {
        primaryCount++;
      }

      console.log(`   Coverage Area: ${coverageArea.name}`);
      console.log(`     - Coverage Area ID: ${coverageArea._id}`);
      console.log(`     - Is Primary: ${assignment.isPrimary ? 'Yes' : 'No'}`);
      console.log(`     - Assigned At: ${assignment.assignedAt || 'N/A'}`);
      console.log(`     - Assigned By: ${assignment.assignedBy ? assignment.assignedBy.toString() : 'System'}`);
      console.log(`     - Expires At: ${assignment.expiresAt || 'Never'}`);
      console.log(`     - Is Active: ${assignment.isActive ? 'Yes' : 'No'}`);
      console.log(`     - Geographic Units: ${coverageArea.geographicUnits?.length || 0}`);

      if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
        console.log(`     ⚠️  WARNING: Coverage area assignment has expired!`);
        issues.push('EXPIRED_COVERAGE_AREA');
      }

      if (!coverageArea.isActive) {
        console.log(`     ⚠️  WARNING: Coverage area is not active!`);
        issues.push('INACTIVE_COVERAGE_AREA');
      }

      coverageAreas.push({
        coverageAreaId: coverageArea._id,
        coverageAreaName: coverageArea.name,
        isPrimary: assignment.isPrimary,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        isExpired: assignment.expiresAt && new Date(assignment.expiresAt) < new Date(),
        geographicUnitsCount: coverageArea.geographicUnits?.length || 0
      });

      console.log('');
    }

    if (primaryCount === 0) {
      console.log('   ⚠️  WARNING: No primary coverage area assigned');
      issues.push('NO_PRIMARY_COVERAGE_AREA');
    } else if (primaryCount > 1) {
      console.log(`   ⚠️  WARNING: Multiple primary coverage areas (${primaryCount})`);
      issues.push('MULTIPLE_PRIMARY_COVERAGE_AREAS');
    }

    return {
      hasCoverageAreas: true,
      assignments: coverageAreas,
      primaryCount: primaryCount,
      issues: issues
    };
  } catch (error) {
    console.log(`❌ ERROR CHECKING COVERAGE AREAS: ${error.message}`);
    return {
      hasCoverageAreas: false,
      assignments: [],
      issues: ['COVERAGE_AREA_CHECK_ERROR']
    };
  }
}

/**
 * Check location assignments (for stakeholders)
 */
async function checkLocations(userId) {
  console.log('\n🗺️  LOCATION ASSIGNMENTS');
  console.log('─'.repeat(60));

  try {
    // Get UserLocation assignments directly (not just accessible locations)
    const userLocationAssignments = await UserLocation.find({
      userId: userId,
      isActive: true
    }).populate('locationId').populate('assignedBy');

    if (userLocationAssignments.length === 0) {
      console.log('⚠️  NO LOCATION ASSIGNMENTS');
      console.log('   This is normal for coordinators (they use coverage areas).');
      console.log('   This may be required for stakeholders.');
      return {
        hasLocations: false,
        locations: [],
        issues: []
      };
    }

    console.log(`✓ Found ${userLocationAssignments.length} active location assignment(s):\n`);

    const locations = [];
    const issues = [];
    let primaryCount = 0;

    for (const assignment of userLocationAssignments) {
      const location = assignment.locationId;
      
      if (!location) {
        console.log(`   ❌ Location ID ${assignment.locationId} not found in database`);
        issues.push('INVALID_LOCATION_REFERENCE');
        continue;
      }

      if (assignment.isPrimary) {
        primaryCount++;
      }

      console.log(`   Location: ${location.name} (${location.type})`);
      console.log(`     - Location ID: ${location._id}`);
      console.log(`     - Scope: ${assignment.scope || 'exact'}`);
      console.log(`     - Is Primary: ${assignment.isPrimary ? 'Yes' : 'No'}`);
      console.log(`     - Assigned At: ${assignment.assignedAt || 'N/A'}`);
      console.log(`     - Assigned By: ${assignment.assignedBy ? (assignment.assignedBy.email || assignment.assignedBy._id) : 'System'}`);
      console.log(`     - Expires At: ${assignment.expiresAt || 'Never'}`);
      console.log(`     - Is Active: ${assignment.isActive ? 'Yes' : 'No'}`);

      if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
        console.log(`     ⚠️  WARNING: Location assignment has expired!`);
        issues.push('EXPIRED_LOCATION');
      }

      locations.push({
        locationId: location._id,
        locationName: location.name,
        locationType: location.type,
        scope: assignment.scope || 'exact',
        isPrimary: assignment.isPrimary,
        assignedAt: assignment.assignedAt,
        expiresAt: assignment.expiresAt,
        isExpired: assignment.expiresAt && new Date(assignment.expiresAt) < new Date()
      });

      console.log('');
    }

    if (primaryCount === 0 && userLocationAssignments.length > 0) {
      console.log('   ⚠️  WARNING: No primary location assigned');
      issues.push('NO_PRIMARY_LOCATION');
    } else if (primaryCount > 1) {
      console.log(`   ⚠️  WARNING: Multiple primary locations (${primaryCount})`);
      issues.push('MULTIPLE_PRIMARY_LOCATIONS');
    }

    return {
      hasLocations: true,
      locations: locations,
      issues: issues
    };
  } catch (error) {
    console.log(`❌ ERROR CHECKING LOCATIONS: ${error.message}`);
    return {
      hasLocations: false,
      locations: [],
      issues: ['LOCATION_CHECK_ERROR']
    };
  }
}

/**
 * Generate summary report
 */
function generateSummary(user, roleCheck, permissionCheck, authorityCheck, organizationCheck, coverageCheck, locationCheck) {
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 SUMMARY REPORT');
  console.log('='.repeat(60));

  const allIssues = [
    ...(roleCheck.issues || []),
    ...(permissionCheck.issues || []),
    ...(organizationCheck.issues || []),
    ...(coverageCheck.issues || []),
    ...(locationCheck.issues || [])
  ];

  console.log(`\nUser: ${user.email} (${user.firstName} ${user.lastName})`);
  console.log(`User ID: ${user._id}`);
  console.log(`Is Active: ${user.isActive ? 'Yes' : 'No'}`);
  console.log(`Is System Admin: ${user.isSystemAdmin ? 'Yes' : 'No'}`);

  console.log(`\nAuthority: ${authorityCheck.authority} (${authorityCheck.tierName})`);

  console.log(`\nCompleteness Check:`);
  console.log(`  Roles: ${roleCheck.hasRoles ? '✓' : '❌'} (${roleCheck.roles?.length || 0} role(s))`);
  console.log(`  Permissions: ${permissionCheck.hasPermissions ? '✓' : '❌'} (${permissionCheck.capabilities?.length || 0} capability/capabilities)`);
  console.log(`  Organization: ${organizationCheck.hasOrganization ? '✓' : '⚠️'} (${organizationCheck.organizations?.length || 0} organization(s))`);
  if (organizationCheck.organizations && organizationCheck.organizations.length > 0) {
    organizationCheck.organizations.forEach((org, idx) => {
      console.log(`    ${idx + 1}. ${org.name} (${org.source})`);
    });
  }
  console.log(`  Coverage Areas: ${coverageCheck.hasCoverageAreas ? '✓' : '❌'} (${coverageCheck.assignments?.length || 0} assignment(s))`);
  console.log(`  Locations: ${locationCheck.hasLocations ? '✓' : '⚠️'} (${locationCheck.locations?.length || 0} assignment(s))`);

  if (allIssues.length > 0) {
    console.log(`\n⚠️  ISSUES FOUND (${allIssues.length}):`);
    allIssues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  } else {
    console.log(`\n✓ NO ISSUES FOUND - User has complete information`);
  }

  // Classification
  const classification = permissionCheck.hasOperational && permissionCheck.hasReview ? 'Hybrid (Coordinator + Stakeholder)' :
                        permissionCheck.hasOperational ? 'Coordinator' :
                        permissionCheck.hasReview ? 'Stakeholder' :
                        'Basic User';

  console.log(`\nClassification: ${classification}`);

  // Recommendations
  if (allIssues.length > 0) {
    console.log(`\n💡 RECOMMENDATIONS:`);
    
    if (allIssues.includes('NO_ROLES')) {
      console.log(`  - Assign at least one role to this user`);
      console.log(`  - Use: POST /api/users/${user._id}/roles with { roleId: "<roleId>" }`);
    }
    
    if (allIssues.includes('NO_COVERAGE_AREAS') && classification === 'Coordinator') {
      console.log(`  - Assign at least one coverage area (required for coordinators)`);
      console.log(`  - Use: POST /api/users/${user._id}/coverage-areas with { coverageAreaId: "<coverageAreaId>", isPrimary: true }`);
    }
    
    if (allIssues.includes('NO_ORGANIZATION') && classification === 'Coordinator') {
      console.log(`  - Assign an organization (recommended for coordinators)`);
      console.log(`  - Update user: PUT /api/users/${user._id} with { organizationId: "<organizationId>" }`);
    }
    
    if (allIssues.includes('NO_PERMISSIONS')) {
      console.log(`  - Check if roles have permissions configured`);
      console.log(`  - Run: node src/utils/seedRoles.js to ensure roles have permissions`);
    }
  }

  return {
    user: {
      _id: user._id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      isActive: user.isActive,
      isSystemAdmin: user.isSystemAdmin
    },
    authority: authorityCheck,
    classification: classification,
    completeness: {
      hasRoles: roleCheck.hasRoles,
      hasPermissions: permissionCheck.hasPermissions,
      hasOrganization: organizationCheck.hasOrganization,
      hasCoverageAreas: coverageCheck.hasCoverageAreas,
      hasLocations: locationCheck.hasLocations
    },
    issues: allIssues,
    isComplete: allIssues.length === 0
  };
}

/**
 * Main diagnostic function
 */
async function diagnoseUser(identifier) {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 USER COMPLETENESS DIAGNOSTIC');
    console.log('='.repeat(60));
    console.log(`\nChecking user: ${identifier || 'ALL USERS'}\n`);

    // Find user
    const user = await findUser(identifier);
    
    if (!user) {
      console.log(`❌ USER NOT FOUND: ${identifier}`);
      console.log('\nTried searching by:');
      console.log('  - MongoDB ObjectId');
      console.log('  - Email address');
      console.log('  - Legacy userId field');
      return null;
    }

    console.log('✓ USER FOUND');
    console.log('─'.repeat(60));
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.firstName} ${user.middleName || ''} ${user.lastName}`.trim());
    console.log(`  User ID: ${user._id}`);
    console.log(`  Legacy ID: ${user.userId || 'N/A'}`);
    console.log(`  Is Active: ${user.isActive ? 'Yes' : 'No'}`);
    console.log(`  Is System Admin: ${user.isSystemAdmin ? 'Yes' : 'No'}`);
    console.log(`  Created At: ${user.createdAt || 'N/A'}`);
    console.log(`  Updated At: ${user.updatedAt || 'N/A'}`);

    if (!user.isActive) {
      console.log('\n⚠️  WARNING: User is not active!');
    }

    // Run all checks
    const roleCheck = await checkUserRoles(user._id);
    const permissionCheck = await checkUserPermissions(user._id);
    const authorityCheck = await checkUserAuthority(user._id);
    const organizationCheck = await checkOrganizations(user._id);
    const coverageCheck = await checkCoverageAreas(user._id);
    const locationCheck = await checkLocations(user._id);

    // Generate summary
    const summary = generateSummary(
      user,
      roleCheck,
      permissionCheck,
      authorityCheck,
      organizationCheck,
      coverageCheck,
      locationCheck
    );

    return summary;
  } catch (error) {
    console.error('\n❌ ERROR RUNNING DIAGNOSTICS:', error);
    console.error(error.stack);
    return null;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');

    const identifier = process.argv[2];

    if (!identifier) {
      console.log('Usage: node src/utils/diagnoseUser.js <userId|email>');
      console.log('Example: node src/utils/diagnoseUser.js user@example.com');
      console.log('Example: node src/utils/diagnoseUser.js 507f1f77bcf86cd799439011\n');
      process.exit(1);
    }

    await diagnoseUser(identifier);

    await mongoose.connection.close();
    console.log('\n✓ Diagnostic complete\n');
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { diagnoseUser, findUser };

