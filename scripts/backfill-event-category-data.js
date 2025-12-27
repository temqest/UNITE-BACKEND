/**
 * Backfill Script: Repair Event Category Data
 * 
 * This script finds all approved events that are missing their category records
 * (BloodDrive, Training, or Advocacy) and creates them using data from the
 * original EventRequest if available.
 * 
 * Usage: node scripts/backfill-event-category-data.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const { Event, BloodDrive, Training, Advocacy, EventRequest } = require('../src/models/index');

// MongoDB connection - use same logic as server.js
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
const mongoDbName = process.env.MONGO_DB_NAME || null; // optional DB name to ensure connection to a specific DB

// Validate required environment variables
if (!rawMongoUri) {
  console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
  console.error('Please create a .env file with MONGODB_URI or MONGO_URI');
  process.exit(1);
}

// If a DB name is provided separately and the URI does not already contain a DB path, append it.
let MONGO_URI = rawMongoUri;
if (mongoDbName) {
  // Remove any leading/trailing slashes from the database name
  const cleanDbName = mongoDbName.replace(/^\/+|\/+$/g, '');
  
  // Determine if the URI already has a database name portion (i.e. after the host and before query '?')
  // We'll check for '/<dbname>' before any query string.
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  // If there is no DB portion (no slash followed by non-empty segment after the host), append one.
  // A simple heuristic: if beforeQuery ends with '/' or contains '/@' (unlikely), treat as missing.
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${cleanDbName}`;
    } else {
      MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${cleanDbName}${rawMongoUri.slice(idx)}`;
    }
  }
}

// Ensure the URI doesn't have double slashes in the database name portion
MONGO_URI = MONGO_URI.replace(/([^:]\/)\/+/g, '$1');

/**
 * Create category record for an event
 * @param {Object} event - Event document
 * @param {Object} requestData - EventRequest document (optional)
 * @returns {Promise<Object|null>} Created category record or null
 */
async function createCategoryRecord(event, requestData = null) {
  const eventId = event.Event_ID;
  const category = String(event.Category || '').trim();

  if (!category || category === 'Unknown' || category === '') {
    return null;
  }

  try {
    // Check if category record already exists
    let existingRecord = null;
    if (category === 'BloodDrive' || category.toLowerCase().includes('blood')) {
      existingRecord = await BloodDrive.findOne({ BloodDrive_ID: eventId });
      if (existingRecord) {
        return { type: 'BloodDrive', record: existingRecord, action: 'exists' };
      }

      // Create BloodDrive record
      const targetDonation = requestData?.Target_Donation;
      if (targetDonation === undefined || targetDonation === null) {
        console.warn(`  ⚠️  Cannot create BloodDrive record: Target_Donation is required but missing`);
        return { type: 'BloodDrive', record: null, action: 'skipped', reason: 'missing Target_Donation' };
      }

      const bloodDrive = new BloodDrive({
        BloodDrive_ID: eventId,
        Target_Donation: Number(targetDonation),
        VenueType: requestData?.VenueType || undefined
      });

      await bloodDrive.save();
      return { type: 'BloodDrive', record: bloodDrive, action: 'created' };

    } else if (category === 'Training' || category.toLowerCase().includes('train')) {
      existingRecord = await Training.findOne({ Training_ID: eventId });
      if (existingRecord) {
        return { type: 'Training', record: existingRecord, action: 'exists' };
      }

      // Create Training record
      const maxParticipants = requestData?.MaxParticipants;
      if (maxParticipants === undefined || maxParticipants === null) {
        console.warn(`  ⚠️  Cannot create Training record: MaxParticipants is required but missing`);
        return { type: 'Training', record: null, action: 'skipped', reason: 'missing MaxParticipants' };
      }

      const training = new Training({
        Training_ID: eventId,
        TrainingType: requestData?.TrainingType || undefined,
        MaxParticipants: Number(maxParticipants)
      });

      await training.save();
      return { type: 'Training', record: training, action: 'created' };

    } else if (category === 'Advocacy' || category.toLowerCase().includes('advoc')) {
      existingRecord = await Advocacy.findOne({ Advocacy_ID: eventId });
      if (existingRecord) {
        return { type: 'Advocacy', record: existingRecord, action: 'exists' };
      }

      // Create Advocacy record
      const topic = requestData?.Topic;
      const targetAudience = requestData?.TargetAudience;

      if (!topic && !targetAudience) {
        console.warn(`  ⚠️  Cannot create Advocacy record: Topic or TargetAudience is required but both are missing`);
        return { type: 'Advocacy', record: null, action: 'skipped', reason: 'missing Topic and TargetAudience' };
      }

      const expectedSizeRaw = requestData?.ExpectedAudienceSize;
      const expectedSize = expectedSizeRaw !== undefined && expectedSizeRaw !== null && expectedSizeRaw !== ''
        ? Number(expectedSizeRaw)
        : undefined;

      const advocacy = new Advocacy({
        Advocacy_ID: eventId,
        Topic: topic || undefined,
        TargetAudience: targetAudience || undefined,
        ExpectedAudienceSize: expectedSize,
        PartnerOrganization: requestData?.PartnerOrganization || undefined
      });

      await advocacy.save();
      return { type: 'Advocacy', record: advocacy, action: 'created' };

    } else {
      console.warn(`  ⚠️  Unknown category type: ${category}`);
      return { type: category, record: null, action: 'skipped', reason: 'unknown category type' };
    }
  } catch (error) {
    console.error(`  ❌ Error creating ${category} record for Event ${eventId}:`, error.message);
    return { type: category, record: null, action: 'error', error: error.message };
  }
}

