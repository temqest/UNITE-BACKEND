/**
 * RBAC System Validation Script
 * 
 * Validates the RBAC system integrity:
 * - All users have at least one active UserRole
 * - All UserRole.roleId reference valid Role documents
 * - All coordinators have at least one coverage area
 * - All stakeholders have at least one location (municipality)
 * 
 * Usage:
 *   node src/utils/validateRBAC.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { 
  User, 
  UserRole, 
  Role,
  UserCoverageAssignment,
  UserLocation
} = require('../models/index');

const permissionService = require('../services/users_services/permission.service');
const authorityService = require('../services/users_services/authority.service');

// Accept multiple env names for compatibility
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
const mongoDbName = process.env.MONGO_DB_NAME || null;

if (!rawMongoUri) {
  console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
  process.exit(1);
}

let MONGO_URI = rawMongoUri;
if (mongoDbName) {
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
    } else {
      MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
    }
  }
}

/**
 * Validate all users have roles
 */
async function validateUsersHaveRoles() {
  console.log('\n📋 Validating: All users have at least one active UserRole...\n');
  
  const allUsers = await User.find({ isActive: true });
  const usersWithoutRoles = [];
  
  for (const user of allUsers) {
    const userRoles = await UserRole.find({
      userId: user._id,
      isActive: true
    });
    
    if (userRoles.length === 0) {
      usersWithoutRoles.push({
        userId: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        isSystemAdmin: user.isSystemAdmin || false
      });
    }
  }
  
  if (usersWithoutRoles.length === 0) {
    console.log(`✓ All ${allUsers.length} active users have at least one role`);
    return { valid: true, issues: [] };
  } else {
    console.log(`❌ Found ${usersWithoutRoles.length} users without roles:`);
    usersWithoutRoles.slice(0, 10).forEach((u, idx) => {
      console.log(`  ${idx + 1}. ${u.email} (${u.name})${u.isSystemAdmin ? ' [System Admin]' : ''}`);
    });
    if (usersWithoutRoles.length > 10) {
      console.log(`  ... and ${usersWithoutRoles.length - 10} more`);
    }
    return { valid: false, issues: usersWithoutRoles };
  }
}

/**
 * Validate all UserRole.roleId reference valid Roles
 */
async function validateUserRoleReferences() {
  console.log('\n📋 Validating: All UserRole.roleId reference valid Role documents...\n');
  
  const allUserRoles = await UserRole.find({ isActive: true });
  const invalidReferences = [];
  
  for (const userRole of allUserRoles) {
    const role = await Role.findById(userRole.roleId);
    if (!role) {
      const user = await User.findById(userRole.userId);
      invalidReferences.push({
        userRoleId: userRole._id,
        userId: userRole.userId,
        userEmail: user?.email || 'unknown',
        roleId: userRole.roleId,
        reason: 'Role document not found'
      });
    }
  }
  
  if (invalidReferences.length === 0) {
    console.log(`✓ All ${allUserRoles.length} active UserRole documents reference valid Role documents`);
    return { valid: true, issues: [] };
  } else {
    console.log(`❌ Found ${invalidReferences.length} UserRole documents with invalid role references:`);
    invalidReferences.slice(0, 10).forEach((r, idx) => {
      console.log(`  ${idx + 1}. UserRole ${r.userRoleId} (User: ${r.userEmail}) → Role ${r.roleId} not found`);
    });
    if (invalidReferences.length > 10) {
      console.log(`  ... and ${invalidReferences.length - 10} more`);
    }
    return { valid: false, issues: invalidReferences };
  }
}

/**
 * Validate coordinators have coverage areas
 */
