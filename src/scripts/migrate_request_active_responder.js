/**
 * Migration Script: Set activeResponder and lastAction for existing requests
 * 
 * This script migrates existing event requests to include the new activeResponder
 * and lastAction fields required for the turn-based state machine.
 * 
 * Usage: node src/scripts/migrate_request_active_responder.js
 */

const mongoose = require('mongoose');
require('dotenv').config();
const { REQUEST_STATES } = require('../utils/eventRequests/requestConstants');
const RequestStateService = require('../services/eventRequests_services/requestState.service');

// Import models - use the new EventRequest model
const EventRequest = require('../models/eventRequests_models/eventRequest.model');
const { User } = require('../models/index');

async function migrateRequests() {
  try {
    // Connect to database - use MONGO_URI and MONGO_DB_NAME
    const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
    const mongoDbName = process.env.MONGO_DB_NAME || null;
    
    if (!rawMongoUri) {
      console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
      console.error('Please set MONGODB_URI or MONGO_URI in your .env file');
      process.exit(1);
    }
    
    // Build connection URI with database name if provided
    let mongoUri = rawMongoUri;
    if (mongoDbName) {
      // Determine if the URI already has a database name portion (i.e. after the host and before query '?')
      const idx = rawMongoUri.indexOf('?');
      const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
      // If there is no DB portion (no slash followed by non-empty segment after the host), append one.
      const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
      if (!hasDb) {
        if (idx === -1) {
          mongoUri = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
        } else {
          mongoUri = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
        }
      } else {
        // Replace existing database name with the one from MONGO_DB_NAME
        const parts = beforeQuery.split('/');
        parts[parts.length - 1] = mongoDbName;
        mongoUri = idx === -1 ? parts.join('/') : `${parts.join('/')}${rawMongoUri.slice(idx)}`;
      }
      console.log(`Using database name from MONGO_DB_NAME: ${mongoDbName}`);
    }
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`✅ Connected to MongoDB: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

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

