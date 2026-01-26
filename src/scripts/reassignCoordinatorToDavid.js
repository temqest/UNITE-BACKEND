/**
 * Emergency Coordinator Reassignment Script
 * 
 * PURPOSE:
 * Reassign all Event Requests and Events from Ben to David
 * for District 2, Camarines Sur
 * 
 * USAGE:
 *   Dry run (preview changes):
 *     node src/scripts/reassignCoordinatorToD avid.js --dry-run
 *   
 *   Live run (apply changes):
 *     node src/scripts/reassignCoordinatorToD avid.js
 * 
 * SAFETY:
 * - Always run with --dry-run first to see what will be changed
 * - Logs audit trail to file and console
 * - Includes confirmation prompt before live run
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const User = require('../models/users_models/user.model');
const EventRequest = require('../models/eventRequests_models/eventRequest.model');
const Event = require('../models/events_models/event.model');
const Location = require('../models/utility_models/location.model');
const CoverageArea = require('../models/utility_models/coverageArea.model');

// Parse command line arguments
const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');
const skipPrompt = process.argv.includes('--skip-prompt');

// Extract email argument: --email=user@example.com
let overrideEmail = null;
const emailArg = process.argv.find(arg => arg.startsWith('--email='));
if (emailArg) {
  overrideEmail = emailArg.split('=')[1];
}

// Setup logging
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `reassign-coordinator-${timestamp}.log`);

const log = (message, data = '') => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  
  console.log(logMessage);
  fs.appendFileSync(logFile, logMessage + '\n');
};

const logSection = (section) => {
  const divider = '═'.repeat(70);
  log(divider);
  log(section);
  log(divider);
};

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() }).lean();
    return user;
  } catch (error) {
    log(`ERROR: Failed to find user by email ${email}:`, error.message);
    return null;
  }
}

/**
 * Find district by name and province
 */
async function findDistrict(districtName, provinceName) {
  try {
    // First find the province
    const province = await Location.findOne({ 
      name: provinceName,
      type: 'province'
    }).lean();

    if (!province) {
      log(`WARNING: Province "${provinceName}" not found`);
      return null;
    }

    // Then find the district that belongs to this province
    const district = await Location.findOne({
      name: districtName,
      type: 'district',
      parent: province._id
    }).lean();

    if (!district) {
      log(`WARNING: District "${districtName}" under "${provinceName}" not found`);
      return null;
    }

    return district;
  } catch (error) {
    log(`ERROR: Failed to find district:`, error.message);
    return null;
  }
}

/**
 * Find all municipalities under a district
 */
async function getMunicipalitiesInDistrict(districtId) {
  try {
    const municipalities = await Location.find({
      type: 'municipality',
      parent: districtId
    }).lean();

    return municipalities.map(m => m._id);
  } catch (error) {
    log(`ERROR: Failed to get municipalities in district:`, error.message);
    return [];
  }
}

/**
 * Count documents to be updated
 */
async function countDocumentsToUpdate(municipalityIds, coordinatorId) {
  try {
    // Count EventRequests with Ben as reviewer
    const eventRequestCount = await EventRequest.countDocuments({
      $or: [
        { 'reviewer.userId': coordinatorId },
        { 'reviewer.userId': { $exists: true }, municipalityId: { $in: municipalityIds } }
      ]
    });

    // Count Events with Ben as coordinator
    const eventCount = await Event.countDocuments({
      coordinator_id: coordinatorId,
      municipalityId: { $in: municipalityIds }
    });

    return { eventRequestCount, eventCount };
  } catch (error) {
    log(`ERROR: Failed to count documents:`, error.message);
    return { eventRequestCount: 0, eventCount: 0 };
  }
}

/**
 * Find all event requests in municipalities with Ben as reviewer
 */
async function findEventRequestsByCoordinator(coordinatorId, municipalityIds) {
  try {
    const requests = await EventRequest.find({
      'reviewer.userId': coordinatorId,
      municipalityId: { $in: municipalityIds }
    }).select('_id Request_ID reviewer status').lean();

    return requests;
  } catch (error) {
    log(`ERROR: Failed to find event requests:`, error.message);
    return [];
  }
}

/**
 * Find all events in municipalities with Ben as coordinator
 */
async function findEventsByCoordinator(coordinatorId, municipalityIds) {
  try {
    const events = await Event.find({
      coordinator_id: coordinatorId,
      municipalityId: { $in: municipalityIds }
    }).select('_id Event_ID coordinator_id Status').lean();

    return events;
  } catch (error) {
    log(`ERROR: Failed to find events:`, error.message);
    return [];
  }
}

