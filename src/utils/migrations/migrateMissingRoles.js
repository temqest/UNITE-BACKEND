/**
 * Migration Script: Fix Users Without Roles
 * 
 * This script finds users without UserRole documents and attempts to infer
 * their roles from user properties, then creates the appropriate UserRole documents.
 * 
 * Usage:
 *   node src/utils/migrateMissingRoles.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { 
  User, 
  UserRole, 
  Role
} = require('../models/index');

const permissionService = require('../services/users_services/permission.service');

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

const dryRun = process.argv.includes('--dry-run');

/**
 * Infer role from user properties
 */
async function inferRoleFromUser(user) {
  // System admin flag takes priority
  if (user.isSystemAdmin) {
    const role = await permissionService.getRoleByCode('system-admin');
    if (role) {
      return { role, reason: 'isSystemAdmin flag is true' };
    }
  }
  
  // Check organization type and other properties
  // For now, we'll use a simple heuristic:
  // - If user has organizationType but no clear role indicator, default to stakeholder
  // - This is conservative - better to assign stakeholder than coordinator
  
  // Try to find coordinator role
  const coordinatorRole = await permissionService.getRoleByCode('coordinator');
  const stakeholderRole = await permissionService.getRoleByCode('stakeholder');
  
  // If user has coverage areas assigned, likely a coordinator
  const { UserCoverageAssignment } = require('../models');
  const coverageAssignments = await UserCoverageAssignment.find({
    userId: user._id,
    isActive: true
  });
  
  if (coverageAssignments.length > 0 && coordinatorRole) {
    return { role: coordinatorRole, reason: 'has coverage area assignments' };
  }
  
  // If user has locations assigned (municipality/barangay), likely a stakeholder
  const { UserLocation } = require('../models');
  const locationAssignments = await UserLocation.find({
    userId: user._id,
    isActive: true
  });
  
  if (locationAssignments.length > 0 && stakeholderRole) {
    return { role: stakeholderRole, reason: 'has location assignments' };
  }
  
  // Default to stakeholder if available
  if (stakeholderRole) {
    return { role: stakeholderRole, reason: 'default fallback' };
  }
  
  return null;
}

/**
 * Main migration function
 */
async function migrateMissingRoles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }
    
    // Find all active users
    const allUsers = await User.find({ isActive: true });
    console.log(`Found ${allUsers.length} active users\n`);
    
    // Find users without UserRole documents
    const usersWithoutRoles = [];
    let checkedCount = 0;
    
    for (const user of allUsers) {
      checkedCount++;
      if (checkedCount % 100 === 0) {
        console.log(`Checked ${checkedCount}/${allUsers.length} users...`);
      }
      
      const userRoles = await UserRole.find({
        userId: user._id,
        isActive: true
      });
      
      if (userRoles.length === 0) {
        usersWithoutRoles.push(user);
      }
    }
    
    console.log(`\nFound ${usersWithoutRoles.length} users without roles\n`);
    
    if (usersWithoutRoles.length === 0) {
      console.log('✓ No users need role migration');
      await mongoose.connection.close();
      process.exit(0);
    }
    
    // Get all roles for reference
    const allRoles = await Role.find();
    const rolesByCode = {};
    for (const role of allRoles) {
      rolesByCode[role.code] = role;
    }
    
    console.log('Available roles:', Object.keys(rolesByCode).join(', '));
    console.log('\n');
    
    // Process each user
    const results = {
      fixed: [],
      failed: [],
      skipped: []
    };
    
    for (const user of usersWithoutRoles) {
      console.log(`Processing user: ${user.email} (${user.firstName} ${user.lastName})`);
      console.log(`  User ID: ${user._id}`);
      console.log(`  Is System Admin: ${user.isSystemAdmin || false}`);
      console.log(`  Organization Type: ${user.organizationType || 'N/A'}`);
      
      try {
        const inferred = await inferRoleFromUser(user);
        
        if (!inferred || !inferred.role) {
          console.log(`  ⚠️  Could not infer role - skipping`);
          results.skipped.push({
            user: user._id,
            email: user.email,
            reason: 'could not infer role'
          });
          continue;
        }
        
        console.log(`  → Inferred role: ${inferred.role.code} (${inferred.role.name})`);
        console.log(`  → Reason: ${inferred.reason}`);
        
        if (!dryRun) {
          // Create UserRole document
          const userRole = await permissionService.assignRole(
            user._id,
            inferred.role._id,
            [],
            null,
            null,
            []
          );
          
          console.log(`  ✓ Created UserRole: ${userRole._id}`);
          results.fixed.push({
            user: user._id,
            email: user.email,
            role: inferred.role.code,
            reason: inferred.reason,
            userRoleId: userRole._id
          });
        } else {
          console.log(`  [DRY RUN] Would create UserRole for role: ${inferred.role.code}`);
          results.fixed.push({
            user: user._id,
            email: user.email,
            role: inferred.role.code,
            reason: inferred.reason,
            userRoleId: null
          });
        }
      } catch (error) {
        console.error(`  ❌ Error processing user ${user.email}:`, error.message);
        results.failed.push({
          user: user._id,
          email: user.email,
          error: error.message
        });
      }
      
      console.log('');
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users checked: ${allUsers.length}`);
    console.log(`Users without roles: ${usersWithoutRoles.length}`);
    console.log(`\nFixed: ${results.fixed.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped.length}`);
    
    if (results.fixed.length > 0) {
      console.log('\n✓ Successfully fixed users:');
      results.fixed.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.email} → ${r.role} (${r.reason})`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log('\n❌ Failed to fix users:');
      results.failed.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.email}: ${r.error}`);
      });
    }
    
    if (results.skipped.length > 0) {
      console.log('\n⚠️  Skipped users:');
      results.skipped.forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.email}: ${r.reason}`);
      });
    }
    
    await mongoose.connection.close();
    console.log('\n✓ Migration complete\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error);
    console.error(error.stack);
    await mongoose.connection.close();
    process.exit(1);
  }
}

if (require.main === module) {
  migrateMissingRoles();
}

module.exports = { migrateMissingRoles, inferRoleFromUser };

