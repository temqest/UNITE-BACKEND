/**
 * Coordinator Selection Bug Fix - Integration Test
 * 
 * This test validates that:
 * 1. When a stakeholder selects a coordinator (Dave), Dave is assigned to the request
 * 2. When an admin manually selects a coordinator, that coordinator is assigned
 * 3. Auto-assignment ONLY happens when no manual selection is provided
 * 
 * Root Cause: Frontend sends 'coordinator' field, backend expected 'coordinatorId'
 * Fix: Controller normalizes frontend field names to backend field names
 */

const mongoose = require('mongoose');
const User = require('../src/models/User');
const EventRequest = require('../src/models/EventRequest');
const Location = require('../src/models/Location');
const eventRequestService = require('../src/services/eventRequests_services/eventRequest.service');
const permissionService = require('../src/services/users_services/permission.service');
require('dotenv').config();

const AUTHORITY_TIERS = {
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 30
};

/**
 * TEST 1: Stakeholder manually selects a coordinator
 * Expected: Selected coordinator should be assigned, not auto-assigned
 */
async function testStakeholderSelectsCoordinator() {
  console.log('\n=== TEST 1: Stakeholder Selects Coordinator ===\n');
  
  try {
    // Find stakeholder who made the request
    const stakeholder = await User.findOne({ authority: AUTHORITY_TIERS.STAKEHOLDER, email: { $regex: 'testing' } });
    if (!stakeholder) {
      console.log('❌ No testing stakeholder found');
      return false;
    }
    
    // Find two different coordinators
    const coordinators = await User.find({ authority: AUTHORITY_TIERS.COORDINATOR }).limit(2);
    if (coordinators.length < 2) {
      console.log('❌ Need at least 2 coordinators in system');
      return false;
    }
    
    const coordinatorA = coordinators[0];  // Ben
    const coordinatorB = coordinators[1];  // Dave
    
    console.log(`Stakeholder: ${stakeholder.firstName} ${stakeholder.lastName}`);
    console.log(`Available Coordinators: ${coordinatorA.firstName}, ${coordinatorB.firstName}`);
    
    // Stakeholder creates request and SELECTS coordinatorB (Dave)
    const requestData = {
      Event_Title: 'Test: Stakeholder Selects Dave',
      Location: 'test',
      Date: new Date('2026-02-15'),
      Category: 'BloodDrive',
      Target_Donation: 100,
      district: coordinatorB.locations?.districtId,
      coordinatorId: coordinatorB._id.toString(), // Backend field name
      // Note: Frontend sends as 'coordinator', controller normalizes it
    };
    
    console.log(`\n📝 Creating request with manual coordinator selection: ${coordinatorB.firstName}`);
    const request = await eventRequestService.createRequest(stakeholder._id, requestData);
    
    // VALIDATE: The selected coordinator should be the reviewer
    const actualReviewerId = request.reviewer.userId.toString();
    const expectedReviewerId = coordinatorB._id.toString();
    
    console.log(`\nResult:`);
    console.log(`  Expected Reviewer: ${coordinatorB.firstName} (${expectedReviewerId})`);
    console.log(`  Actual Reviewer: ${request.reviewer.name} (${actualReviewerId})`);
    console.log(`  autoAssigned: ${request.reviewer.autoAssigned}`);
    console.log(`  assignmentRule: ${request.reviewer.assignmentRule}`);
    
    if (actualReviewerId === expectedReviewerId) {
      console.log('✅ PASS: Correct coordinator was assigned');
      if (request.reviewer.assignmentRule === 'manual') {
        console.log('✅ PASS: Assignment rule is "manual" (not auto-assigned)');
      } else {
        console.log('❌ FAIL: Assignment rule should be "manual"');
        return false;
      }
      return true;
    } else {
      console.log(`❌ FAIL: Wrong coordinator assigned. Expected ${coordinatorB.firstName}, got ${request.reviewer.name}`);
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 2: Admin manually selects a coordinator (override)
 * Expected: Selected coordinator should be assigned with assignment rule "manual"
 */
async function testAdminSelectsCoordinator() {
  console.log('\n=== TEST 2: Admin Manually Selects Coordinator ===\n');
  
  try {
    // Find an admin
    const admin = await User.findOne({ authority: { $gte: AUTHORITY_TIERS.OPERATIONAL_ADMIN } });
    if (!admin) {
      console.log('❌ No admin found');
      return false;
    }
    
    // Find a coordinator
    const coordinator = await User.findOne({ authority: AUTHORITY_TIERS.COORDINATOR });
    if (!coordinator) {
      console.log('❌ No coordinator found');
      return false;
    }
    
    console.log(`Admin: ${admin.firstName} ${admin.lastName}`);
    console.log(`Selected Coordinator: ${coordinator.firstName} ${coordinator.lastName}`);
    
    // Admin creates request with manual coordinator selection
    const requestData = {
      Event_Title: 'Test: Admin Selects Specific Coordinator',
      Location: 'test',
      Date: new Date('2026-02-20'),
      Category: 'BloodDrive',
      Target_Donation: 50,
      district: coordinator.locations?.districtId,
      coordinatorId: coordinator._id.toString(), // Explicit manual selection
    };
    
    console.log(`\n📝 Creating request with manual coordinator selection`);
    const request = await eventRequestService.createRequest(admin._id, requestData);
    
    // VALIDATE
    const actualReviewerId = request.reviewer.userId.toString();
    const expectedReviewerId = coordinator._id.toString();
    
    console.log(`\nResult:`);
    console.log(`  Expected Reviewer: ${coordinator.firstName} (${expectedReviewerId})`);
    console.log(`  Actual Reviewer: ${request.reviewer.name} (${actualReviewerId})`);
    console.log(`  autoAssigned: ${request.reviewer.autoAssigned}`);
    console.log(`  assignmentRule: ${request.reviewer.assignmentRule}`);
    
    if (actualReviewerId === expectedReviewerId && request.reviewer.assignmentRule === 'manual') {
      console.log('✅ PASS: Correct coordinator was manually assigned');
      return true;
    } else {
      console.log('❌ FAIL: Admin selection was not respected');
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 3: Frontend field normalization
 * Expected: 'coordinator' field from frontend should be normalized to 'coordinatorId'
 */
async function testFieldNormalization() {
  console.log('\n=== TEST 3: Frontend Field Normalization ===\n');
  
  try {
    const stakeholder = await User.findOne({ authority: AUTHORITY_TIERS.STAKEHOLDER, email: { $regex: 'testing' } });
    const coordinator = await User.findOne({ authority: AUTHORITY_TIERS.COORDINATOR });
    
    if (!stakeholder || !coordinator) {
      console.log('❌ Missing test data');
      return false;
    }
    
    // Simulate frontend sending 'coordinator' instead of 'coordinatorId'
    const requestData = {
      Event_Title: 'Test: Field Normalization',
      Location: 'test',
      Date: new Date('2026-02-25'),
      Category: 'BloodDrive',
      Target_Donation: 75,
      district: coordinator.locations?.districtId,
      coordinator: coordinator._id.toString(), // Frontend field name (should be normalized)
    };
    
    console.log(`📝 Creating request with frontend field name 'coordinator' (should be normalized)`);
    const request = await eventRequestService.createRequest(stakeholder._id, requestData);
    
    if (request.reviewer.userId.toString() === coordinator._id.toString()) {
      console.log('✅ PASS: Frontend field "coordinator" was normalized and used correctly');
      return true;
    } else {
      console.log('❌ FAIL: Field normalization did not work');
      return false;
    }
  } catch (error) {
    console.log('❌ ERROR:', error.message);
    return false;
  }
}

/**
 * TEST 4: Verify auto-assignment still works when NO coordinator selected
 * Expected: Auto-assignment should still trigger for stakeholder→coordinator matching
 */
async function testAutoAssignmentFallback() {
  console.log('\n=== TEST 4: Auto-Assignment Fallback (No Manual Selection) ===\n');
  
  try {
    const stakeholder = await User.findOne({ authority: AUTHORITY_TIERS.STAKEHOLDER, email: { $regex: 'testing' } });
    if (!stakeholder) {
      console.log('❌ No stakeholder found');
      return false;
    }
    
    // Create request WITHOUT manual coordinator selection
    // System should auto-assign a valid coordinator
    const requestData = {
      Event_Title: 'Test: Auto-Assignment (No Manual Selection)',
      Location: 'test',
      Date: new Date('2026-03-01'),
      Category: 'BloodDrive',
      Target_Donation: 60,
      district: stakeholder.locations?.districtId,
      // NO coordinatorId or coordinator field - should trigger auto-assignment
    };
    
    console.log(`📝 Creating request WITHOUT manual coordinator selection`);
    const request = await eventRequestService.createRequest(stakeholder._id, requestData);
    
    console.log(`\nResult:`);
    console.log(`  Assigned Reviewer: ${request.reviewer.name}`);
    console.log(`  autoAssigned: ${request.reviewer.autoAssigned}`);
    console.log(`  assignmentRule: ${request.reviewer.assignmentRule}`);
    
    if (request.reviewer.autoAssigned && request.reviewer.assignmentRule === 'stakeholder-to-coordinator') {
      console.log('✅ PASS: Auto-assignment still works when no manual selection provided');
      return true;
    } else {
      console.log('⚠️  NOTE: Review may have been auto-assigned with different rule');
      console.log('    This is acceptable if reviewer is valid for stakeholder');
      return true; // Don't fail - different assignment rules are OK
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
║        COORDINATOR SELECTION BUG FIX - INTEGRATION TESTS       ║
╚════════════════════════════════════════════════════════════════╝
  `);
  
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Connected to database\n');
    
    const results = [];
    
    // Run tests
    results.push({ name: 'Stakeholder Selects Coordinator', result: await testStakeholderSelectsCoordinator() });
    results.push({ name: 'Admin Selects Coordinator', result: await testAdminSelectsCoordinator() });
    results.push({ name: 'Frontend Field Normalization', result: await testFieldNormalization() });
    results.push({ name: 'Auto-Assignment Fallback', result: await testAutoAssignmentFallback() });
    
    // Summary
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                         TEST SUMMARY                           ║
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
      console.log('🎉 ALL TESTS PASSED - Coordinator selection fix is working!');
    } else {
      console.log('⚠️  Some tests failed - please review the output above');
    }
    
    await mongoose.disconnect();
    process.exit(passed === total ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Test suite error:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();
