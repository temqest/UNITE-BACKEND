/**
 * Consolidated Migration Script: Migrate Users to New Model
 * 
 * This script migrates existing users to comply with the new user model structure:
 * - Assigns missing roles to users
 * - Links users to proper organizations
 * - Updates coverage areas
 * - Fixes authority levels
 * - Ensures all users have proper role assignments
 * 
 * Usage: from project root run:
 *   node src/utils/migrations/migrateUsersToNewModel.js [--dry-run] [--step=1,2,3,4,5]
 * 
 * Steps:
 *   1. Migrate missing roles
 *   2. Migrate user authority levels
 *   3. Migrate user organizations
 *   4. Migrate user coverage areas
 *   5. Migrate staff permissions
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env with MONGO_DB_NAME
 *   - Roles must be seeded first: node src/utils/seed/seedRoles.js
 *   - Organizations must be seeded: node src/utils/seed/seedOrganizations.js
 *   - Locations must be seeded: node src/utils/seed/seedLocations.js
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const { connect, disconnect, getConnectionUri } = require('../dbConnection');
const { User, Role, Organization, Location, CoverageArea } = require('../../models');
const permissionService = require('../../services/users_services/permission.service');
const locationService = require('../../services/utility_services/location.service');

const dryRun = process.argv.includes('--dry-run');
const stepArg = process.argv.find(arg => arg.startsWith('--step='));
const stepsToRun = stepArg ? stepArg.split('=')[1].split(',').map(s => parseInt(s)) : [1, 2, 3, 4, 5];

/**
 * Step 1: Migrate missing roles
 * Assigns default roles to users based on their isSystemAdmin flag or existing role assignments
 */
async function migrateMissingRoles() {
  console.log('\n📝 Step 1: Migrating Missing Roles');
  console.log('='.repeat(60));
  
  const users = await User.find({ isActive: true });
  let assignedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    const userRoles = await permissionService.getUserRoles(user._id);
    
    // System admins should have system-admin role
    if (user.isSystemAdmin && !userRoles.some(r => r.code === 'system-admin')) {
      const systemAdminRole = await Role.findOne({ code: 'system-admin' });
      if (systemAdminRole) {
        console.log(`  Assigning system-admin role to: ${user.email}`);
        if (!dryRun) {
          await permissionService.assignRole(user._id, systemAdminRole._id, [], null, null);
        }
        assignedCount++;
      }
    }
    
    // Users without any roles should get a default role based on their type
    if (userRoles.length === 0) {
      let defaultRole = null;
      
      // Try to infer role from existing data
      if (user.isSystemAdmin) {
        defaultRole = await Role.findOne({ code: 'system-admin' });
      } else if (user.coverageAreas && user.coverageAreas.length > 0) {
        // Has coverage areas, likely a coordinator
        defaultRole = await Role.findOne({ code: 'coordinator' });
      } else if (user.locations && (user.locations.municipalityId || user.locations.barangayId)) {
        // Has location, likely a stakeholder
        defaultRole = await Role.findOne({ code: 'stakeholder' });
      } else {
        // Default to stakeholder
        defaultRole = await Role.findOne({ code: 'stakeholder' });
      }
      
      if (defaultRole) {
        console.log(`  Assigning ${defaultRole.code} role to: ${user.email}`);
        if (!dryRun) {
          await permissionService.assignRole(user._id, defaultRole._id, [], null, null);
        }
        assignedCount++;
      } else {
        console.log(`  ⚠ No default role found for: ${user.email}`);
      }
    } else {
      skippedCount++;
    }
  }
  
  console.log(`\n✓ Step 1 Complete: ${assignedCount} roles assigned, ${skippedCount} users skipped`);
}

/**
 * Step 2: Migrate user authority levels
 * Ensures all users have proper authority levels based on their roles
 */
async function migrateUserAuthority() {
  console.log('\n📝 Step 2: Migrating User Authority Levels');
  console.log('='.repeat(60));
  
  const users = await User.find({ isActive: true });
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    const userRoles = await permissionService.getUserRoles(user._id);
    
    if (userRoles.length === 0) {
      skippedCount++;
      continue;
    }
    
    // Calculate highest authority from roles
    let maxAuthority = 20; // Default minimum
    for (const role of userRoles) {
      if (role.roleAuthority && role.roleAuthority > maxAuthority) {
        maxAuthority = role.roleAuthority;
      }
    }
    
    // System admin should have authority 100
    if (user.isSystemAdmin) {
      maxAuthority = 100;
    }
    
    // Update if authority is different
    if (user.authority !== maxAuthority) {
      console.log(`  Updating authority for ${user.email}: ${user.authority} → ${maxAuthority}`);
      if (!dryRun) {
        user.authority = maxAuthority;
        await user.save();
      }
      updatedCount++;
    } else {
      skippedCount++;
    }
  }
  
  console.log(`\n✓ Step 2 Complete: ${updatedCount} users updated, ${skippedCount} users skipped`);
}

/**
 * Step 3: Migrate user organizations
 * Ensures users are properly linked to organizations
 */
