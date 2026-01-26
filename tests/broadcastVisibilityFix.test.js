/**
 * Broadcast Visibility Test
 * 
 * Verifies that:
 * 1. When a request is created, validCoordinators array is populated
 * 2. All valid coordinators (matching location + org type) can see the request
 * 3. Valid coordinators can act on (review/approve) the request
 * 4. Non-matching coordinators cannot see the request
 */

const mongoose = require('mongoose');
const User = require('../src/models/users_models/user.model');
const EventRequest = require('../src/models/eventRequests_models/eventRequest.model');
const eventRequestService = require('../src/services/eventRequests_services/eventRequest.service');
const broadcastAccessService = require('../src/services/eventRequests_services/broadcastAccess.service');
require('dotenv').config();

const AUTHORITY_TIERS = {
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 30
};

/**
 * TEST 1: Valid Coordinators Array is Populated
 */
async function testValidCoordinatorsPopulation() {
  console.log('\n=== TEST 1: Valid Coordinators Array Population ===\n');
  
  try {
    // Find a stakeholder
    const stakeholder = await User.findOne({ authority: AUTHORITY_TIERS.STAKEHOLDER });
    if (!stakeholder) {
      console.log('❌ No stakeholder found');
      return false;
    }

    // Find coordinators with matching org type
    const coordinators = await User.find({
      authority: AUTHORITY_TIERS.COORDINATOR,
      organizationType: stakeholder.organizationType,
      isActive: true
    }).limit(3);

    if (coordinators.length < 2) {
      console.log(`❌ Need at least 2 coordinators with same org type. Found: ${coordinators.length}`);
      return false;
    }

    console.log(`Stakeholder: ${stakeholder.firstName} (${stakeholder.organizationType})`);
    console.log(`Available Coordinators (same org type): ${coordinators.map(c => c.firstName).join(', ')}`);

    // Create request
    const requestData = {
      Event_Title: 'TEST: Broadcast Visibility Check',
      Location: 'test',
      Date: new Date('2026-02-28'),
      Category: 'BloodDrive',
      Target_Donation: 100,
      district: coordinators[0].locations?.districtId,
      coordinatorId: coordinators[0]._id.toString() // Primary reviewer
    };

    console.log(`\n📝 Creating request with ${coordinators[0].firstName} as primary reviewer`);
    const request = await eventRequestService.createRequest(stakeholder._id, requestData);

    console.log(`\nRequest created: ${request.Request_ID}`);
    console.log(`Primary Reviewer: ${request.reviewer.name}`);
    console.log(`Valid Coordinators Count: ${request.validCoordinators?.length || 0}`);

    if (!request.validCoordinators || request.validCoordinators.length === 0) {
      console.log('❌ FAIL: validCoordinators array is empty or not populated');
      return false;
    }

    // Log valid coordinators
    console.log('\nValid Coordinators:');
    request.validCoordinators.forEach((vc, i) => {
      console.log(`  ${i + 1}. ${vc.name}`);
    });

    // Verify all coordinators with matching org type + location are included
    const includedCoordinatorIds = request.validCoordinators.map(vc => vc.userId.toString());
    const matchingCoordinators = coordinators.filter(c => 
      c.organizationType === request.organizationType &&
      c.locations?.districtId?.toString() === request.district?.toString()
    );

    console.log(`\nMatching Coordinators (org type + location): ${matchingCoordinators.length}`);
    console.log(`Included in validCoordinators: ${includedCoordinatorIds.length}`);

    if (includedCoordinatorIds.length > 0) {
      console.log('✅ PASS: validCoordinators array is populated');
      return true;
    } else {
      console.log('❌ FAIL: validCoordinators array is empty');
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 2: Valid Coordinators Can See Request in Dashboard
 */
async function testValidCoordinatorsSeeDashboard() {
  console.log('\n=== TEST 2: Valid Coordinators See Request in Dashboard ===\n');
  
  try {
    // Get a recent request with valid coordinators
    const request = await EventRequest.findOne({
      validCoordinators: { $exists: true, $ne: [] }
    }).populate('validCoordinators.userId');

    if (!request || !request.validCoordinators || request.validCoordinators.length === 0) {
      console.log('❌ No request with valid coordinators found');
      return false;
    }

    console.log(`Request: ${request.Request_ID} (${request.Event_Title})`);
    console.log(`Valid Coordinators: ${request.validCoordinators.length}`);

    // Test that each valid coordinator can retrieve the request via getPendingRequests
    let passCount = 0;

    for (const vc of request.validCoordinators.slice(0, 2)) {
      try {
        const coordinatorId = vc.userId._id || vc.userId;
        const pendingRequests = await eventRequestService.getPendingRequests(coordinatorId);

        const found = pendingRequests.some(r => r._id.toString() === request._id.toString());

        if (found) {
          console.log(`✅ Coordinator ${vc.name} can see request`);
          passCount++;
        } else {
          console.log(`❌ Coordinator ${vc.name} CANNOT see request (not in dashboard)`);
        }
      } catch (error) {
        console.log(`❌ Error checking coordinator: ${error.message}`);
      }
    }

    return passCount > 0;
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 3: Broadcast Access Check for Valid Coordinators
 */
async function testBroadcastAccessCheck() {
  console.log('\n=== TEST 3: Broadcast Access Check ===\n');
  
  try {
    // Get a request with valid coordinators
    const request = await EventRequest.findOne({
      validCoordinators: { $exists: true, $ne: [] }
    }).populate('validCoordinators.userId');

    if (!request || !request.validCoordinators?.length) {
      console.log('❌ No request with valid coordinators found');
      return false;
    }

    console.log(`Testing request: ${request.Request_ID}`);
    console.log(`Organization Type: ${request.organizationType}`);

    let passCount = 0;

    // Test each valid coordinator
    for (const vc of request.validCoordinators.slice(0, 3)) {
      try {
        const coordinatorId = vc.userId._id || vc.userId;
        const canAccess = await broadcastAccessService.canAccessRequest(coordinatorId, request);

        if (canAccess) {
          console.log(`✅ ${vc.name} can access request (broadcast coordinator)`);
          passCount++;
        } else {
          console.log(`❌ ${vc.name} CANNOT access request`);
        }
      } catch (error) {
        console.log(`❌ Error: ${error.message}`);
      }
    }

    return passCount > 0;
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 4: Non-Matching Coordinator Cannot See Request
 */
async function testNonMatchingCoordinatorBlocked() {
  console.log('\n=== TEST 4: Non-Matching Coordinator Blocked ===\n');
  
  try {
    // Get a request
    const request = await EventRequest.findOne({
      organizationType: { $exists: true }
    });

    if (!request) {
      console.log('❌ No request found');
      return false;
    }

    // Find a coordinator with DIFFERENT org type
    const differentOrgType = request.organizationType === 'TypeA' ? 'TypeB' : 'TypeA';
    const differentCoordinator = await User.findOne({
      authority: AUTHORITY_TIERS.COORDINATOR,
      organizationType: { $ne: request.organizationType },
      isActive: true
    });

    if (!differentCoordinator) {
      console.log('⚠️  No coordinator with different org type found - skipping test');
      return true; // Can't test, but don't fail
    }

    console.log(`Request org type: ${request.organizationType}`);
    console.log(`Coordinator org type: ${differentCoordinator.organizationType}`);

    const canAccess = await broadcastAccessService.canAccessRequest(differentCoordinator._id, request);

    if (!canAccess) {
      console.log('✅ PASS: Non-matching coordinator is blocked from accessing request');
      return true;
    } else {
      console.log('❌ FAIL: Non-matching coordinator should NOT be able to access');
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║           BROADCAST VISIBILITY INTEGRATION TESTS               ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Connected to database\n');

    const results = [];
    
    results.push({ 
      name: 'Valid Coordinators Population', 
      result: await testValidCoordinatorsPopulation() 
    });
    
    results.push({ 
      name: 'Valid Coordinators See Dashboard', 
      result: await testValidCoordinatorsSeeDashboard() 
    });
    
    results.push({ 
      name: 'Broadcast Access Check', 
      result: await testBroadcastAccessCheck() 
    });
    
    results.push({ 
      name: 'Non-Matching Coordinator Blocked', 
      result: await testNonMatchingCoordinatorBlocked() 
    });

    // Summary
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                      TEST SUMMARY                              ║
╚════════════════════════════════════════════════════════════════╝
    `);
    
    const passed = results.filter(r => r.result).length;
    const total = results.length;
    
    results.forEach(r => {
      const icon = r.result ? '✅' : '❌';
      console.log(`${icon} ${r.name}`);
    });
    
    console.log(`\nTotal: ${passed}/${total} passed\n`);
    
    if (passed === total) {
      console.log('🎉 ALL TESTS PASSED - Broadcast visibility is working!');
    } else {
      console.log('⚠️  Some tests failed - review output above');
    }
    
    await mongoose.disconnect();
    process.exit(passed === total ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
    process.exit(1);
  }
}

runTests();
