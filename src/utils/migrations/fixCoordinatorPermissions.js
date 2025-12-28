/**
 * Migration: Fix Coordinator Permissions
 * 
 * Ensures all coordinator roles have the 'request.review' permission.
 * This is critical for the reviewer assignment system to work correctly.
 */

const mongoose = require('mongoose');
const { Role } = require('../../models/index');
require('../../utils/dbConnection');

async function fixCoordinatorPermissions(dryRun = false) {
  try {
    console.log('Starting coordinator permissions fix...');
    if (dryRun) {
      console.log('DRY RUN MODE - No changes will be made');
    }

    // Find all coordinator roles
    const coordinatorRoles = await Role.find({ 
      $or: [
        { code: 'coordinator' },
        { authority: { $gte: 60, $lt: 80 } } // Coordinator authority tier
      ]
    });

    if (coordinatorRoles.length === 0) {
      console.log('No coordinator roles found.');
      return { success: true, updated: 0, message: 'No coordinator roles found' };
    }

    let updatedCount = 0;
    const results = [];

    for (const role of coordinatorRoles) {
      const hasReviewPermission = role.permissions && role.permissions.some(
        perm => perm.resource === 'request' && perm.actions.includes('review')
      );

      if (!hasReviewPermission) {
        console.log(`[${role.code}] Missing request.review permission`);
        
        if (!dryRun) {
          // Add request.review permission
          if (!role.permissions) {
            role.permissions = [];
          }

          // Check if request resource already exists
          const requestPermIndex = role.permissions.findIndex(p => p.resource === 'request');
          if (requestPermIndex >= 0) {
            // Add 'review' to existing request permissions
            if (!role.permissions[requestPermIndex].actions.includes('review')) {
              role.permissions[requestPermIndex].actions.push('review');
            }
          } else {
            // Create new request permission with review action
            role.permissions.push({
              resource: 'request',
              actions: ['review']
            });
          }

          await role.save();
          updatedCount++;
          results.push({
            roleCode: role.code,
            roleId: role._id,
            action: 'Added request.review permission'
          });
          console.log(`[${role.code}] ✓ Added request.review permission`);
        } else {
          results.push({
            roleCode: role.code,
            roleId: role._id,
            action: 'Would add request.review permission'
          });
        }
      } else {
        console.log(`[${role.code}] ✓ Already has request.review permission`);
        results.push({
          roleCode: role.code,
          roleId: role._id,
          action: 'Already has request.review permission'
        });
      }
    }

    console.log(`\nMigration ${dryRun ? 'dry run' : 'completed'}:`);
    console.log(`- Roles checked: ${coordinatorRoles.length}`);
    console.log(`- Roles ${dryRun ? 'that would be' : ''} updated: ${updatedCount}`);
    console.log(`- Roles already correct: ${coordinatorRoles.length - updatedCount}`);

    return {
      success: true,
      updated: updatedCount,
      checked: coordinatorRoles.length,
      results,
      dryRun
    };
  } catch (error) {
    console.error('Error fixing coordinator permissions:', error);
    throw error;
  } finally {
    if (!dryRun) {
      await mongoose.connection.close();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  fixCoordinatorPermissions(dryRun)
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { fixCoordinatorPermissions };





