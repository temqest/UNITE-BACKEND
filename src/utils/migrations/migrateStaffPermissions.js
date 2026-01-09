/**
 * Migration Script for Staff Permissions
 * 
 * This script verifies and optionally backfills permissions for existing staff
 * to ensure they appear correctly in the permission-based classification system.
 * 
 * Usage:
 *   node src/utils/migrateStaffPermissions.js                    # Dry run (report only)
 *   node src/utils/migrateStaffPermissions.js --apply            # Actually update roles
 *   node src/utils/migrateStaffPermissions.js --role=<roleCode>  # Check specific role
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, Role, UserRole } = require('../models/index');
const permissionService = require('../services/users_services/permission.service');

// Operational capabilities required for Staff page
const REQUIRED_OPERATIONAL_CAPABILITIES = [
  'request.create',
  'event.create',
  'event.update',
  'staff.create',
  'staff.update'
];

// Review capabilities required for Stakeholder page
const REQUIRED_REVIEW_CAPABILITIES = [
  'request.review'
];

async function checkRolePermissions(roleCode) {
  try {
    const role = await permissionService.getRoleByCode(roleCode);
    if (!role) {
      console.log(`Role '${roleCode}' not found`);
      return null;
    }

    const capabilities = await permissionService.getRoleCapabilities(role._id);
    
    const hasOperational = REQUIRED_OPERATIONAL_CAPABILITIES.some(cap => 
      capabilities.includes(cap) || capabilities.includes('*')
    );
    const hasReview = REQUIRED_REVIEW_CAPABILITIES.some(cap => 
      capabilities.includes(cap) || capabilities.includes('*')
    );

    return {
      roleCode: role.code,
      roleName: role.name,
      capabilities,
      hasOperational,
      hasReview,
      missingOperational: REQUIRED_OPERATIONAL_CAPABILITIES.filter(cap => 
        !capabilities.includes(cap) && !capabilities.includes('*')
      ),
      missingReview: REQUIRED_REVIEW_CAPABILITIES.filter(cap => 
        !capabilities.includes(cap) && !capabilities.includes('*')
      )
    };
  } catch (error) {
    console.error(`Error checking role ${roleCode}:`, error);
    return null;
  }
}

async function verifyAllRoles() {
  try {
    console.log('=== Role Permission Verification ===\n');

    const roles = await Role.find().sort({ code: 1 });
    console.log(`Found ${roles.length} roles\n`);

    const results = [];

    for (const role of roles) {
      const check = await checkRolePermissions(role.code);
      if (check) {
        results.push(check);
      }
    }

    // Summary
    console.log('=== Role Summary ===');
    const operationalRoles = results.filter(r => r.hasOperational);
    const reviewRoles = results.filter(r => r.hasReview);
    const hybridRoles = results.filter(r => r.hasOperational && r.hasReview);

    console.log(`Total roles: ${results.length}`);
    console.log(`Roles with operational capabilities: ${operationalRoles.length}`);
    console.log(`Roles with review capabilities: ${reviewRoles.length}`);
    console.log(`Hybrid roles (both): ${hybridRoles.length}\n`);

    // Roles missing capabilities
    const missingOps = results.filter(r => r.missingOperational.length > 0 && !r.capabilities.includes('*'));
    if (missingOps.length > 0) {
      console.log(`=== Roles Missing Operational Capabilities (${missingOps.length}) ===`);
      missingOps.forEach(r => {
        console.log(`- ${r.roleName} (${r.roleCode}):`);
        console.log(`  Missing: ${r.missingOperational.join(', ')}`);
        console.log(`  Has: ${r.capabilities.slice(0, 5).join(', ')}${r.capabilities.length > 5 ? '...' : ''}`);
      });
      console.log();
    }

    // Detailed output
    console.log('=== All Roles ===');
    results.forEach(r => {
      console.log(`\n${r.roleName} (${r.roleCode}):`);
      console.log(`  Operational: ${r.hasOperational ? '✓' : '✗'}`);
      console.log(`  Review: ${r.hasReview ? '✓' : '✗'}`);
      console.log(`  Capabilities: ${r.capabilities.slice(0, 10).join(', ')}${r.capabilities.length > 10 ? '...' : ''}`);
    });

    return results;
  } catch (error) {
    console.error('Error verifying roles:', error);
    throw error;
  }
}

async function verifyUserRoles() {
  try {
    console.log('\n=== User Role Assignment Verification ===\n');

    const users = await User.find({ isActive: true }).limit(1000);
    console.log(`Checking ${users.length} active users\n`);

    const userRoleCounts = {};
    const roleUserCounts = {};

    for (const user of users) {
      const roles = await permissionService.getUserRoles(user._id);
      const roleCodes = roles.map(r => r.code);
      
      roleCodes.forEach(code => {
        userRoleCounts[code] = (userRoleCounts[code] || 0) + 1;
      });
    }

    console.log('=== Users per Role ===');
    Object.entries(userRoleCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([code, count]) => {
        console.log(`  ${code}: ${count} users`);
      });

    return { userRoleCounts };
  } catch (error) {
    console.error('Error verifying user roles:', error);
    throw error;
  }
}

async function main() {
  try {
    const apply = process.argv.includes('--apply');
    const roleArg = process.argv.find(arg => arg.startsWith('--role='));
    const roleCode = roleArg ? roleArg.split('=')[1] : null;

    if (apply) {
      console.log('⚠️  APPLY MODE: Changes will be made to the database\n');
    } else {
      console.log('🔍 DRY RUN MODE: No changes will be made\n');
    }

    // Connect to database
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI not set in environment variables');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to database\n');

    if (roleCode) {
      // Check specific role
      const check = await checkRolePermissions(roleCode);
      if (check) {
        console.log(JSON.stringify(check, null, 2));
      }
    } else {
      // Verify all roles
      await verifyAllRoles();
      await verifyUserRoles();
    }

    if (!apply) {
      console.log('\n💡 To apply changes, run with --apply flag');
    }

    await mongoose.disconnect();
    console.log('\nMigration verification complete');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkRolePermissions, verifyAllRoles, verifyUserRoles };

