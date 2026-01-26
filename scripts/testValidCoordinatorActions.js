#!/usr/bin/env node

/**
 * Test Script: Verify Valid Coordinator Actions on APPROVED Events
 * 
 * Tests that non-assigned valid coordinators get proper actions (edit, reschedule, manage-staff)
 * on APPROVED events, matching the assigned coordinator's permissions.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { REQUEST_STATES } = require('../src/utils/eventRequests/requestConstants');
const actionValidatorService = require('../src/services/eventRequests_services/actionValidator.service');

let testResults = {
  totalApprovedRequests: 0,
  requestsWithValidCoordinators: 0,
  totalValidCoordinatorsChecked: 0,
  validCoordinatorsWithMissingActions: [],
  validCoordinatorsWithCorrectActions: [],
  errors: []
};

async function connectDB() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: process.env.MONGO_DB_NAME
    });
    console.log('✅ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    return false;
  }
}

async function testValidCoordinatorActions() {
  try {
    const EventRequest = mongoose.model('EventRequest');
    
    console.log('\n📊 Fetching APPROVED requests with valid coordinators...\n');
    
    // Get all APPROVED requests with valid coordinators
    const approvedRequests = await EventRequest
      .find({ status: REQUEST_STATES.APPROVED })
      .select('Request_ID status validCoordinators reviewer requester')
      .lean();
    
    testResults.totalApprovedRequests = approvedRequests.length;
    console.log(`Found ${approvedRequests.length} APPROVED requests\n`);
    
    if (approvedRequests.length === 0) {
      console.log('⚠️  No APPROVED requests found in database');
      return;
    }
    
    // Test each request
    for (const request of approvedRequests) {
      if (!request.validCoordinators || request.validCoordinators.length === 0) {
        continue;
      }
      
      testResults.requestsWithValidCoordinators++;
      
      console.log(`📋 Request: ${request.Request_ID}`);
      console.log(`   Status: ${request.status}`);
      console.log(`   Reviewer ID: ${request.reviewer?._id || request.reviewer?.userId || 'N/A'}`);
      console.log(`   Valid Coordinators: ${request.validCoordinators.length}`);
      
      const assignedReviewerId = request.reviewer?._id?.toString() || request.reviewer?.userId?.toString();
      
      // Test each valid coordinator
      for (const validCoord of request.validCoordinators) {
        const coordId = validCoord._id?.toString() || validCoord.userId?.toString();
        const isAssigned = coordId === assignedReviewerId;
        
        testResults.totalValidCoordinatorsChecked++;
        
        // Get available actions for this coordinator
        const actions = await actionValidatorService.getAvailableActions(
          coordId,
          request,
          { locationId: request.location?._id?.toString() }
        );
        
        const hasEditAction = actions.includes('edit');
        const hasRescheduleAction = actions.includes('reschedule');
        const hasManageStaffAction = actions.includes('manage-staff');
        const hasViewAction = actions.includes('view');
        
        const coordinatorStatus = isAssigned ? '✅ ASSIGNED' : '⚠️  NOT ASSIGNED';
        
        console.log(`   ${coordinatorStatus} Coordinator: ${validCoord.name || coordId}`);
        console.log(`      Available Actions: ${actions.join(', ')}`);
        console.log(`      ├─ view: ${hasViewAction ? '✅' : '❌'}`);
        console.log(`      ├─ edit: ${hasEditAction ? '✅' : '❌'}`);
        console.log(`      ├─ reschedule: ${hasRescheduleAction ? '✅' : '❌'}`);
        console.log(`      └─ manage-staff: ${hasManageStaffAction ? '✅' : '❌'}`);
        
        // Check if non-assigned coordinator has required actions
        if (!isAssigned) {
          if (!hasEditAction || !hasRescheduleAction || !hasManageStaffAction) {
            testResults.validCoordinatorsWithMissingActions.push({
              requestId: request.Request_ID,
              coordinatorId: coordId,
              coordinatorName: validCoord.name || 'Unknown',
              missingActions: [
                !hasEditAction ? 'edit' : null,
                !hasRescheduleAction ? 'reschedule' : null,
                !hasManageStaffAction ? 'manage-staff' : null
              ].filter(Boolean),
              availableActions: actions
            });
            console.log(`      ⚠️  WARNING: Non-assigned coordinator missing actions!`);
          } else {
            testResults.validCoordinatorsWithCorrectActions.push({
              requestId: request.Request_ID,
              coordinatorId: coordId,
              coordinatorName: validCoord.name || 'Unknown',
              availableActions: actions
            });
            console.log(`      ✅ All expected actions present`);
          }
        } else {
          testResults.validCoordinatorsWithCorrectActions.push({
            requestId: request.Request_ID,
            coordinatorId: coordId,
            coordinatorName: validCoord.name || 'Unknown',
            availableActions: actions,
            note: 'Assigned coordinator'
          });
        }
      }
      
      console.log('');
    }
    
  } catch (error) {
    testResults.errors.push(error.message);
    console.error('❌ Error during testing:', error.message);
  }
}

async function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('📈 TEST RESULTS SUMMARY');
  console.log('='.repeat(80) + '\n');
  
  console.log(`Total APPROVED Requests: ${testResults.totalApprovedRequests}`);
  console.log(`Requests with Valid Coordinators: ${testResults.requestsWithValidCoordinators}`);
  console.log(`Total Valid Coordinators Checked: ${testResults.totalValidCoordinatorsChecked}`);
  console.log(`Valid Coordinators with Correct Actions: ${testResults.validCoordinatorsWithCorrectActions.length}`);
  console.log(`Valid Coordinators with MISSING Actions: ${testResults.validCoordinatorsWithMissingActions.length}`);
  
  if (testResults.validCoordinatorsWithMissingActions.length > 0) {
    console.log('\n❌ ISSUES FOUND:\n');
    for (const issue of testResults.validCoordinatorsWithMissingActions) {
      console.log(`   Request: ${issue.requestId}`);
      console.log(`   Coordinator: ${issue.coordinatorName} (${issue.coordinatorId})`);
      console.log(`   Missing Actions: ${issue.missingActions.join(', ')}`);
      console.log(`   Available Actions: ${issue.availableActions.join(', ')}`);
      console.log('');
    }
  } else if (testResults.totalValidCoordinatorsChecked > 0) {
    console.log('\n✅ ALL TESTS PASSED!\n');
    console.log('All non-assigned valid coordinators have proper actions on APPROVED events.');
  }
  
  if (testResults.errors.length > 0) {
    console.log('\n⚠️  ERRORS ENCOUNTERED:\n');
    testResults.errors.forEach(error => console.log(`   - ${error}`));
  }
  
  console.log('\n' + '='.repeat(80) + '\n');
}

async function main() {
  console.log('\n🚀 Starting Valid Coordinator Actions Test');
  console.log('='.repeat(80) + '\n');
  
  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }
  
  await testValidCoordinatorActions();
  await printResults();
  
  await mongoose.connection.close();
  console.log('✅ Database connection closed\n');
  
  // Exit with error code if issues found
  if (testResults.validCoordinatorsWithMissingActions.length > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
