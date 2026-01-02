/**
 * Fix Stakeholder Signup Data Script
 * 
 * This script fixes existing stakeholders created via signup who are missing:
 * 1. Embedded `user.locations` field (required for jurisdiction filtering)
 * 2. Embedded `user.roles` array (should be populated from UserRole collection)
 * 3. Incorrect authority (should be 30, not 60 or 20)
 * 
 * Usage:
 *   node src/utils/fixStakeholderSignupData.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be changed without actually updating
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, UserRole, UserLocation, Location } = require('../models');
const authorityService = require('../services/users_services/authority.service');
const { getConnectionUri, connect, disconnect } = require('./dbConnection');

async function fixStakeholderSignupData(dryRun = false) {
  try {
    // Connect to database using shared utility
    const mongoUri = getConnectionUri();
    await connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all stakeholders (authority < 60) who might have signup issues
    const stakeholders = await User.find({
      authority: { $lt: 60 },
      isActive: true
    }).select('_id email firstName lastName authority roles organizations locations');

    console.log(`\nFound ${stakeholders.length} stakeholders to check\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    let errors = [];

    for (const stakeholder of stakeholders) {
      try {
        let needsUpdate = false;
        const updates = {
          roles: [],
          locations: null,
          authority: null
        };

        // Check 1: Fix empty roles array
        if (!stakeholder.roles || stakeholder.roles.length === 0) {
          console.log(`[${stakeholder.email}] Missing roles array, fetching from UserRole collection...`);
          
          const userRoles = await UserRole.find({ 
            userId: stakeholder._id, 
            isActive: true 
          })
            .populate('roleId')
            .sort({ assignedAt: -1 });

          // Filter to only stakeholder roles (authority < 60)
          const stakeholderRoles = userRoles.filter(ur => {
            const auth = ur.roleId?.authority || 20;
            return auth < 60;
          });

          if (stakeholderRoles.length > 0) {
            updates.roles = stakeholderRoles.map(ur => ({
              roleId: ur.roleId._id,
              roleCode: ur.roleId.code,
              roleAuthority: ur.roleId.authority || 20,
              assignedAt: ur.assignedAt || new Date(),
              assignedBy: ur.assignedBy || null,
              isActive: ur.isActive !== false
            }));
            needsUpdate = true;
            console.log(`  → Found ${updates.roles.length} stakeholder role(s) to sync`);
          } else {
            console.log(`  → No active stakeholder roles found in UserRole collection`);
          }
        } else {
          updates.roles = stakeholder.roles;
        }

        // Check 2: Fix missing locations field
        if (!stakeholder.locations || !stakeholder.locations.municipalityId) {
          console.log(`[${stakeholder.email}] Missing locations field, fetching from UserLocation...`);
          
          // Get municipality from UserLocation assignments
          const userLocations = await UserLocation.find({ 
            userId: stakeholder._id,
            isActive: true
          }).populate('locationId');

          // Find municipality (type: 'municipality')
          const municipalityAssignment = userLocations.find(
            ul => ul.locationId && ul.locationId.type === 'municipality'
          );

          if (municipalityAssignment && municipalityAssignment.locationId) {
            const municipality = municipalityAssignment.locationId;
            updates.locations = {
              municipalityId: municipality._id,
              municipalityName: municipality.name,
              barangayId: null,
              barangayName: null
            };

            // Check for barangay
            const barangayAssignment = userLocations.find(
              ul => ul.locationId && ul.locationId.type === 'barangay'
            );
            if (barangayAssignment && barangayAssignment.locationId) {
              const barangay = barangayAssignment.locationId;
              updates.locations.barangayId = barangay._id;
              updates.locations.barangayName = barangay.name;
            }

            needsUpdate = true;
            console.log(`  → Found municipality: ${updates.locations.municipalityName}`);
            if (updates.locations.barangayName) {
              console.log(`  → Found barangay: ${updates.locations.barangayName}`);
            }
          } else {
            console.log(`  → No municipality found in UserLocation assignments`);
          }
        } else {
          updates.locations = stakeholder.locations;
        }

        // Check 3: Fix incorrect authority
        // Recalculate authority if roles are present
        if (updates.roles && updates.roles.length > 0) {
          const expectedAuthority = Math.max(...updates.roles.map(r => r.roleAuthority || 20));
          
          if (stakeholder.authority !== expectedAuthority) {
            console.log(`[${stakeholder.email}] Incorrect authority: ${stakeholder.authority} (expected: ${expectedAuthority})`);
            updates.authority = expectedAuthority;
            needsUpdate = true;
          }
        } else if (stakeholder.authority >= 60) {
          // If no roles but authority is 60+, set to 20 (BASIC_USER)
          console.log(`[${stakeholder.email}] No roles but authority is ${stakeholder.authority}, setting to 20`);
          updates.authority = 20;
          needsUpdate = true;
        }

        // Apply updates if needed
        if (needsUpdate) {
          if (dryRun) {
            console.log(`[DRY RUN] Would update ${stakeholder.email}:`, {
              rolesCount: updates.roles.length,
              hasLocations: !!updates.locations?.municipalityId,
              authority: updates.authority || stakeholder.authority
            });
            fixedCount++;
          } else {
            // Update user document
            stakeholder.roles = updates.roles;
            if (updates.locations) {
              stakeholder.locations = updates.locations;
            }
            if (updates.authority !== null) {
              stakeholder.authority = updates.authority;
            }
            
            await stakeholder.save();
            
            console.log(`[FIXED] ${stakeholder.email}:`, {
              rolesCount: updates.roles.length,
              hasLocations: !!updates.locations?.municipalityId,
              authority: stakeholder.authority
            });
            fixedCount++;
          }
        } else {
          console.log(`[SKIP] ${stakeholder.email} - No issues found`);
          skippedCount++;
        }
      } catch (error) {
        console.error(`[ERROR] Failed to process ${stakeholder.email}:`, error.message);
        errors.push({ email: stakeholder.email, error: error.message });
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total stakeholders checked: ${stakeholders.length}`);
    console.log(`Fixed: ${fixedCount}`);
    console.log(`Skipped (no issues): ${skippedCount}`);
    console.log(`Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`  - ${e.email}: ${e.error}`));
    }

    if (dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes were saved');
      console.log('Run without --dry-run to apply changes');
    }

    await disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error fixing stakeholder signup data:', error);
    await disconnect();
    process.exit(1);
  }
}

// Parse command line arguments
const dryRun = process.argv.includes('--dry-run');

// Run the migration
fixStakeholderSignupData(dryRun)
  .then(() => {
    console.log('\nMigration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });

