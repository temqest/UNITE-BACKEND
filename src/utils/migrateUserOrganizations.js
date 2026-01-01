/**
 * Migration Script: Migrate User Organizations
 * 
 * Populates User.organizations[] embedded array from UserOrganization collection.
 * This is a one-time migration to populate the new embedded organizations field.
 * 
 * Usage:
 *   node src/utils/migrateUserOrganizations.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserOrganization, Organization } = require('../models/index');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateUserOrganizations() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('Connected to database');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be saved');
    }

    // Get all active user organization assignments
    const userOrgs = await UserOrganization.find({ isActive: true })
      .populate('organizationId')
      .sort({ userId: 1, isPrimary: -1, assignedAt: -1 });
    
    console.log(`Found ${userOrgs.length} active user organization assignments`);

    // Group by userId
    const assignmentsByUser = {};
    for (const uo of userOrgs) {
      const userId = uo.userId.toString();
      if (!assignmentsByUser[userId]) {
        assignmentsByUser[userId] = [];
      }
      assignmentsByUser[userId].push(uo);
    }

    console.log(`Found ${Object.keys(assignmentsByUser).length} unique users with organization assignments`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const [userId, assignments] of Object.entries(assignmentsByUser)) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          console.log(`  ✗ User ${userId} not found, skipping`);
          skipped++;
          continue;
        }

        // Check if user already has organizations embedded
        if (user.organizations && user.organizations.length > 0) {
          console.log(`  ✓ User "${user.email}" already has ${user.organizations.length} organizations embedded, skipping`);
          skipped++;
          continue;
        }

        console.log(`  → User "${user.email}": migrating ${assignments.length} organization assignments...`);

        const organizationsToEmbed = [];

        for (const assignment of assignments) {
          const org = assignment.organizationId;
          
          // Skip if organization not populated or inactive
          if (!org || !org.isActive) {
            console.log(`    ⚠ Skipping inactive or missing organization for assignment ${assignment._id}`);
            continue;
          }

          // Check expiration
          if (assignment.expiresAt && new Date() > assignment.expiresAt) {
            console.log(`    ⚠ Skipping expired organization assignment ${assignment._id}`);
            continue;
          }

          organizationsToEmbed.push({
            organizationId: org._id,
            organizationName: org.name,
            organizationType: org.type,
            isPrimary: assignment.isPrimary || false,
            assignedAt: assignment.assignedAt || assignment.createdAt || new Date(),
            assignedBy: assignment.assignedBy || null
          });
        }

        if (organizationsToEmbed.length === 0) {
          console.log(`    ⚠ No valid organizations to embed for user "${user.email}"`);
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          // Update user with embedded organizations
          user.organizations = organizationsToEmbed;
          await user.save();
          console.log(`    ✓ Embedded ${organizationsToEmbed.length} organizations`);
        } else {
          console.log(`    [DRY RUN] Would embed ${organizationsToEmbed.length} organizations`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Error migrating organizations for user ${userId}:`, error.message);
        errors++;
      }
    }

    // Also migrate legacy User.organizationId field
    console.log('\n--- Migrating legacy User.organizationId field ---');
    const usersWithLegacyOrg = await User.find({ 
      organizationId: { $exists: true, $ne: null },
      $or: [
        { organizations: { $exists: false } },
        { organizations: { $size: 0 } }
      ]
    });

    console.log(`Found ${usersWithLegacyOrg.length} users with legacy organizationId field`);

    for (const user of usersWithLegacyOrg) {
      try {
        const org = await Organization.findById(user.organizationId);
        if (!org || !org.isActive) {
          console.log(`  ⚠ User "${user.email}" has invalid legacy organizationId, skipping`);
          skipped++;
          continue;
        }

        console.log(`  → User "${user.email}": migrating legacy organizationId...`);

        if (!DRY_RUN) {
          user.organizations = [{
            organizationId: org._id,
            organizationName: org.name,
            organizationType: org.type,
            isPrimary: true,
            assignedAt: user.createdAt || new Date(),
            assignedBy: null
          }];
          await user.save();
          console.log(`    ✓ Migrated legacy organization`);
        } else {
          console.log(`    [DRY RUN] Would migrate legacy organization "${org.name}"`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Error migrating legacy organization for user "${user.email}":`, error.message);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total assignments: ${userOrgs.length}`);
    console.log(`Users migrated: ${migrated}`);
    console.log(`Users skipped: ${skipped}`);
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
migrateUserOrganizations();

