async function validateCoordinatorsHaveCoverage() {
  console.log('\n📋 Validating: All coordinators have at least one coverage area...\n');
  
  // Find all users with coordinator role
  const coordinatorRole = await permissionService.getRoleByCode('coordinator');
  if (!coordinatorRole) {
    console.log('⚠️  Coordinator role not found - skipping validation');
    return { valid: true, issues: [] };
  }
  
  const coordinatorUserRoles = await UserRole.find({
    roleId: coordinatorRole._id,
    isActive: true
  });
  
  const coordinatorsWithoutCoverage = [];
  
  for (const userRole of coordinatorUserRoles) {
    const user = await User.findById(userRole.userId);
    if (!user || !user.isActive) {
      continue;
    }
    
    const coverageAssignments = await UserCoverageAssignment.find({
      userId: user._id,
      isActive: true
    });
    
    if (coverageAssignments.length === 0) {
      coordinatorsWithoutCoverage.push({
        userId: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      });
    }
  }
  
  if (coordinatorsWithoutCoverage.length === 0) {
    console.log(`✓ All ${coordinatorUserRoles.length} coordinators have at least one coverage area`);
    return { valid: true, issues: [] };
  } else {
    console.log(`❌ Found ${coordinatorsWithoutCoverage.length} coordinators without coverage areas:`);
    coordinatorsWithoutCoverage.slice(0, 10).forEach((c, idx) => {
      console.log(`  ${idx + 1}. ${c.email} (${c.name})`);
    });
    if (coordinatorsWithoutCoverage.length > 10) {
      console.log(`  ... and ${coordinatorsWithoutCoverage.length - 10} more`);
    }
    return { valid: false, issues: coordinatorsWithoutCoverage };
  }
}

/**
 * Validate stakeholders have locations
 */
async function validateStakeholdersHaveLocations() {
  console.log('\n📋 Validating: All stakeholders have at least one location (municipality)...\n');
  
  // Find all users with stakeholder role
  const stakeholderRole = await permissionService.getRoleByCode('stakeholder');
  if (!stakeholderRole) {
    console.log('⚠️  Stakeholder role not found - skipping validation');
    return { valid: true, issues: [] };
  }
  
  const stakeholderUserRoles = await UserRole.find({
    roleId: stakeholderRole._id,
    isActive: true
  });
  
  const stakeholdersWithoutLocations = [];
  
  for (const userRole of stakeholderUserRoles) {
    const user = await User.findById(userRole.userId);
    if (!user || !user.isActive) {
      continue;
    }
    
    const locationAssignments = await UserLocation.find({
      userId: user._id,
      isActive: true
    });
    
    if (locationAssignments.length === 0) {
      stakeholdersWithoutLocations.push({
        userId: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      });
    }
  }
  
  if (stakeholdersWithoutLocations.length === 0) {
    console.log(`✓ All ${stakeholderUserRoles.length} stakeholders have at least one location`);
    return { valid: true, issues: [] };
  } else {
    console.log(`⚠️  Found ${stakeholdersWithoutLocations.length} stakeholders without locations (may be acceptable):`);
    stakeholdersWithoutLocations.slice(0, 10).forEach((s, idx) => {
      console.log(`  ${idx + 1}. ${s.email} (${s.name})`);
    });
    if (stakeholdersWithoutLocations.length > 10) {
      console.log(`  ... and ${stakeholdersWithoutLocations.length - 10} more`);
    }
    // Note: This is a warning, not an error, as stakeholders might be created without locations initially
    return { valid: true, issues: stakeholdersWithoutLocations, warning: true };
  }
}

/**
 * Validate authority calculation
 */