async function migrateUserOrganizations() {
  console.log('\n📝 Step 3: Migrating User Organizations');
  console.log('='.repeat(60));
  
  const users = await User.find({ isActive: true });
  let assignedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    // Check if user already has organizations
    if (user.organizations && user.organizations.length > 0) {
      skippedCount++;
      continue;
    }
    
    // Try to find organization from legacy fields
    let organization = null;
    if (user.organizationInstitution) {
      // Try to find by name
      organization = await Organization.findOne({
        name: { $regex: new RegExp(user.organizationInstitution, 'i') },
        isActive: true
      });
    }
    
    // If not found, try to infer from organizationType
    if (!organization && user.organizationType) {
      organization = await Organization.findOne({
        type: user.organizationType,
        isActive: true
      });
    }
    
    // If still not found, use default LGU
    if (!organization) {
      organization = await Organization.findOne({
        type: 'LGU',
        isActive: true
      });
    }
    
    if (organization) {
      console.log(`  Assigning organization ${organization.name} to: ${user.email}`);
      if (!dryRun) {
        user.organizations = [{
          organizationId: organization._id,
          organizationName: organization.name,
          organizationType: organization.type,
          isPrimary: true,
          assignedAt: new Date()
        }];
        await user.save();
      }
      assignedCount++;
    } else {
      console.log(`  ⚠ No organization found for: ${user.email}`);
      skippedCount++;
    }
  }
  
  console.log(`\n✓ Step 3 Complete: ${assignedCount} organizations assigned, ${skippedCount} users skipped`);
}

/**
 * Step 4: Migrate user coverage areas
 * Ensures coordinators have proper coverage area assignments
 */
async function migrateUserCoverage() {
  console.log('\n📝 Step 4: Migrating User Coverage Areas');
  console.log('='.repeat(60));
  
  const users = await User.find({ isActive: true });
  let assignedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    // Check if user already has coverage areas
    if (user.coverageAreas && user.coverageAreas.length > 0) {
      skippedCount++;
      continue;
    }
    
    // Only migrate coordinators (users with coordinator role)
    const userRoles = await permissionService.getUserRoles(user._id);
    const isCoordinator = userRoles.some(r => r.code === 'coordinator');
    
    if (!isCoordinator) {
      skippedCount++;
      continue;
    }
    
    // Try to find coverage area from existing location data
    let coverageArea = null;
    
    // If user has legacy location data, try to find matching coverage area
    if (user.locations && user.locations.municipalityId) {
      const municipality = await Location.findById(user.locations.municipalityId);
      if (municipality) {
        // Find coverage area that includes this municipality
        coverageArea = await CoverageArea.findOne({
          geographicUnits: municipality._id,
          isActive: true
        });
      }
    }
    
    // If not found, try to find a default coverage area
    if (!coverageArea) {
      coverageArea = await CoverageArea.findOne({
        isActive: true
      });
    }
    
    if (coverageArea) {
      console.log(`  Assigning coverage area ${coverageArea.name} to: ${user.email}`);
      if (!dryRun) {
        user.coverageAreas = [{
          coverageAreaId: coverageArea._id,
          coverageAreaName: coverageArea.name,
          districtIds: [],
          municipalityIds: [],
          isPrimary: true,
          assignedAt: new Date()
        }];
        await user.save();
      }
      assignedCount++;
    } else {
      console.log(`  ⚠ No coverage area found for: ${user.email}`);
      skippedCount++;
    }
  }
  
  console.log(`\n✓ Step 4 Complete: ${assignedCount} coverage areas assigned, ${skippedCount} users skipped`);
}

/**
 * Step 5: Migrate staff permissions
 * Ensures staff members have proper permissions based on their roles
 */
async function migrateStaffPermissions() {
  console.log('\n📝 Step 5: Migrating Staff Permissions');
  console.log('='.repeat(60));
  
  const users = await User.find({ isActive: true });
  let verifiedCount = 0;
  let skippedCount = 0;
  
  for (const user of users) {
    const userRoles = await permissionService.getUserRoles(user._id);
    
    if (userRoles.length === 0) {
      skippedCount++;
      continue;
    }
    
    // Verify permissions are correctly assigned
    const permissions = await permissionService.getUserPermissions(user._id);
    
    if (permissions.length === 0) {
      console.log(`  ⚠ User ${user.email} has roles but no permissions`);
    } else {
      verifiedCount++;
    }
  }
  
  console.log(`\n✓ Step 5 Complete: ${verifiedCount} users verified, ${skippedCount} users skipped`);
}

/**
 * Main migration function
 */
async function migrate() {
  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode — no writes will be performed.\n');
  }

  console.log('🚀 Starting User Migration to New Model\n');
  console.log('='.repeat(60));
  
  const uri = getConnectionUri();
  await connect(uri);

  try {
    if (stepsToRun.includes(1)) {
      await migrateMissingRoles();
    }

    if (stepsToRun.includes(2)) {
      await migrateUserAuthority();
    }

    if (stepsToRun.includes(3)) {
      await migrateUserOrganizations();
    }

    if (stepsToRun.includes(4)) {
      await migrateUserCoverage();
    }

    if (stepsToRun.includes(5)) {
      await migrateStaffPermissions();
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration Complete!');
    console.log('='.repeat(60));
    
    if (dryRun) {
      console.log('\n⚠️  This was a dry-run. No changes were written.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n🎉 Users migrated successfully!');
    }
  } catch (error) {
    console.error('\n❌ Migration error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { migrate };

