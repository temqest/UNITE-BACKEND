/**
 * Migration Script: Set activeResponder and lastAction for existing requests
 * 
 * This script migrates existing event requests to include the new activeResponder
 * and lastAction fields required for the turn-based state machine.
 * 
 * Usage: node src/scripts/migrate_request_active_responder.js
 */

const mongoose = require('mongoose');
const { REQUEST_STATES } = require('../utils/eventRequests/requestConstants');
const RequestStateService = require('../services/eventRequests_services/requestState.service');

// Import models
const { EventRequestLegacy: EventRequest } = require('../models/request_models/eventRequest.model');
const { User } = require('../models/index');

async function migrateRequests() {
  try {
    // Connect to database (adjust connection string as needed)
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get all requests
    const requests = await EventRequest.find({}).lean();
    console.log(`Found ${requests.length} requests to migrate`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const request of requests) {
      try {
        // Skip if already migrated
        if (request.activeResponder !== undefined && request.activeResponder !== null) {
          skipped++;
          continue;
        }

        const requestDoc = await EventRequest.findById(request._id);
        if (!requestDoc) {
          console.warn(`Request ${request._id} not found, skipping`);
          skipped++;
          continue;
        }

        const normalizedState = RequestStateService.normalizeState(request.status || request.Status);
        
        // Set activeResponder based on current state
        const activeResponder = RequestStateService.getActiveResponder(requestDoc);
        if (activeResponder) {
          requestDoc.activeResponder = activeResponder;
        } else {
          // Final states have no active responder
          requestDoc.activeResponder = null;
        }

        // Set lastAction from decisionHistory if available
        if (request.decisionHistory && request.decisionHistory.length > 0) {
          const lastDecision = request.decisionHistory[request.decisionHistory.length - 1];
          if (lastDecision && lastDecision.actor && lastDecision.actor.userId) {
            requestDoc.lastAction = {
              action: lastDecision.type === 'accept' ? 'accept' : 
                      lastDecision.type === 'reject' ? 'reject' : 
                      lastDecision.type === 'reschedule' ? 'reschedule' : null,
              actorId: lastDecision.actor.userId,
              timestamp: lastDecision.decidedAt || new Date()
            };
          }
        } else if (request.statusHistory && request.statusHistory.length > 0) {
          // Fallback to statusHistory
          const lastStatusChange = request.statusHistory[request.statusHistory.length - 1];
          if (lastStatusChange && lastStatusChange.actor && lastStatusChange.actor.userId) {
            requestDoc.lastAction = {
              action: 'status_change', // Generic action
              actorId: lastStatusChange.actor.userId,
              timestamp: lastStatusChange.changedAt || new Date()
            };
          }
        }

        // If no lastAction found, set to null
        if (!requestDoc.lastAction) {
          requestDoc.lastAction = null;
        }

        await requestDoc.save();
        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`Migrated ${migrated} requests...`);
        }
      } catch (error) {
        console.error(`Error migrating request ${request._id}: ${error.message}`);
        errors++;
      }
    }

    console.log('\nMigration completed:');
    console.log(`  - Migrated: ${migrated}`);
    console.log(`  - Skipped: ${skipped}`);
    console.log(`  - Errors: ${errors}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateRequests()
    .then(() => {
      console.log('Migration script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateRequests };

