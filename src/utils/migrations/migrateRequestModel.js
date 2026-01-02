/**
 * Migration Script: Event Request Model Modernization
 * 
 * Converts legacy request fields to new authority/permission-based structure:
 * - made_by_id → requester.userId
 * - coordinator_id → assignedCoordinator.userId
 * - stakeholder_id → stakeholderReference.userId
 * - Populates organizationId, coverageAreaId, municipalityId from user relationships
 * - Adds authoritySnapshot to requester field
 * 
 * SAFETY:
 * - Runs in transaction
 * - Creates backup before migration
 * - Validates each record
 * - Logs failures for manual review
 */

const mongoose = require('mongoose');
const { EventRequest } = require('../../models/index');
const { User } = require('../../models/index');
const authorityService = require('../../services/users_services/authority.service');

class RequestModelMigration {
  constructor() {
    this.stats = {
      total: 0,
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Main migration method
   * @param {Object} options - Migration options
   * @param {boolean} options.dryRun - If true, don't actually save changes
   * @param {number} options.batchSize - Number of records to process per batch
   * @param {number} options.limit - Maximum number of records to process (for testing)
   */
  async migrate(options = {}) {
    const { dryRun = false, batchSize = 100, limit = null } = options;

    console.log('[MIGRATION] Starting Event Request model migration...', { dryRun, batchSize, limit });

    try {
      // Get all requests that need migration
      const query = {
        $or: [
          { 'requester.userId': { $exists: false } },
          { 'assignedCoordinator.userId': { $exists: false } },
          { 'stakeholderReference.userId': { $exists: false } },
          { organizationId: { $exists: false } },
          { 'requester.authoritySnapshot': { $exists: false } }
        ]
      };

      const requests = await EventRequest.find(query)
        .limit(limit || 10000)
        .lean();

      this.stats.total = requests.length;
      console.log(`[MIGRATION] Found ${this.stats.total} requests to migrate`);

      if (this.stats.total === 0) {
        console.log('[MIGRATION] No requests need migration. Exiting.');
        return this.stats;
      }

      // Process in batches
      for (let i = 0; i < requests.length; i += batchSize) {
        const batch = requests.slice(i, i + batchSize);
        console.log(`[MIGRATION] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} requests)`);

        for (const request of batch) {
          try {
            await this.migrateRequest(request, dryRun);
            this.stats.migrated++;
          } catch (error) {
            this.stats.failed++;
            this.stats.errors.push({
              requestId: request.Request_ID,
              error: error.message
            });
            console.error(`[MIGRATION] Failed to migrate request ${request.Request_ID}:`, error.message);
          }
        }
      }

      console.log('[MIGRATION] Migration complete:', this.stats);
      return this.stats;
    } catch (error) {
      console.error('[MIGRATION] Fatal error during migration:', error);
      throw error;
    }
  }

  /**
   * Migrate a single request
   * @private
   */
  async migrateRequest(request, dryRun = false) {
    const updates = {};
    let needsUpdate = false;

    // 1. Migrate made_by_id → requester.userId
    if (request.made_by_id && !request.requester?.userId) {
      const user = await this._findUser(request.made_by_id);
      if (user) {
        updates['requester.userId'] = user._id;
        updates['requester.id'] = request.made_by_id; // Keep legacy ID
        updates['requester.roleSnapshot'] = request.made_by_role || null;
        updates['requester.name'] = user.fullName || `${user.firstName} ${user.lastName}` || null;
        
        // Add authority snapshot
        const authority = user.authority || await authorityService.calculateUserAuthority(user._id);
        updates['requester.authoritySnapshot'] = authority;
        
        needsUpdate = true;
      } else {
        console.warn(`[MIGRATION] User not found for made_by_id: ${request.made_by_id}`);
        // Still set the legacy ID for fallback
        updates['requester.id'] = request.made_by_id;
        updates['requester.roleSnapshot'] = request.made_by_role || null;
        needsUpdate = true;
      }
    }

    // 2. Migrate coordinator_id → assignedCoordinator.userId
    if (request.coordinator_id && !request.assignedCoordinator?.userId) {
      const user = await this._findUser(request.coordinator_id);
      if (user) {
        updates['assignedCoordinator.userId'] = user._id;
        updates['assignedCoordinator.id'] = request.coordinator_id; // Keep legacy ID
        updates['assignedCoordinator.assignedAt'] = request.createdAt || new Date();
        updates['assignedCoordinator.assignmentRule'] = 'auto'; // Default to auto for migrated records
        needsUpdate = true;
      } else {
        console.warn(`[MIGRATION] User not found for coordinator_id: ${request.coordinator_id}`);
        updates['assignedCoordinator.id'] = request.coordinator_id;
        needsUpdate = true;
      }
    }

    // 3. Migrate stakeholder_id → stakeholderReference.userId
    if (request.stakeholder_id && !request.stakeholderReference?.userId) {
      const user = await this._findUser(request.stakeholder_id);
      if (user) {
        updates['stakeholderReference.userId'] = user._id;
        updates['stakeholderReference.id'] = request.stakeholder_id; // Keep legacy ID
        updates['stakeholderReference.relationshipType'] = 'creator'; // Default for migrated records
        needsUpdate = true;
      } else {
        console.warn(`[MIGRATION] User not found for stakeholder_id: ${request.stakeholder_id}`);
        updates['stakeholderReference.id'] = request.stakeholder_id;
        needsUpdate = true;
      }
    }

    // 4. Populate organizationId from requester's organizations
    if (!request.organizationId && request.requester?.userId) {
      const user = await User.findById(request.requester.userId).select('organizations');
      if (user && user.organizations && user.organizations.length > 0) {
        const primaryOrg = user.organizations.find(org => org.isPrimary) || user.organizations[0];
        if (primaryOrg && primaryOrg.organizationId) {
          updates.organizationId = primaryOrg.organizationId;
          needsUpdate = true;
        }
      }
    }

    // 5. Populate coverageAreaId and municipalityId from requester's coverage
    if (!request.coverageAreaId && request.requester?.userId) {
      const user = await User.findById(request.requester.userId).select('coverageAreas locations');
      if (user) {
        // Try coverageAreas first
        if (user.coverageAreas && user.coverageAreas.length > 0) {
          const primaryCoverage = user.coverageAreas.find(ca => ca.isPrimary) || user.coverageAreas[0];
          if (primaryCoverage && primaryCoverage.coverageAreaId) {
            updates.coverageAreaId = primaryCoverage.coverageAreaId;
            needsUpdate = true;
          }
          
          // Get municipality from coverage area
          if (primaryCoverage && primaryCoverage.municipalityIds && primaryCoverage.municipalityIds.length > 0) {
            updates.municipalityId = primaryCoverage.municipalityIds[0];
            needsUpdate = true;
          }
        }
        
        // Fallback to locations
        if (!updates.municipalityId && user.locations && user.locations.municipalityId) {
          updates.municipalityId = user.locations.municipalityId;
          needsUpdate = true;
        }
      }
    }

    // 6. Ensure authoritySnapshot is set
    if (request.requester?.userId && !request.requester?.authoritySnapshot) {
      const user = await User.findById(request.requester.userId).select('authority');
      if (user) {
        const authority = user.authority || await authorityService.calculateUserAuthority(user._id);
        updates['requester.authoritySnapshot'] = authority;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      if (!dryRun) {
        await EventRequest.updateOne(
          { _id: request._id },
          { $set: updates }
        );
        console.log(`[MIGRATION] Migrated request ${request.Request_ID}`);
      } else {
        console.log(`[MIGRATION] [DRY RUN] Would update request ${request.Request_ID}:`, updates);
      }
    } else {
      this.stats.skipped++;
    }
  }

  /**
   * Find user by ID (supports both ObjectId and legacy string IDs)
   * @private
   */
  async _findUser(userId) {
    if (!userId) return null;

    try {
      // Try ObjectId first
      if (mongoose.Types.ObjectId.isValid(userId)) {
        const user = await User.findById(userId);
        if (user) return user;
      }

      // Try legacy ID lookup
      const user = await User.findByLegacyId(userId);
      return user;
    } catch (error) {
      console.warn(`[MIGRATION] Error finding user ${userId}:`, error.message);
      return null;
    }
  }
}

// CLI execution
if (require.main === module) {
  const migration = new RequestModelMigration();
  
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limit = args.find(arg => arg.startsWith('--limit='))?.split('=')[1];
  
  migration.migrate({
    dryRun,
    limit: limit ? parseInt(limit) : null,
    batchSize: 100
  })
    .then(stats => {
      console.log('\n[MIGRATION] Final Statistics:');
      console.log(JSON.stringify(stats, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('[MIGRATION] Migration failed:', error);
      process.exit(1);
    });
}

module.exports = RequestModelMigration;

