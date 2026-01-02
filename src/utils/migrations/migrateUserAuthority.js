/**
 * Migration Script: Migrate User Authority
 * 
 * Calculates and sets authority field for all User documents based on their roles.
 * This is a one-time migration to populate the new authority field.
 * 
 * Usage:
 *   node src/utils/migrateUserAuthority.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/index');
const authorityService = require('../services/users_services/authority.service');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateUserAuthority() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('Connected to database');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be saved');
    }

    const users = await User.find({});
    console.log(`Found ${users.length} users to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        // Skip if authority already set (unless it's the default)
        if (user.authority && user.authority !== 20) {
          console.log(`  ✓ User "${user.email}" already has authority ${user.authority}, skipping`);
          skipped++;
          continue;
        }

        // Calculate authority from roles
        const calculatedAuthority = await authorityService.calculateUserAuthority(user._id);
        
        console.log(`  → User "${user.email}": calculating authority...`);
        console.log(`    Current: ${user.authority || 'not set'}, Calculated: ${calculatedAuthority}`);

        if (!DRY_RUN) {
          user.authority = calculatedAuthority;
          await user.save();
          console.log(`    ✓ Updated authority to ${calculatedAuthority}`);
        } else {
          console.log(`    [DRY RUN] Would update authority to ${calculatedAuthority}`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Error migrating user "${user.email}":`, error.message);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total users: ${users.length}`);
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
migrateUserAuthority();

