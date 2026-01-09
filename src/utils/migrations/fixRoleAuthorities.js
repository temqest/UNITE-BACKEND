/**
 * Migration Script: Fix Role Authorities
 * 
 * Updates role authority values to correct values based on role code:
 * - system-admin: 100
 * - coordinator: 60
 * - stakeholder: 30
 * 
 * Also recalculates and updates user authorities based on their assigned roles.
 * 
 * Usage:
 *   node src/utils/migrations/fixRoleAuthorities.js [--dry-run]
 */

require('dotenv').config();
const { Role, User } = require('../../models/index');
const authorityService = require('../../services/users_services/authority.service');
const { connect, disconnect, getConnectionUri } = require('../dbConnection');

const DRY_RUN = process.argv.includes('--dry-run');

// Authority mapping for system roles
const roleAuthorityMap = {
  'system-admin': 100,
  'coordinator': 60,
  'stakeholder': 30
};

async function fixRoleAuthorities() {
  try {
    const uri = getConnectionUri();
    console.log('Connecting to database...');
    await connect(uri);
    console.log('Connected to database');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be saved');
    }

    // Step 1: Fix role authorities
    console.log('\n=== Step 1: Fixing Role Authorities ===');
    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles to check`);

    let rolesUpdated = 0;
    let rolesSkipped = 0;
    let roleErrors = 0;

    for (const role of roles) {
      try {
        const expectedAuthority = roleAuthorityMap[role.code];
        
        if (expectedAuthority === undefined) {
          console.log(`  ⚠️  Role "${role.code}" not in authority map, skipping`);
          rolesSkipped++;
          continue;
        }

        if (role.authority === expectedAuthority) {
          console.log(`  ✓ Role "${role.code}" already has correct authority ${role.authority}`);
          rolesSkipped++;
          continue;
        }

        console.log(`  → Role "${role.code}": updating authority`);
        console.log(`    Current: ${role.authority || 'not set'}, Expected: ${expectedAuthority}`);

        if (!DRY_RUN) {
          role.authority = expectedAuthority;
          await role.save();
          console.log(`    ✓ Updated authority to ${expectedAuthority}`);
        } else {
          console.log(`    [DRY RUN] Would update authority to ${expectedAuthority}`);
        }

        rolesUpdated++;
      } catch (error) {
        console.error(`  ✗ Error fixing role "${role.code}":`, error.message);
        roleErrors++;
      }
    }

    console.log('\n=== Role Authority Fix Summary ===');
    console.log(`Total roles: ${roles.length}`);
    console.log(`Updated: ${rolesUpdated}`);
    console.log(`Skipped: ${rolesSkipped}`);
    console.log(`Errors: ${roleErrors}`);

    // Step 2: Recalculate user authorities
    console.log('\n=== Step 2: Recalculating User Authorities ===');
    const users = await User.find({});
    console.log(`Found ${users.length} users to check`);

    let usersUpdated = 0;
    let usersSkipped = 0;
    let userErrors = 0;

    for (const user of users) {
      try {
        // Calculate authority from user's roles
        const calculatedAuthority = await authorityService.calculateUserAuthority(user._id);
        
        if (user.authority === calculatedAuthority) {
          // Skip if authority is already correct
          usersSkipped++;
          continue;
        }

        console.log(`  → User "${user.email || user._id}": updating authority`);
        console.log(`    Current: ${user.authority || 'not set'}, Calculated: ${calculatedAuthority}`);

        if (!DRY_RUN) {
          user.authority = calculatedAuthority;
          await user.save();
          console.log(`    ✓ Updated authority to ${calculatedAuthority}`);
        } else {
          console.log(`    [DRY RUN] Would update authority to ${calculatedAuthority}`);
        }

        usersUpdated++;
      } catch (error) {
        console.error(`  ✗ Error fixing user "${user.email || user._id}":`, error.message);
        userErrors++;
      }
    }

    console.log('\n=== User Authority Fix Summary ===');
    console.log(`Total users: ${users.length}`);
    console.log(`Updated: ${usersUpdated}`);
    console.log(`Skipped: ${usersSkipped}`);
    console.log(`Errors: ${userErrors}`);

    // Final summary
    console.log('\n=== Migration Summary ===');
    console.log(`Roles updated: ${rolesUpdated}`);
    console.log(`Users updated: ${usersUpdated}`);
    console.log(`Total errors: ${roleErrors + userErrors}`);

    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✓ Migration completed successfully');
    }

    await disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await disconnect();
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  fixRoleAuthorities();
}

module.exports = { fixRoleAuthorities };

