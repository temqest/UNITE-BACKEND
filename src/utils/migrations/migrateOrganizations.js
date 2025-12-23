/**
 * Migration Script: Migrate Organizations to UserOrganization Model
 * 
 * This script migrates organization assignments from:
 * - User.organizationId (single organization)
 * - UserRole.context.organizationScope (organization per role)
 * 
 * To:
 * - UserOrganization documents (multiple organizations per user)
 * 
 * Usage:
 *   node src/utils/migrateOrganizations.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { 
  User, 
  UserRole, 
  UserOrganization,
  Organization
} = require('../models/index');

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
 * Main migration function
 */
async function migrateOrganizations() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }
    
    const results = {
      fromUserOrganizationId: [],
      fromUserRoleContext: [],
      skipped: [],
      failed: []
    };
    
    // Step 1: Migrate User.organizationId to UserOrganization
    console.log('Step 1: Migrating User.organizationId to UserOrganization...\n');
    
    const usersWithOrganizationId = await User.find({
      organizationId: { $exists: true, $ne: null },
      isActive: true
    });
    
    console.log(`Found ${usersWithOrganizationId.length} users with organizationId\n`);
    
    for (const user of usersWithOrganizationId) {
      try {
        // Check if organization exists
        const organization = await Organization.findById(user.organizationId);
        if (!organization) {
          console.log(`⚠️  User ${user.email}: Organization ${user.organizationId} not found - skipping`);
          results.skipped.push({
            user: user._id,
            email: user.email,
            source: 'User.organizationId',
            organizationId: user.organizationId,
            reason: 'organization not found'
          });
          continue;
        }
        
        // Check if UserOrganization already exists
        const existing = await UserOrganization.findOne({
          userId: user._id,
          organizationId: user.organizationId,
          isActive: true
        });
        
        if (existing) {
          console.log(`✓ User ${user.email}: UserOrganization already exists for ${organization.name}`);
          results.skipped.push({
            user: user._id,
            email: user.email,
            source: 'User.organizationId',
            organizationId: user.organizationId,
            reason: 'already migrated'
          });
          continue;
        }
        
        // Check if user has any UserOrganization (to determine if this should be primary)
        const existingUserOrgs = await UserOrganization.find({
          userId: user._id,
          isActive: true
        });
        
        const isPrimary = existingUserOrgs.length === 0;
        
        if (!dryRun) {
          await UserOrganization.assignOrganization(
            user._id,
            user.organizationId,
            {
              roleInOrg: 'member',
              isPrimary: isPrimary,
              assignedBy: null
            }
          );
        }
        
        console.log(`${dryRun ? '[DRY RUN] ' : ''}✓ Migrated User.organizationId for ${user.email} → ${organization.name} (${isPrimary ? 'primary' : 'secondary'})`);
        results.fromUserOrganizationId.push({
          user: user._id,
          email: user.email,
          organizationId: user.organizationId,
          organizationName: organization.name,
          isPrimary
        });
      } catch (error) {
        console.error(`❌ Error migrating User.organizationId for ${user.email}:`, error.message);
        results.failed.push({
          user: user._id,
          email: user.email,
          source: 'User.organizationId',
          error: error.message
        });
      }
    }
    
    // Step 2: Migrate UserRole.context.organizationScope to UserOrganization
    console.log('\n\nStep 2: Migrating UserRole.context.organizationScope to UserOrganization...\n');
    
    const userRolesWithOrgScope = await UserRole.find({
      'context.organizationScope': { $exists: true, $ne: null },
      isActive: true
    }).populate('userId').populate('roleId');
    
    console.log(`Found ${userRolesWithOrgScope.length} UserRole documents with organizationScope\n`);
    
    for (const userRole of userRolesWithOrgScope) {
      try {
        const organizationId = userRole.context.organizationScope;
        const user = userRole.userId;
        const role = userRole.roleId;
        
        if (!user) {
          console.log(`⚠️  UserRole ${userRole._id}: User not found - skipping`);
          results.skipped.push({
            userRole: userRole._id,
            source: 'UserRole.context.organizationScope',
            organizationId: organizationId,
            reason: 'user not found'
          });
          continue;
        }
        
        // Check if organization exists
        const organization = await Organization.findById(organizationId);
        if (!organization) {
          console.log(`⚠️  UserRole ${userRole._id} (User: ${user.email}): Organization ${organizationId} not found - skipping`);
          results.skipped.push({
            user: user._id,
            email: user.email,
            userRole: userRole._id,
            source: 'UserRole.context.organizationScope',
            organizationId: organizationId,
            reason: 'organization not found'
          });
          continue;
        }
        
        // Check if UserOrganization already exists
        const existing = await UserOrganization.findOne({
          userId: user._id,
          organizationId: organizationId,
          isActive: true
        });
        
        if (existing) {
          console.log(`✓ UserRole ${userRole._id} (User: ${user.email}): UserOrganization already exists for ${organization.name}`);
          results.skipped.push({
            user: user._id,
            email: user.email,
            userRole: userRole._id,
            source: 'UserRole.context.organizationScope',
            organizationId: organizationId,
            reason: 'already migrated'
          });
          continue;
        }
        
        // Determine roleInOrg from UserRole's role code
        let roleInOrg = 'member';
        if (role && role.code === 'coordinator') {
          roleInOrg = 'coordinator';
        }
        
        // Check if user has any UserOrganization (to determine if this should be primary)
        const existingUserOrgs = await UserOrganization.find({
          userId: user._id,
          isActive: true
        });
        
        const isPrimary = existingUserOrgs.length === 0;
        
        if (!dryRun) {
          await UserOrganization.assignOrganization(
            user._id,
            organizationId,
            {
              roleInOrg: roleInOrg,
              isPrimary: isPrimary,
              assignedBy: null
            }
          );
        }
        
        console.log(`${dryRun ? '[DRY RUN] ' : ''}✓ Migrated UserRole.context.organizationScope for ${user.email} (Role: ${role?.code || 'unknown'}) → ${organization.name} (${isPrimary ? 'primary' : 'secondary'})`);
        results.fromUserRoleContext.push({
          user: user._id,
          email: user.email,
          userRole: userRole._id,
          roleCode: role?.code,
          organizationId: organizationId,
          organizationName: organization.name,
          roleInOrg: roleInOrg,
          isPrimary
        });
      } catch (error) {
        console.error(`❌ Error migrating UserRole.context.organizationScope for UserRole ${userRole._id}:`, error.message);
        results.failed.push({
          userRole: userRole._id,
          source: 'UserRole.context.organizationScope',
          error: error.message
        });
      }
    }
    
    // Summary
    console.log('\n\n' + '='.repeat(60));
    console.log('📊 MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`\nFrom User.organizationId:`);
    console.log(`  Migrated: ${results.fromUserOrganizationId.length}`);
    console.log(`  Skipped: ${results.skipped.filter(r => r.source === 'User.organizationId').length}`);
    console.log(`  Failed: ${results.failed.filter(r => r.source === 'User.organizationId').length}`);
    
    console.log(`\nFrom UserRole.context.organizationScope:`);
    console.log(`  Migrated: ${results.fromUserRoleContext.length}`);
    console.log(`  Skipped: ${results.skipped.filter(r => r.source === 'UserRole.context.organizationScope').length}`);
    console.log(`  Failed: ${results.failed.filter(r => r.source === 'UserRole.context.organizationScope').length}`);
    
    const totalMigrated = results.fromUserOrganizationId.length + results.fromUserRoleContext.length;
    const totalSkipped = results.skipped.length;
    const totalFailed = results.failed.length;
    
    console.log(`\nTotal:`);
    console.log(`  Migrated: ${totalMigrated}`);
    console.log(`  Skipped: ${totalSkipped}`);
    console.log(`  Failed: ${totalFailed}`);
    
    if (totalMigrated > 0) {
      console.log('\n✓ Successfully migrated organizations:');
      if (results.fromUserOrganizationId.length > 0) {
        console.log('\n  From User.organizationId:');
        results.fromUserOrganizationId.slice(0, 10).forEach((r, idx) => {
          console.log(`    ${idx + 1}. ${r.email} → ${r.organizationName} (${r.isPrimary ? 'primary' : 'secondary'})`);
        });
        if (results.fromUserOrganizationId.length > 10) {
          console.log(`    ... and ${results.fromUserOrganizationId.length - 10} more`);
        }
      }
      
      if (results.fromUserRoleContext.length > 0) {
        console.log('\n  From UserRole.context.organizationScope:');
        results.fromUserRoleContext.slice(0, 10).forEach((r, idx) => {
          console.log(`    ${idx + 1}. ${r.email} (${r.roleCode}) → ${r.organizationName} (${r.roleInOrg}, ${r.isPrimary ? 'primary' : 'secondary'})`);
        });
        if (results.fromUserRoleContext.length > 10) {
          console.log(`    ... and ${results.fromUserRoleContext.length - 10} more`);
        }
      }
    }
    
    if (totalFailed > 0) {
      console.log('\n❌ Failed migrations:');
      results.failed.slice(0, 10).forEach((r, idx) => {
        console.log(`  ${idx + 1}. ${r.email || r.userRole}: ${r.error}`);
      });
      if (results.failed.length > 10) {
        console.log(`  ... and ${results.failed.length - 10} more`);
      }
    }
    
    console.log('\n⚠️  NOTE: User.organizationId and UserRole.context.organizationScope are kept for backward compatibility.');
    console.log('    They are not removed by this migration.');
    
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
  migrateOrganizations();
}

module.exports = { migrateOrganizations };