/**
 * Main reassignment function
 */
async function reassignCoordinators() {
  let connection;

  try {
    logSection('🔄 COORDINATOR REASSIGNMENT SCRIPT - STARTING');
    
    log(`Mode: ${isDryRun ? 'DRY RUN (no changes)' : 'LIVE RUN (changes will be applied)'}`);
    log(`Timestamp: ${new Date().toISOString()}`);

    // Connect to MongoDB
    log('\n📊 Connecting to MongoDB...');
    const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    const mongoDbName = process.env.MONGO_DB_NAME;

    if (!rawMongoUri) {
      throw new Error('MONGODB_URI is not defined in environment');
    }

    // Append database name to URI if not already present
    let mongoUri = rawMongoUri;
    if (mongoDbName) {
      const idx = rawMongoUri.indexOf('?');
      const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
      const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
      if (!hasDb) {
        if (idx === -1) {
          mongoUri = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
        } else {
          mongoUri = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
        }
      }
    }

    connection = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 3
    });

    // Extract database name from URI
    const dbNameMatch = mongoUri.match(/\/([^/?]+)(?:[/?]|$)/);
    const dbName = dbNameMatch ? dbNameMatch[1] : 'unknown';
    log(`✅ Connected to MongoDB`, { database: dbName, uri: mongoUri.substring(0, 50) + '...' });

    logSection('👤 FINDING USERS');

    // Find David
    log('Searching for David (davidjaque@ymail.com)...');
    const david = await findUserByEmail('davidjaque@ymail.com');
    if (!david) {
      throw new Error('David not found in database. Email: davidjaque@ymail.com');
    }
    log(`✅ Found David:`, {
      _id: david._id.toString(),
      name: `${david.firstName} ${david.lastName}`,
      authority: david.authority
    });

    // Find Ben (to know who to replace)
    // Note: Adjust this if Ben's email is different
    log(`\nSearching for Ben (ben@unite.com or similar)${overrideEmail ? ` [OVERRIDE: ${overrideEmail}]` : ''}...`);
    let ben = null;
    const possibleEmails = overrideEmail 
      ? [overrideEmail]  // Only search for the override email if provided
      : [
        'ben@unite.com',
        'ben@unitehealth.tech',
        'ben.coordinator@unite.com',
        'coordinator.ben@unite.com'
      ];

    for (const email of possibleEmails) {
      ben = await findUserByEmail(email);
      if (ben) {
        log(`✅ Found Ben at email: ${email}`, {
          _id: ben._id.toString(),
          name: `${ben.firstName} ${ben.lastName}`,
          authority: ben.authority
        });
        break;
      }
    }

    if (!ben) {
      log('⚠️  WARNING: Ben not found. Will search for all coordinators in District 2, Camarines Sur');
      log('Note: You may need to manually provide Ben\'s email or user ID');
    }

    logSection('📍 FINDING GEOGRAPHY');

    // Find Camarines Sur province
    log('Searching for Camarines Sur province...');
    const province = await Location.findOne({
      name: { $regex: 'Camarines Sur', $options: 'i' },
      type: 'province'
    }).lean();

    if (!province) {
      // Show available provinces for debugging
      const provinces = await Location.find({ type: 'province' }, { name: 1 }).lean();
      log('Available provinces:', provinces.map(p => p.name).join(', '));
      throw new Error('Camarines Sur province not found');
    }
    log(`✅ Found Camarines Sur:`, { _id: province._id.toString() });

    // Find District 2 using CoverageArea
    log('Searching for District II in Camarines Sur via CoverageArea...');
    const coverageArea = await CoverageArea.findOne({
      name: { $regex: 'Camarines Sur.*District II', $options: 'i' }
    }).lean();

    if (!coverageArea) {
      // Show available coverage areas for debugging
      const areas = await CoverageArea.find({ name: { $regex: 'Camarines Sur', $options: 'i' } }, { name: 1 }).lean();
      log('Available coverage areas for Camarines Sur:', areas.map(a => a.name).join(', '));
      throw new Error('District II coverage area for Camarines Sur not found');
    }
    log(`✅ Found District II:`, { _id: coverageArea._id.toString(), name: coverageArea.name });

    // Get all geographic units (locations) in this coverage area
    const geographicUnitIds = coverageArea.geographicUnits || [];
    log(`✅ Found ${geographicUnitIds.length} geographic units in coverage area`);

    logSection('📋 DOCUMENT COUNT');

    // Count documents to update
    log('Counting documents to update...');
    
    if (ben) {
      const counts = await countDocumentsToUpdate(geographicUnitIds, ben._id);
      log(`Event Requests with Ben as reviewer: ${counts.eventRequestCount}`);
      log(`Events with Ben as coordinator: ${counts.eventCount}`);
      log(`Total documents to update: ${counts.eventRequestCount + counts.eventCount}`);
    } else {
      log('⚠️  Cannot count - Ben not found');
    }

    if (!ben) {
      log('\n❌ Cannot proceed without identifying the current coordinator (Ben)');
      log('Please provide Ben\'s email or user ID and run the script again');
      process.exit(1);
    }

    logSection('🔍 PREVIEW OF CHANGES');

    // Get sample requests to update
    const sampleRequests = await findEventRequestsByCoordinator(ben._id, geographicUnitIds);
    log(`Sample Event Requests (first 5):`);
    sampleRequests.slice(0, 5).forEach(req => {
      log(`  - ${req.Request_ID}: Status = ${req.status}`);
    });

    const sampleEvents = await findEventsByCoordinator(ben._id, geographicUnitIds);
    log(`\nSample Events (first 5):`);
    sampleEvents.slice(0, 5).forEach(evt => {
      log(`  - ${evt.Event_ID}: Status = ${evt.Status}`);
    });

    if (isDryRun) {
      logSection('✅ DRY RUN COMPLETE');
      log('No changes were made. Review the preview above and run without --dry-run to apply changes');
      log(`Log file: ${logFile}`);
      process.exit(0);
    }

    logSection('⚠️  CONFIRMATION REQUIRED');

    if (!skipPrompt) {
      log('\n⚠️  YOU ARE ABOUT TO MAKE LIVE CHANGES TO THE DATABASE');
      log(`Will reassign ${sampleRequests.length + sampleEvents.length} documents from Ben to David`);
      log('This action cannot be easily undone.');
      log('\nRun again with --skip-prompt to bypass this confirmation');
      
      // In a real scenario, this would prompt the user
      // For automation, we'll require --skip-prompt flag
      log('\n❌ Aborted. Use --skip-prompt flag to confirm');
      process.exit(1);
    }

    logSection('🚀 APPLYING CHANGES');

    let updatedRequests = 0;
    let updatedEvents = 0;

    // Update EventRequests
    log('\nUpdating Event Requests...');
    const requestUpdateResult = await EventRequest.updateMany(
      {
        'reviewer.userId': ben._id,
        municipalityId: { $in: geographicUnitIds }
      },
      {
        $set: {
          'reviewer.userId': david._id,
          'reviewer.name': `${david.firstName} ${david.lastName}`,
          'reviewer.overriddenAt': new Date(),
          'reviewer.overriddenBy': {
            userId: null,
            name: 'System (Emergency Reassignment)',
            roleSnapshot: 'Admin',
            authoritySnapshot: 99
          }
        }
      }
    );

    updatedRequests = requestUpdateResult.modifiedCount;
    log(`✅ Updated ${updatedRequests} Event Requests`);

    // Update Events
    log('\nUpdating Events...');
    const eventUpdateResult = await Event.updateMany(
      {
        coordinator_id: ben._id,
        municipalityId: { $in: geographicUnitIds }
      },
      {
        $set: {
          coordinator_id: david._id,
          'coordinator.userId': david._id,
          'coordinator.name': `${david.firstName} ${david.lastName}`,
          lastModified: new Date(),
          lastModifiedBy: 'System (Emergency Reassignment)'
        }
      }
    );

    updatedEvents = eventUpdateResult.modifiedCount;
    log(`✅ Updated ${updatedEvents} Events`);

    logSection('✅ REASSIGNMENT COMPLETE');

    log('Summary:', {
      eventRequestsUpdated: updatedRequests,
      eventsUpdated: updatedEvents,
      totalUpdated: updatedRequests + updatedEvents,
      fromCoordinator: `${ben.firstName} ${ben.lastName} (${ben.email})`,
      toCoordinator: `${david.firstName} ${david.lastName} (${david.email})`,
      location: `District 2, Camarines Sur`,
      municipalities: geographicUnitIds.length,
      timestamp: new Date().toISOString()
    });

    log(`\n📄 Full log saved to: ${logFile}`);
    log('✅ All changes applied successfully!');

  } catch (error) {
    log('\n❌ ERROR:', error.message);
    log('Stack:', error.stack);
    process.exit(1);
  } finally {
    if (connection) {
      await mongoose.connection.close();
      log('\n🔌 Database connection closed');
    }
  }
}

// Run the script
reassignCoordinators();