async function validateAuthorityCalculation() {
  console.log('\n📋 Validating: Authority calculation for sample users...\n');
  
  const sampleUsers = await User.find({ isActive: true }).limit(20);
  const authorityIssues = [];
  
  for (const user of sampleUsers) {
    try {
      const authority = await authorityService.calculateUserAuthority(user._id);
      const expectedAuthority = user.isSystemAdmin ? 100 : null;
      
      // Check if authority seems reasonable
      if (authority < 20 || authority > 100) {
        authorityIssues.push({
          userId: user._id,
          email: user.email,
          authority,
          issue: 'Authority out of valid range (20-100)'
        });
      } else if (user.isSystemAdmin && authority !== 100) {
        authorityIssues.push({
          userId: user._id,
          email: user.email,
          authority,
          expectedAuthority: 100,
          issue: 'System admin should have authority 100'
        });
      }
    } catch (error) {
      authorityIssues.push({
        userId: user._id,
        email: user.email,
        issue: `Error calculating authority: ${error.message}`
      });
    }
  }
  
  if (authorityIssues.length === 0) {
    console.log(`✓ Authority calculation validated for ${sampleUsers.length} sample users`);
    return { valid: true, issues: [] };
  } else {
    console.log(`❌ Found ${authorityIssues.length} authority calculation issues:`);
    authorityIssues.slice(0, 10).forEach((a, idx) => {
      console.log(`  ${idx + 1}. ${a.email}: ${a.issue}${a.authority ? ` (authority: ${a.authority})` : ''}`);
    });
    if (authorityIssues.length > 10) {
      console.log(`  ... and ${authorityIssues.length - 10} more`);
    }
    return { valid: false, issues: authorityIssues };
  }
}

/**
 * Main validation function
 */
async function validateRBAC() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    
    console.log('='.repeat(60));
    console.log('🔍 RBAC SYSTEM VALIDATION');
    console.log('='.repeat(60));
    
    const results = {
      usersHaveRoles: await validateUsersHaveRoles(),
      userRoleReferences: await validateUserRoleReferences(),
      coordinatorsHaveCoverage: await validateCoordinatorsHaveCoverage(),
      stakeholdersHaveLocations: await validateStakeholdersHaveLocations(),
      authorityCalculation: await validateAuthorityCalculation()
    };
    
    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    
    const allValid = Object.values(results).every(r => r.valid);
    const totalIssues = Object.values(results).reduce((sum, r) => sum + (r.issues?.length || 0), 0);
    
    console.log(`\nOverall Status: ${allValid ? '✓ VALID' : '❌ INVALID'}`);
    console.log(`Total Issues Found: ${totalIssues}`);
    
    console.log('\nCheck Results:');
    console.log(`  Users have roles: ${results.usersHaveRoles.valid ? '✓' : '❌'} (${results.usersHaveRoles.issues?.length || 0} issues)`);
    console.log(`  UserRole references: ${results.userRoleReferences.valid ? '✓' : '❌'} (${results.userRoleReferences.issues?.length || 0} issues)`);
    console.log(`  Coordinators have coverage: ${results.coordinatorsHaveCoverage.valid ? '✓' : '❌'} (${results.coordinatorsHaveCoverage.issues?.length || 0} issues)`);
    console.log(`  Stakeholders have locations: ${results.stakeholdersHaveLocations.valid ? '✓' : '⚠️'} (${results.stakeholdersHaveLocations.issues?.length || 0} ${results.stakeholdersHaveLocations.warning ? 'warnings' : 'issues'})`);
    console.log(`  Authority calculation: ${results.authorityCalculation.valid ? '✓' : '❌'} (${results.authorityCalculation.issues?.length || 0} issues)`);
    
    if (!allValid) {
      console.log('\n❌ VALIDATION FAILED - System has integrity issues');
      console.log('   Run migration scripts to fix:');
      console.log('   - node src/utils/migrateMissingRoles.js');
      console.log('   - node src/utils/migrateOrganizations.js');
      process.exit(1);
    } else {
      console.log('\n✓ VALIDATION PASSED - System integrity is good');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  validateRBAC();
}

module.exports = { 
  validateRBAC,
  validateUsersHaveRoles,
  validateUserRoleReferences,
  validateCoordinatorsHaveCoverage,
  validateStakeholdersHaveLocations,
  validateAuthorityCalculation
};

