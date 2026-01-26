/**
 * Broadcast Visibility Diagnostic Script
 * 
 * Checks if validCoordinators are being populated correctly
 */

const mongoose = require('mongoose');
const EventRequest = require('../src/models/eventRequests_models/eventRequest.model');
require('dotenv').config();

async function diagnose() {
  try {
    // Build connection URI with database name
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const connectionUri = dbName ? `${mongoUri}/${dbName}` : mongoUri;
    
    console.log(`Connecting to: ${connectionUri.replace(/:[^:]*@/, ':****@')}`);
    
    await mongoose.connect(connectionUri);
    console.log('✅ Connected to database\n');

    // 1. Check recent requests
    console.log('=== RECENT REQUESTS ===\n');
    const requests = await EventRequest.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('Request_ID Event_Title reviewer validCoordinators organizationType');

    if (requests.length === 0) {
      console.log('❌ No requests found in database');
      await mongoose.disconnect();
      return;
    }

    console.log(`Found ${requests.length} recent requests:\n`);

    requests.forEach((req, i) => {
      console.log(`${i + 1}. ${req.Request_ID} - ${req.Event_Title}`);
      console.log(`   Reviewer: ${req.reviewer?.name || 'N/A'}`);
      console.log(`   Org Type: ${req.organizationType || 'N/A'}`);
      console.log(`   Valid Coordinators: ${req.validCoordinators?.length || 0}`);
      
      if (req.validCoordinators && req.validCoordinators.length > 0) {
        req.validCoordinators.forEach(vc => {
          console.log(`      - ${vc.name}`);
        });
      }
      console.log();
    });

    // 2. Check a specific recent request in detail
    if (requests.length > 0) {
      console.log('\n=== DETAILED VIEW OF MOST RECENT REQUEST ===\n');
      const latestRequest = await EventRequest.findById(requests[0]._id)
        .populate('reviewer.userId', 'firstName lastName organizationType')
        .populate('validCoordinators.userId', 'firstName lastName organizationType authority');

      console.log(`Request ID: ${latestRequest.Request_ID}`);
      console.log(`Title: ${latestRequest.Event_Title}`);
      console.log(`Organization Type: ${latestRequest.organizationType}`);
      console.log(`District: ${latestRequest.district}`);
      console.log(`\nReviewer:`);
      console.log(`  Name: ${latestRequest.reviewer?.name}`);
      console.log(`  Org Type: ${latestRequest.reviewer?.userId?.organizationType}`);
      
      console.log(`\nValid Coordinators (${latestRequest.validCoordinators?.length || 0}):`);
      if (latestRequest.validCoordinators && latestRequest.validCoordinators.length > 0) {
        latestRequest.validCoordinators.forEach((vc, i) => {
          console.log(`  ${i + 1}. ${vc.name || vc.userId?.firstName}`);
          console.log(`     Org Type: ${vc.userId?.organizationType}`);
          console.log(`     Authority: ${vc.userId?.authority}`);
        });
      } else {
        console.log('  ⚠️  Empty - validCoordinators not populated!');
      }
    }

    // 3. Test getPendingRequests
    console.log('\n=== TESTING getPendingRequests ===\n');
    
    const User = require('../src/models/users_models/user.model');
    const coordinators = await User.find({ authority: { $gte: 60, $lt: 80 } }).limit(2);
    
    if (coordinators.length > 0) {
      for (const coord of coordinators) {
        const eventRequestService = require('../src/services/eventRequests_services/eventRequest.service');
        const pending = await eventRequestService.getPendingRequests(coord._id);
        console.log(`Coordinator: ${coord.firstName} ${coord.lastName}`);
        console.log(`  Pending requests visible: ${pending.length}`);
        if (pending.length > 0) {
          console.log(`  Last request: ${pending[0].Request_ID}`);
          console.log(`  Is valid coordinator: ${pending[0]._isValidCoordinator || false}`);
        }
        console.log();
      }
    } else {
      console.log('❌ No coordinators found to test');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

diagnose();
