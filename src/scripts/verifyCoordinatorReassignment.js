/**
 * Verification Script for Coordinator Reassignment
 * 
 * Verifies that the reassignment from Ben to David was successful
 * and provides detailed reports
 * 
 * USAGE:
 *   node src/scripts/verifyCoordinatorReassignment.js
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

// Setup logging
const logDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportFile = path.join(logDir, `verify-reassignment-${timestamp}.log`);

const log = (message, data = '') => {
  const logMessage = `${message}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(logMessage);
  fs.appendFileSync(reportFile, logMessage + '\n');
};

const logSection = (section) => {
  const divider = '═'.repeat(70);
  console.log(divider);
  console.log(section);
  console.log(divider);
  fs.appendFileSync(reportFile, divider + '\n' + section + '\n' + divider + '\n');
};

/**
 * Find user by email
 */
async function findUserByEmail(email) {
  return await User.findOne({ email: email.toLowerCase() }).lean();
}

/**
 * Find district
 */
async function findDistrict() {
  const province = await Location.findOne({
    name: { $regex: 'Camarines Sur', $options: 'i' },
    type: 'Province'
  }).lean();

  if (!province) return null;

  return await Location.findOne({
    name: { $regex: 'District 2', $options: 'i' },
    parent: province._id,
    type: 'District'
  }).lean();
}

/**
 * Get municipalities in district
 */
async function getMunicipalitiesInDistrict(districtId) {
  const municipalities = await Location.find({
    type: 'Municipality',
    parent: districtId
  }).lean();

  return municipalities.map(m => m._id);
}

/**
 * Main verification
 */
async function verify() {
  try {
    logSection('🔍 COORDINATOR REASSIGNMENT VERIFICATION');

    // Connect to database
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    log('✅ Connected to database');

    logSection('👤 USER INFORMATION');

    // Get David
    const david = await findUserByEmail('davidjaque@ymail.com');
    if (!david) {
      log('❌ David not found');
      process.exit(1);
    }
    log(`✅ David Found: ${david.firstName} ${david.lastName}`);
    log(`   Email: ${david.email}`);
    log(`   ID: ${david._id}`);
    log(`   Authority: ${david.authority}`);

    // Get Ben
    let ben = null;
    const possibleEmails = [
      'ben@unite.com',
      'ben@unitehealth.tech',
      'ben.coordinator@unite.com',
      'coordinator.ben@unite.com'
    ];

    for (const email of possibleEmails) {
      ben = await findUserByEmail(email);
      if (ben) break;
    }

    if (ben) {
      log(`\n✅ Ben Found: ${ben.firstName} ${ben.lastName}`);
      log(`   Email: ${ben.email}`);
      log(`   ID: ${ben._id}`);
      log(`   Authority: ${ben.authority}`);
    } else {
      log('\n⚠️  Ben not found in database');
    }

    logSection('📍 LOCATION INFORMATION');

    // Get district
    const district = await findDistrict();
    if (!district) {
      log('❌ District 2, Camarines Sur not found');
      process.exit(1);
    }
    log(`✅ District: ${district.name}`);

    const municipalities = await getMunicipalitiesInDistrict(district._id);
    log(`✅ Municipalities in district: ${municipalities.length}`);

    logSection('📊 CURRENT ASSIGNMENT STATS');

    // Count by David
    const requestsByDavid = await EventRequest.countDocuments({
      'reviewer.userId': david._id,
      municipalityId: { $in: municipalities }
    });

    const eventsByDavid = await Event.countDocuments({
      coordinator_id: david._id,
      municipalityId: { $in: municipalities }
    });

    log(`Event Requests assigned to David: ${requestsByDavid}`);
    log(`Events assigned to David: ${eventsByDavid}`);
    log(`Total assigned to David: ${requestsByDavid + eventsByDavid}`);

    // Count by Ben (if he exists)
    if (ben) {
      const requestsByBen = await EventRequest.countDocuments({
        'reviewer.userId': ben._id,
        municipalityId: { $in: municipalities }
      });

      const eventsByBen = await Event.countDocuments({
        coordinator_id: ben._id,
        municipalityId: { $in: municipalities }
      });

      log(`\nEvent Requests still assigned to Ben: ${requestsByBen}`);
      log(`Events still assigned to Ben: ${eventsByBen}`);
      log(`Total still assigned to Ben: ${requestsByBen + eventsByBen}`);

      if (requestsByBen === 0 && eventsByBen === 0) {
        log(`\n✅ SUCCESS: All documents have been reassigned from Ben to David!`);
      } else {
        log(`\n⚠️  WARNING: Some documents are still assigned to Ben`);
      }
    }

    logSection('📋 SAMPLE DOCUMENTS ASSIGNED TO DAVID');

    // Sample requests assigned to David
    const sampleRequests = await EventRequest.find({
      'reviewer.userId': david._id,
      municipalityId: { $in: municipalities }
    })
      .select('Request_ID status reviewer.name reviewer.overriddenAt')
      .limit(10)
      .lean();

    log(`Recent Event Requests (showing ${sampleRequests.length}):`);
    sampleRequests.forEach((req, idx) => {
      log(`  ${idx + 1}. ${req.Request_ID}`);
      log(`     Status: ${req.status}`);
      log(`     Reviewer: ${req.reviewer?.name}`);
      if (req.reviewer?.overriddenAt) {
        log(`     Last Override: ${new Date(req.reviewer.overriddenAt).toISOString()}`);
      }
    });

    // Sample events assigned to David
    const sampleEvents = await Event.find({
      coordinator_id: david._id,
      municipalityId: { $in: municipalities }
    })
      .select('Event_ID Status coordinator_id')
      .limit(10)
      .lean();

    log(`\nRecent Events (showing ${sampleEvents.length}):`);
    sampleEvents.forEach((evt, idx) => {
      log(`  ${idx + 1}. ${evt.Event_ID}`);
      log(`     Status: ${evt.Status}`);
      log(`     Coordinator ID: ${evt.coordinator_id}`);
    });

    logSection('✅ VERIFICATION COMPLETE');

    log(`Report saved to: ${reportFile}`);
    log(`\nVerification Status:`);
    log(`  - David exists: ✅`);
    log(`  - District 2, Camarines Sur found: ✅`);
    log(`  - Documents assigned to David: ${requestsByDavid + eventsByDavid}`);
    if (ben) {
      const totalBen = await EventRequest.countDocuments({
        'reviewer.userId': ben._id,
        municipalityId: { $in: municipalities }
      }) + await Event.countDocuments({
        coordinator_id: ben._id,
        municipalityId: { $in: municipalities }
      });
      log(`  - Documents still with Ben: ${totalBen}`);
    }

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    log(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

verify();
