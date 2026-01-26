/**
 * Migration: Backfill Event Requests with Broadcast Model Fields
 * 
 * This script migrates existing event requests to the new broadcast model by:
 * 1. Finding all matching coordinators for each request
 * 2. Populating the validCoordinators array
 * 3. Setting claimedBy from the existing reviewer (if any)
 * 4. Preserving the reviewer field for backward compatibility
 * 
 * Usage:
 *   node src/utils/migrateRequestToBroadcastModel.js [--dry-run] [--verbose]
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Models
const EventRequest = require('../models/eventRequests_models/eventRequest.model');
const User = require('../models/users_models/user.model');
const coordinatorResolver = require('../services/users_services/coordinatorResolver.service');

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

const log = (message, data) => {
  if (isVerbose || !message.startsWith('[VERBOSE]')) {
    console.log(message, data || '');
  }
};

async function migrateRequestToBroadcastModel() {
  try {
    log('🔄 Starting migration to broadcast model...');
    log(`   Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);

    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL,
      { serverSelectionTimeoutMS: 5000 }
    );
    log('✅ Connected to MongoDB');

    // Get all requests
    const requests = await EventRequest.find({}).lean();
    log(`📊 Found ${requests.length} event requests to process`);

    if (requests.length === 0) {
      log('✅ No requests to migrate');
      await mongoose.connection.close();
      return;
    }

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (let i = 0; i < requests.length; i++) {
      const request = requests[i];
      const progress = `[${i + 1}/${requests.length}]`;

      try {
        // Skip if already migrated (has validCoordinators with entries)
        if (request.validCoordinators && request.validCoordinators.length > 0) {
          log(`[VERBOSE] ${progress} Skipping ${request.Request_ID} - already migrated`);
          skipCount++;
          continue;
        }

        log(`${progress} Processing ${request.Request_ID}...`);

        // Get the request with populated fields
        const fullRequest = await EventRequest.findById(request._id);

        // Determine location and organization type
        const locationId = request.municipalityId || request.district || request.province;
        const organizationType = request.organizationType || request.Organization_Type;

        if (!locationId) {
          log(`   ⚠️  WARNING: Request ${request.Request_ID} has no location, skipping`);
          errorCount++;
          continue;
        }

        log(`[VERBOSE]    Location: ${locationId.toString()}`);
        log(`[VERBOSE]    Org Type: ${organizationType || 'NOT SET'}`);

        // Find all valid coordinators
        const validCoordinators = await coordinatorResolver.findValidCoordinatorsForRequest(
          locationId,
          organizationType
        );

        log(`[VERBOSE]    Found ${validCoordinators.length} valid coordinators`);

        // Prepare claim information from existing reviewer
        let claimedBy = null;
        if (request.reviewer && request.reviewer.userId) {
          const reviewer = await User.findById(request.reviewer.userId).lean();
          if (reviewer) {
            claimedBy = {
              userId: reviewer._id,
              name: `${reviewer.firstName || ''} ${reviewer.lastName || ''}`.trim(),
              claimedAt: request.reviewer.assignedAt || new Date(),
              claimTimeoutAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            };
            log(`[VERBOSE]    Claimed by: ${claimedBy.name}`);
          }
        }

        if (!isDryRun) {
          // Update the request
          await EventRequest.updateOne(
            { _id: fullRequest._id },
            {
              $set: {
                validCoordinators: validCoordinators,
                claimedBy: claimedBy
              }
            }
          );
          log(`   ✅ Updated ${request.Request_ID}`);
        } else {
          log(`[DRY RUN] Would update ${request.Request_ID}`);
        }

        successCount++;
      } catch (error) {
        console.error(`   ❌ Error processing ${request.Request_ID}:`, error.message);
        errorCount++;
      }
    }

    // Summary
    console.log('\n');
    console.log('═══════════════════════════════════════════════════');
    console.log('📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`✅ Successfully processed: ${successCount}`);
    console.log(`⏭️  Skipped (already migrated): ${skipCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📈 Total: ${successCount + skipCount + errorCount}/${requests.length}`);
    console.log('═══════════════════════════════════════════════════');

    if (isDryRun) {
      console.log('\n⚠️  DRY RUN MODE: No changes were made');
      console.log('Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Migration complete!');
    }

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateRequestToBroadcastModel();