/**
 * Main backfill function
 */
async function backfillEventCategoryData() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    console.log(`   URI: ${MONGO_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials
    console.log(`   Database: ${mongoose.connection.name || 'default'}\n`);
    
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log(`✅ Connected to MongoDB`);
    console.log(`   Database: ${mongoose.connection.db.databaseName}\n`);

    // Find all approved events with a category
    console.log('📋 Finding approved events with categories...');
    const events = await Event.find({
      Status: 'Approved',
      Category: { $exists: true, $ne: null, $ne: '' }
    }).lean();

    console.log(`✅ Found ${events.length} approved events with categories\n`);

    if (events.length === 0) {
      console.log('No events to process. Exiting.');
      await mongoose.disconnect();
      return;
    }

    // Statistics
    const stats = {
      total: events.length,
      alreadyExists: 0,
      created: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    // Process each event
    console.log('🔄 Processing events...\n');
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const eventId = event.Event_ID;
      const category = event.Category;

      console.log(`[${i + 1}/${events.length}] Event: ${eventId}`);
      console.log(`  Title: ${event.Event_Title}`);
      console.log(`  Category: ${category}`);

      // Check if category record exists
      let categoryExists = false;
      if (category === 'BloodDrive' || String(category).toLowerCase().includes('blood')) {
        categoryExists = !!(await BloodDrive.findOne({ BloodDrive_ID: eventId }).lean());
      } else if (category === 'Training' || String(category).toLowerCase().includes('train')) {
        categoryExists = !!(await Training.findOne({ Training_ID: eventId }).lean());
      } else if (category === 'Advocacy' || String(category).toLowerCase().includes('advoc')) {
        categoryExists = !!(await Advocacy.findOne({ Advocacy_ID: eventId }).lean());
      }

      if (categoryExists) {
        console.log(`  ✅ Category record already exists\n`);
        stats.alreadyExists++;
        stats.details.push({
          eventId,
          category,
          action: 'exists',
          status: 'ok'
        });
        continue;
      }

      // Try to find original EventRequest to get category data
      console.log(`  🔍 Looking for original EventRequest...`);
      const request = await EventRequest.findOne({ Event_ID: eventId }).lean();

      if (!request) {
        console.log(`  ⚠️  No EventRequest found for Event ${eventId}`);
        console.log(`  ⚠️  Cannot create category record without source data\n`);
        stats.skipped++;
        stats.details.push({
          eventId,
          category,
          action: 'skipped',
          reason: 'no EventRequest found',
          status: 'warning'
        });
        continue;
      }

      console.log(`  ✅ Found EventRequest: ${request.Request_ID}`);

      // Create category record
      const result = await createCategoryRecord(event, request);

      if (result.action === 'created') {
        console.log(`  ✅ Created ${result.type} record\n`);
        stats.created++;
        stats.details.push({
          eventId,
          category,
          action: 'created',
          status: 'success'
        });
      } else if (result.action === 'exists') {
        console.log(`  ✅ Category record already exists\n`);
        stats.alreadyExists++;
        stats.details.push({
          eventId,
          category,
          action: 'exists',
          status: 'ok'
        });
      } else if (result.action === 'skipped') {
        console.log(`  ⚠️  Skipped: ${result.reason || 'unknown reason'}\n`);
        stats.skipped++;
        stats.details.push({
          eventId,
          category,
          action: 'skipped',
          reason: result.reason,
          status: 'warning'
        });
      } else if (result.action === 'error') {
        console.log(`  ❌ Error: ${result.error || 'unknown error'}\n`);
        stats.errors++;
        stats.details.push({
          eventId,
          category,
          action: 'error',
          error: result.error,
          status: 'error'
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total events processed: ${stats.total}`);
    console.log(`✅ Category records already exist: ${stats.alreadyExists}`);
    console.log(`✨ Category records created: ${stats.created}`);
    console.log(`⚠️  Skipped (missing data): ${stats.skipped}`);
    console.log(`❌ Errors: ${stats.errors}`);
    console.log('='.repeat(60));

    // Print details for skipped/error events
    const skippedOrErrors = stats.details.filter(d => d.status === 'warning' || d.status === 'error');
    if (skippedOrErrors.length > 0) {
      console.log('\n⚠️  Events that were skipped or had errors:');
      skippedOrErrors.forEach(detail => {
        console.log(`  - ${detail.eventId} (${detail.category}): ${detail.action} - ${detail.reason || detail.error || 'unknown'}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✅ Backfill completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Fatal error during backfill:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the backfill
backfillEventCategoryData();

