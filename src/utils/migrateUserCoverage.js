/**
 * Migration Script: Migrate User Coverage Areas
 * 
 * Populates User.coverageAreas[] embedded array from UserCoverageAssignment collection.
 * Derives municipalityIds from coverage area geographic units (districts).
 * This is a one-time migration to populate the new embedded coverageAreas field.
 * 
 * Usage:
 *   node src/utils/migrateUserCoverage.js [--dry-run]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserCoverageAssignment, CoverageArea, Location } = require('../models/index');

const DRY_RUN = process.argv.includes('--dry-run');

async function migrateUserCoverage() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('Connected to database');

    if (DRY_RUN) {
      console.log('⚠️  DRY RUN MODE - No changes will be saved');
    }

    // Get all active coverage area assignments
    const assignments = await UserCoverageAssignment.find({ isActive: true })
      .populate({
        path: 'coverageAreaId',
        populate: {
          path: 'geographicUnits',
          model: 'Location'
        }
      })
      .sort({ userId: 1, isPrimary: -1, assignedAt: -1 });
    
    console.log(`Found ${assignments.length} active coverage area assignments`);

    // Group by userId
    const assignmentsByUser = {};
    for (const assignment of assignments) {
      const userId = assignment.userId.toString();
      if (!assignmentsByUser[userId]) {
        assignmentsByUser[userId] = [];
      }
      assignmentsByUser[userId].push(assignment);
    }

    console.log(`Found ${Object.keys(assignmentsByUser).length} unique users with coverage area assignments`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const [userId, userAssignments] of Object.entries(assignmentsByUser)) {
      try {
        const user = await User.findById(userId);
        if (!user) {
          console.log(`  ✗ User ${userId} not found, skipping`);
          skipped++;
          continue;
        }

        // Check if user already has coverage areas embedded
        if (user.coverageAreas && user.coverageAreas.length > 0) {
          console.log(`  ✓ User "${user.email}" already has ${user.coverageAreas.length} coverage areas embedded, skipping`);
          skipped++;
          continue;
        }

        console.log(`  → User "${user.email}": migrating ${userAssignments.length} coverage area assignments...`);

        const coverageAreasToEmbed = [];

        for (const assignment of userAssignments) {
          const coverageArea = assignment.coverageAreaId;
          
          // Skip if coverage area not populated or inactive
          if (!coverageArea || !coverageArea.isActive) {
            console.log(`    ⚠ Skipping inactive or missing coverage area for assignment ${assignment._id}`);
            continue;
          }

          // Check expiration
          if (assignment.expiresAt && new Date() > assignment.expiresAt) {
            console.log(`    ⚠ Skipping expired coverage area assignment ${assignment._id}`);
            continue;
          }

          // Get geographic units (districts/provinces)
          const geographicUnits = coverageArea.geographicUnits || [];
          
          // Extract districts from geographic units
          const districtIds = [];
          const provinceIds = [];

          for (const unit of geographicUnits) {
            const unitDoc = typeof unit === 'object' && unit._id ? unit : await Location.findById(unit);
            if (!unitDoc) continue;

            if (unitDoc.type === 'district' || unitDoc.type === 'city') {
              districtIds.push(unitDoc._id);
            } else if (unitDoc.type === 'province') {
              provinceIds.push(unitDoc._id);
            }
          }

          // If coverage area contains provinces, get all districts under those provinces
          if (provinceIds.length > 0) {
            const provinceDistricts = await Location.find({
              type: { $in: ['district', 'city'] },
              parent: { $in: provinceIds },
              isActive: true
            });
            provinceDistricts.forEach(d => {
              if (!districtIds.some(id => id.toString() === d._id.toString())) {
                districtIds.push(d._id);
              }
            });
          }

          // Get all municipalities under these districts
          const municipalityIds = [];
          if (districtIds.length > 0) {
            const municipalities = await Location.find({
              type: 'municipality',
              parent: { $in: districtIds },
              isActive: true
            });
            municipalities.forEach(m => municipalityIds.push(m._id));
          }

          console.log(`    → Coverage area "${coverageArea.name}":`);
          console.log(`      Districts: ${districtIds.length}, Municipalities: ${municipalityIds.length}`);

          coverageAreasToEmbed.push({
            coverageAreaId: coverageArea._id,
            coverageAreaName: coverageArea.name,
            districtIds: districtIds,
            municipalityIds: municipalityIds,
            isPrimary: assignment.isPrimary || false,
            assignedAt: assignment.assignedAt || assignment.createdAt || new Date(),
            assignedBy: assignment.assignedBy || null
          });
        }

        if (coverageAreasToEmbed.length === 0) {
          console.log(`    ⚠ No valid coverage areas to embed for user "${user.email}"`);
          skipped++;
          continue;
        }

        if (!DRY_RUN) {
          // Update user with embedded coverage areas
          user.coverageAreas = coverageAreasToEmbed;
          await user.save();
          console.log(`    ✓ Embedded ${coverageAreasToEmbed.length} coverage areas`);
        } else {
          console.log(`    [DRY RUN] Would embed ${coverageAreasToEmbed.length} coverage areas`);
        }

        migrated++;
      } catch (error) {
        console.error(`  ✗ Error migrating coverage areas for user ${userId}:`, error.message);
        console.error(error.stack);
        errors++;
      }
    }

    console.log('\n=== Migration Summary ===');
    console.log(`Total assignments: ${assignments.length}`);
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
migrateUserCoverage();














