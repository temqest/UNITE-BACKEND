/**
 * Migration Script: Migrate Role Authority
 * 
 * Calculates and sets authority field for all Role documents based on their permissions.
 * This is a one-time migration to populate the new authority field.
 * 
 * Usage:
 *   node src/utils/migrateRoleAuthority.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Role } = require('../models/index');
const authorityService = require('../services/users_services/authority.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateRoleAuthority() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('Connected to database');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be saved');
    }

    const roles = await Role.find({});
    console.log(`Found ${roles.length} roles to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const role of roles) {
      try {
        // Skip if authority already set (unless it's the default)
        if (role.authority && role.authority !== 20) {
          console.log(`  ✓ Role "${role.code}" already has authority ${role.authority}, skipping`);
          skipped++;
          continue;
        }

        // Calculate authority from permissions
        const calculatedAuthority = await authorityService.calculateRoleAuthority(role._id);
        
        console.log(`  → Role "${role.code}": calculating authority...`);
        console.log(`    Current: ${role.authority || 'not set'}, Calculated: ${calculatedAuthority}`);

        if (!DRY_RUN) {
          role.authority = calculatedAuthority;
          await role.save();
          console.log(`    ✓ Updated authority to ${calculatedAuthority}`);
        } else {
          console.log(`    [DRY RUN] Would update authority to ${calculatedAuthority}`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Error migrating role "${role.code}":`, error.message);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total roles: ${roles.length}`);
    console.log(`Migrated: ${migrated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);

    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to apply changes.');
    } else {
      console.log('\n✓ Migration completed successfully');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrateRoleAuthority();

