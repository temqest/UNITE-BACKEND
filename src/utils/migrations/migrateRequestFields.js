/**
 * Migration: Migrate Request Fields
 * 
 * Populates new role-agnostic fields (requester, assignedCoordinator, stakeholderReference)
 * from legacy fields (made_by_id, made_by_role, coordinator_id, stakeholder_id).
 * 
 * This migration ensures backward compatibility while transitioning to the new model.
 */

const mongoose = require('mongoose');
const { EventRequest } = require('../../models/index');
require('../../utils/dbConnection');

async function migrateRequestFields(dryRun = false) {
  try {
    console.log('Starting request fields migration...');
    if (dryRun) {
      console.log('DRY RUN MODE - No changes will be made');
    }

    // Find all requests that need migration
    // Migrate requests that have legacy fields but missing new fields
    const requestsToMigrate = await EventRequest.find({
      $or: [
        { 'requester.userId': { $exists: false }, made_by_id: { $exists: true, $ne: null } },
        { 'assignedCoordinator.userId': { $exists: false }, coordinator_id: { $exists: true, $ne: null } },
        { 'stakeholderReference.userId': { $exists: false }, stakeholder_id: { $exists: true, $ne: null } }
      ]
    });

    if (requestsToMigrate.length === 0) {
      console.log('No requests need migration.');
      return { success: true, updated: 0, message: 'No requests need migration' };
    }

    console.log(`Found ${requestsToMigrate.length} requests to migrate`);

    const { User } = require('../../models/index');
    let updatedCount = 0;
    const results = [];
    const errors = [];

    for (const request of requestsToMigrate) {
      try {
        let needsUpdate = false;
        const updates = {};

        // Migrate requester field from made_by_id + made_by_role
        if (!request.requester || !request.requester.userId) {
          if (request.made_by_id) {
            // Try to find user by ID
            let user = null;
            if (mongoose.Types.ObjectId.isValid(request.made_by_id)) {
              user = await User.findById(request.made_by_id);
            }
            if (!user) {
              user = await User.findByLegacyId(request.made_by_id);
            }

            if (user) {
              updates['requester'] = {
                userId: user._id,
                id: request.made_by_id, // Legacy ID fallback
                roleSnapshot: request.made_by_role || user.roles?.[0]?.roleCode || 'Coordinator',
                authoritySnapshot: user.authority || 20,
                name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || null
              };
              needsUpdate = true;
            } else {
              // User not found - create minimal requester object with legacy data
              updates['requester'] = {
                id: request.made_by_id,
                roleSnapshot: request.made_by_role || 'Coordinator',
                authoritySnapshot: 20, // Default
                name: null
              };
              needsUpdate = true;
            }
          }
        }

        // Migrate assignedCoordinator from coordinator_id
        if (!request.assignedCoordinator || !request.assignedCoordinator.userId) {
          if (request.coordinator_id) {
            let user = null;
            if (mongoose.Types.ObjectId.isValid(request.coordinator_id)) {
              user = await User.findById(request.coordinator_id);
            }
            if (!user) {
              user = await User.findByLegacyId(request.coordinator_id);
            }

            if (user) {
              updates['assignedCoordinator'] = {
                userId: user._id,
                id: request.coordinator_id, // Legacy ID fallback
                assignedAt: request.createdAt || new Date(),
                assignedBy: request.requester?.userId || null,
                assignmentRule: 'auto' // Default to auto for migrated records
              };
              needsUpdate = true;
            } else {
              // User not found - create minimal assignedCoordinator object
              updates['assignedCoordinator'] = {
                id: request.coordinator_id,
                assignedAt: request.createdAt || new Date(),
                assignmentRule: 'auto'
              };
              needsUpdate = true;
            }
          }
        }

        // Migrate stakeholderReference from stakeholder_id
        if (!request.stakeholderReference || !request.stakeholderReference.userId) {
          if (request.stakeholder_id) {
            let user = null;
            if (mongoose.Types.ObjectId.isValid(request.stakeholder_id)) {
              user = await User.findById(request.stakeholder_id);
            }
            if (!user) {
              user = await User.findByLegacyId(request.stakeholder_id);
            }

            if (user) {
              updates['stakeholderReference'] = {
                userId: user._id,
                id: request.stakeholder_id, // Legacy ID fallback
                relationshipType: 'creator' // Default
              };
              needsUpdate = true;
            } else {
              // User not found - create minimal stakeholderReference object
              updates['stakeholderReference'] = {
                id: request.stakeholder_id,
                relationshipType: 'creator'
              };
              needsUpdate = true;
            }
          }
        }

        // Migrate organization/coverage data if missing
        if (!request.organizationId || !request.coverageAreaId || !request.municipalityId) {
          // Try to get from requester or assignedCoordinator
          const sourceUserId = request.requester?.userId || request.assignedCoordinator?.userId;
          if (sourceUserId) {
            const sourceUser = await User.findById(sourceUserId);
            if (sourceUser) {
              if (!request.organizationId && sourceUser.organizations && sourceUser.organizations.length > 0) {
                const activeOrg = sourceUser.organizations.find(org => org.isActive !== false) || sourceUser.organizations[0];
                if (activeOrg?.organizationId) {
                  updates['organizationId'] = activeOrg.organizationId;
                  needsUpdate = true;
                }
              }
              
              if (!request.coverageAreaId && sourceUser.coverageAreas && sourceUser.coverageAreas.length > 0) {
                const primaryCoverage = sourceUser.coverageAreas.find(ca => ca.isPrimary) || sourceUser.coverageAreas[0];
                if (primaryCoverage?.coverageAreaId) {
                  updates['coverageAreaId'] = primaryCoverage.coverageAreaId;
                  needsUpdate = true;
                }
              }
              
              if (!request.municipalityId && sourceUser.coverageAreas && sourceUser.coverageAreas.length > 0) {
                const primaryCoverage = sourceUser.coverageAreas.find(ca => ca.isPrimary) || sourceUser.coverageAreas[0];
                if (primaryCoverage?.municipalityIds && primaryCoverage.municipalityIds.length > 0) {
                  updates['municipalityId'] = primaryCoverage.municipalityIds[0];
                  needsUpdate = true;
                }
              }
            }
          }
        }

        if (needsUpdate && !dryRun) {
          // Apply updates
          Object.keys(updates).forEach(key => {
            if (key === 'requester' || key === 'assignedCoordinator' || key === 'stakeholderReference') {
              // Merge nested objects
              request[key] = { ...request[key], ...updates[key] };
            } else {
              request[key] = updates[key];
            }
          });
          
          await request.save();
          updatedCount++;
          results.push({
            requestId: request.Request_ID,
            requestMongoId: request._id,
            updates: Object.keys(updates)
          });
          console.log(`[${request.Request_ID}] ✓ Migrated fields: ${Object.keys(updates).join(', ')}`);
        } else if (needsUpdate && dryRun) {
          results.push({
            requestId: request.Request_ID,
            requestMongoId: request._id,
            updates: Object.keys(updates),
            wouldUpdate: true
          });
          console.log(`[${request.Request_ID}] Would migrate fields: ${Object.keys(updates).join(', ')}`);
        }
      } catch (error) {
        const errorMsg = `Error migrating request ${request.Request_ID}: ${error.message}`;
        console.error(errorMsg);
        errors.push({
          requestId: request.Request_ID,
          error: error.message
        });
      }
    }

    console.log(`\nMigration ${dryRun ? 'dry run' : 'completed'}:`);
    console.log(`- Requests checked: ${requestsToMigrate.length}`);
    console.log(`- Requests ${dryRun ? 'that would be' : ''} updated: ${updatedCount}`);
    console.log(`- Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(err => console.log(`  - ${err.requestId}: ${err.error}`));
    }

    return {
      success: true,
      updated: updatedCount,
      checked: requestsToMigrate.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      dryRun
    };
  } catch (error) {
    console.error('Error migrating request fields:', error);
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
  migrateRequestFields(dryRun)
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateRequestFields };

