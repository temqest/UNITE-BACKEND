/**
 * Diagnostic Script for Permission-Based Staff Classification
 * 
 * This script checks all staff users and their capabilities to diagnose
 * why the staff page might be empty after the permission-based refactor.
 * 
 * Usage:
 *   node src/utils/diagnosePermissions.js
 *   node src/utils/diagnosePermissions.js --userId=<userId>  # Check specific user
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, Role, UserRole } = require('../models/index');
const permissionService = require('../services/users_services/permission.service');

// Operational capabilities that should appear in Staff page
const OPERATIONAL_CAPABILITIES = [
  'request.create',
  'event.create',
  'event.update',
  'staff.create',
  'staff.update'
];

// Review capabilities that should appear in Stakeholder page
const REVIEW_CAPABILITIES = [
  'request.review'
];

async function diagnoseUser(userId) {
  try {
    const user = await User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found`);
      return null;
    }

    const roles = await permissionService.getUserRoles(user._id);
    const permissions = await permissionService.getUserPermissions(user._id);

    // Compute capabilities
    const capabilities = [];
    for (const perm of permissions) {
      if (perm.resource === '*') {
        if (perm.actions.includes('*')) {
          capabilities.push('*');
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

    const uniqueCapabilities = [...new Set(capabilities)];

    // Check classifications
    const hasOperational = OPERATIONAL_CAPABILITIES.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );
    const hasReview = REVIEW_CAPABILITIES.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );

    const classification = hasReview && hasOperational ? 'hybrid' :
                          hasReview ? 'stakeholder' :
                          hasOperational ? 'coordinator' : 'none';

    return {
      userId: user._id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      roles: roles.map(r => ({
        code: r.code,
        name: r.name,
        permissions: r.permissions || []
      })),
      capabilities: uniqueCapabilities,
      classification,
      shouldAppearInStaffPage: hasOperational,
      shouldAppearInStakeholderPage: hasReview,
      missingOperationalCapabilities: OPERATIONAL_CAPABILITIES.filter(cap => 
        !uniqueCapabilities.includes(cap) && !uniqueCapabilities.includes('*')
      ),
      missingReviewCapabilities: REVIEW_CAPABILITIES.filter(cap => 
        !uniqueCapabilities.includes(cap) && !uniqueCapabilities.includes('*')
      )
    };
  } catch (error) {
    console.error(`Error diagnosing user ${userId}:`, error);
    return null;
  }
}

async function diagnoseAllUsers() {
  try {
    console.log('=== Permission Diagnostic Report ===\n');

    // Get all active users
    const users = await User.find({ isActive: true }).limit(1000);
    console.log(`Found ${users.length} active users\n`);

    const results = {
      total: users.length,
      coordinator: 0,
      stakeholder: 0,
      hybrid: 0,
      none: 0,
      shouldAppearInStaffPage: 0,
      shouldAppearInStakeholderPage: 0,
      details: []
    };

    for (const user of users) {
      const diagnosis = await diagnoseUser(user._id);
      if (diagnosis) {
        results.details.push(diagnosis);
        
        if (diagnosis.classification === 'coordinator') results.coordinator++;
        else if (diagnosis.classification === 'stakeholder') results.stakeholder++;
        else if (diagnosis.classification === 'hybrid') results.hybrid++;
        else results.none++;

        if (diagnosis.shouldAppearInStaffPage) results.shouldAppearInStaffPage++;
        if (diagnosis.shouldAppearInStakeholderPage) results.shouldAppearInStakeholderPage++;
      }
    }

    // Summary
    console.log('=== Summary ===');
    console.log(`Total users: ${results.total}`);
    console.log(`Coordinator (operational): ${results.coordinator}`);
    console.log(`Stakeholder (review): ${results.stakeholder}`);
    console.log(`Hybrid (both): ${results.hybrid}`);
    console.log(`None (no permissions): ${results.none}`);
    console.log(`\nShould appear in Staff page: ${results.shouldAppearInStaffPage}`);
    console.log(`Should appear in Stakeholder page: ${results.shouldAppearInStakeholderPage}\n`);

    // Users with missing capabilities
    const usersWithMissingOps = results.details.filter(u => 
      u.missingOperationalCapabilities.length > 0 && !u.capabilities.includes('*')
    );
    if (usersWithMissingOps.length > 0) {
      console.log(`=== Users Missing Operational Capabilities (${usersWithMissingOps.length}) ===`);
      usersWithMissingOps.slice(0, 10).forEach(u => {
        console.log(`- ${u.name} (${u.email}):`);
        console.log(`  Missing: ${u.missingOperationalCapabilities.join(', ')}`);
        console.log(`  Has: ${u.capabilities.slice(0, 5).join(', ')}${u.capabilities.length > 5 ? '...' : ''}`);
      });
      if (usersWithMissingOps.length > 10) {
        console.log(`  ... and ${usersWithMissingOps.length - 10} more`);
      }
      console.log();
    }

    // Users that should appear but might not
    const shouldAppearButMissing = results.details.filter(u => 
      u.shouldAppearInStaffPage && u.missingOperationalCapabilities.length > 0
    );
    if (shouldAppearButMissing.length > 0) {
      console.log(`=== Users That Should Appear But Have Missing Capabilities (${shouldAppearButMissing.length}) ===`);
      shouldAppearButMissing.slice(0, 5).forEach(u => {
        console.log(`- ${u.name} (${u.email})`);
        console.log(`  Classification: ${u.classification}`);
        console.log(`  Missing: ${u.missingOperationalCapabilities.join(', ')}`);
      });
      console.log();
    }

    // Sample detailed output
    console.log('=== Sample User Details (first 3) ===');
    results.details.slice(0, 3).forEach(u => {
      console.log(`\n${u.name} (${u.email}):`);
      console.log(`  Classification: ${u.classification}`);
      console.log(`  Roles: ${u.roles.map(r => r.code).join(', ')}`);
      console.log(`  Capabilities (${u.capabilities.length}): ${u.capabilities.slice(0, 10).join(', ')}${u.capabilities.length > 10 ? '...' : ''}`);
      console.log(`  Should appear in Staff page: ${u.shouldAppearInStaffPage}`);
      console.log(`  Should appear in Stakeholder page: ${u.shouldAppearInStakeholderPage}`);
    });

    return results;
  } catch (error) {
    console.error('Error diagnosing users:', error);
    throw error;
  }
}

async function main() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI not set in environment variables');
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to database\n');

    // Check if specific user requested
    const userIdArg = process.argv.find(arg => arg.startsWith('--userId='));
    if (userIdArg) {
      const userId = userIdArg.split('=')[1];
      const diagnosis = await diagnoseUser(userId);
      if (diagnosis) {
        console.log(JSON.stringify(diagnosis, null, 2));
      }
    } else {
      await diagnoseAllUsers();
    }

    await mongoose.disconnect();
    console.log('\nDiagnostic complete');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { diagnoseUser, diagnoseAllUsers };

