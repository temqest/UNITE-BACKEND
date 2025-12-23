/**
 * Verification Script for Staff Creation Process
 * 
 * This script verifies the entire staff creation flow to identify where it might be failing.
 * It checks:
 * 1. User exists and is active
 * 2. Roles are assigned correctly
 * 3. Roles have the correct permissions
 * 4. User has the expected capabilities
 * 
 * Usage:
 *   node src/utils/verifyStaffCreation.js
 *   node src/utils/verifyStaffCreation.js --email=<email>  # Check specific user
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, Role, UserRole } = require('../models/index');
const permissionService = require('../services/users_services/permission.service');

const OPERATIONAL_CAPABILITIES = [
  'request.create',
  'event.create',
  'event.update',
  'staff.create',
  'staff.update'
];

const REVIEW_CAPABILITIES = [
  'request.review'
];

async function verifyUserCreation(email) {
  try {
    console.log(`\n=== Verifying User Creation for: ${email} ===\n`);

    // Step 1: Check if user exists
    console.log('Step 1: Checking if user exists...');
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      console.log('❌ User not found in database');
      console.log('   This means the user creation failed or the email is incorrect.');
      return null;
    }
    console.log(`✓ User found: ${user.firstName} ${user.lastName} (ID: ${user._id})`);

    // Step 2: Check if user is active
    console.log('\nStep 2: Checking if user is active...');
    if (!user.isActive) {
      console.log('❌ User is NOT active (isActive: false)');
      console.log('   This is why the diagnostic script didn\'t find the user.');
      return { user, issue: 'not_active' };
    }
    console.log('✓ User is active');

    // Step 3: Check role assignments
    console.log('\nStep 3: Checking role assignments...');
    const userRoles = await UserRole.find({
      userId: user._id,
      isActive: true
    }).populate('roleId');

    if (userRoles.length === 0) {
      console.log('❌ No active roles assigned to user');
      console.log('   This means the role assignment step failed.');
      console.log('   Check if the frontend called POST /api/users/:userId/roles');
      return { user, issue: 'no_roles' };
    }

    console.log(`✓ Found ${userRoles.length} active role(s):`);
    userRoles.forEach(ur => {
      const role = ur.roleId;
      if (role) {
        console.log(`   - ${role.code} (${role.name})`);
      } else {
        console.log(`   - Role ID: ${ur.roleId} (role not found in database!)`);
      }
    });

    // Step 4: Check role permissions
    console.log('\nStep 4: Checking role permissions...');
    const roles = userRoles.map(ur => ur.roleId).filter(r => r !== null);
    
    if (roles.length === 0) {
      console.log('❌ No valid roles found (roles might be deleted)');
      return { user, issue: 'invalid_roles' };
    }

    const allPermissions = [];
    for (const role of roles) {
      console.log(`\n   Role: ${role.code} (${role.name})`);
      if (!role.permissions || role.permissions.length === 0) {
        console.log(`   ❌ Role has NO permissions assigned`);
        console.log(`   This is the problem! Run seedRoles.js to assign permissions.`);
        return { user, issue: 'role_no_permissions', role: role.code };
      }
      
      console.log(`   ✓ Role has ${role.permissions.length} permission(s)`);
      
      // Extract capabilities from permissions
      role.permissions.forEach(perm => {
        if (perm.resource === '*') {
          perm.actions.forEach(action => {
            allPermissions.push(`*.${action}`);
          });
        } else {
          perm.actions.forEach(action => {
            if (action === '*') {
              allPermissions.push(`${perm.resource}.*`);
            } else {
              allPermissions.push(`${perm.resource}.${action}`);
            }
          });
        }
      });
    }

    const uniqueCapabilities = [...new Set(allPermissions)];
    console.log(`\n   Total unique capabilities: ${uniqueCapabilities.length}`);

    // Step 5: Check for required capabilities
    console.log('\nStep 5: Checking for required capabilities...');
    
    const hasOperational = OPERATIONAL_CAPABILITIES.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );
    const hasReview = REVIEW_CAPABILITIES.some(cap => 
      uniqueCapabilities.includes(cap) || uniqueCapabilities.includes('*')
    );

    console.log(`   Operational capabilities required: ${OPERATIONAL_CAPABILITIES.join(', ')}`);
    console.log(`   Review capabilities required: ${REVIEW_CAPABILITIES.join(', ')}`);
    console.log(`   Has operational: ${hasOperational ? '✓' : '❌'}`);
    console.log(`   Has review: ${hasReview ? '✓' : '❌'}`);

    if (!hasOperational && !hasReview) {
      console.log('\n❌ User has NO required capabilities');
      console.log('   This user will NOT appear in either Staff or Stakeholder pages.');
      return { user, issue: 'no_capabilities', capabilities: uniqueCapabilities };
    }

    // Step 6: Check what pages user should appear in
    console.log('\nStep 6: Page visibility...');
    const shouldAppearInStaff = hasOperational;
    const shouldAppearInStakeholder = hasReview;
    
    console.log(`   Should appear in Staff page: ${shouldAppearInStaff ? '✓ YES' : '❌ NO'}`);
    console.log(`   Should appear in Stakeholder page: ${shouldAppearInStakeholder ? '✓ YES' : '❌ NO'}`);

    // Step 7: Verify using permission service
    console.log('\nStep 7: Verifying using permission service...');
    const userPermissions = await permissionService.getUserPermissions(user._id);
    console.log(`   Permission service returned ${userPermissions.length} permission(s)`);

    // Check specific capabilities
    for (const cap of OPERATIONAL_CAPABILITIES) {
      const [resource, action] = cap.split('.');
      const hasPermission = await permissionService.hasPermission(user._id, resource, action);
      console.log(`   ${cap}: ${hasPermission ? '✓' : '❌'}`);
    }

    const classification = hasReview && hasOperational ? 'hybrid' :
                          hasReview ? 'stakeholder' :
                          hasOperational ? 'coordinator' : 'none';

    return {
      user,
      roles,
      capabilities: uniqueCapabilities,
      classification,
      shouldAppearInStaffPage: shouldAppearInStaff,
      shouldAppearInStakeholderPage: shouldAppearInStakeholder,
      issue: null
    };
  } catch (error) {
    console.error(`Error verifying user:`, error);
    return null;
  }
}

async function listAllUsers() {
  try {
    console.log('\n=== All Users in Database ===\n');
    
    const allUsers = await User.find({}).limit(100);
    console.log(`Total users (including inactive): ${allUsers.length}\n`);

    for (const user of allUsers) {
      const roleCount = await UserRole.countDocuments({ 
        userId: user._id, 
        isActive: true 
      });
      console.log(`- ${user.email} (${user.firstName} ${user.lastName})`);
      console.log(`  Active: ${user.isActive ? 'YES' : 'NO'}`);
      console.log(`  Roles: ${roleCount}`);
      console.log(`  ID: ${user._id}`);
    }
  } catch (error) {
    console.error('Error listing users:', error);
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
    console.log('Connected to database');

    // Check if specific email requested
    const emailArg = process.argv.find(arg => arg.startsWith('--email='));
    if (emailArg) {
      const email = emailArg.split('=')[1];
      await verifyUserCreation(email);
    } else {
      // List all users first
      await listAllUsers();
      
      // Then check all active users
      console.log('\n\n=== Verifying All Active Users ===\n');
      const activeUsers = await User.find({ isActive: true }).limit(20);
      
      if (activeUsers.length === 0) {
        console.log('No active users found. Listing all users above.');
        console.log('\nIf you created a user, check:');
        console.log('1. Was the user created with isActive: true?');
        console.log('2. Check the user creation response in the browser console');
        console.log('3. Check the backend logs for errors');
      } else {
        for (const user of activeUsers) {
          await verifyUserCreation(user.email);
        }
      }
    }

    await mongoose.disconnect();
    console.log('\n\nVerification complete');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { verifyUserCreation };

