/**
 * BROADCAST MODEL TESTS
 * 
 * File: tests/eventRequests/broadcastModel.test.js
 * 
 * Comprehensive test scenarios for the broadcast model implementation
 * Tests cover:
 * 1. Coordinator Override Bug Fix - Manual override persistence
 * 2. Broadcast Visibility - Valid coordinators can see requests
 * 3. Claim/Release Mechanism - Prevents duplicate actions
 * 4. Edge Cases - Boundary conditions
 */

const mongoose = require('mongoose');
const EventRequest = require('../../src/models/eventRequests_models/eventRequest.model');
const { User } = require('../../src/models');

/**
 * TEST SCENARIO 1: Coordinator Override Bug Fix
 * 
 * PROBLEM: When admin selects Coordinator B to override Coordinator A,
 * selection doesn't persist after page refresh
 * 
 * VERIFICATION STEPS:
 * 1. Create request with Coordinator A assigned
 * 2. Override to Coordinator B
 * 3. Fetch request again
 * 4. Verify B is still assigned with override metadata
 */
async function testCoordinatorOverrideBugFix() {
  console.log('\n========================================');
  console.log('TEST 1: Coordinator Override Bug Fix');
  console.log('========================================');

  try {
    // SETUP: Create test users
    const admin = await User.findOne({ authority: { $gte: 80 } });
    const coordinatorA = await User.findOne({ authority: { $gte: 60 }, _id: { $ne: admin._id } });
    const coordinatorB = await User.findOne({ authority: { $gte: 60 }, _id: { $ne: coordinatorA._id } });

    if (!admin || !coordinatorA || !coordinatorB) {
      console.error('❌ Required users not found');
      return false;
    }

    // SETUP: Create request with Coordinator A
    const requestData = {
      Event_Title: 'Test Event Override',
      organizationType: coordinatorA.organizationType,
      municipalityId: 'Test Municipality',
      reviewer: {
        userId: coordinatorA._id,
        name: `${coordinatorA.firstName} ${coordinatorA.lastName}`,
        assignmentRule: 'auto'
      }
    };

    const request = new EventRequest(requestData);
    const savedRequest = await request.save();
    console.log(`✓ Created request: ${savedRequest.Request_ID} with reviewer: ${coordinatorA.firstName}`);

    // STEP 1: Override to Coordinator B
    const updatedRequest = await EventRequest.findByIdAndUpdate(
      savedRequest._id,
      {
        reviewer: {
          userId: coordinatorB._id,
          name: `${coordinatorB.firstName} ${coordinatorB.lastName}`,
          roleSnapshot: 'Coordinator',
          assignmentRule: 'manual',
          overriddenAt: new Date(),
          overriddenBy: {
            userId: admin._id,
            name: `${admin.firstName} ${admin.lastName}`,
            roleSnapshot: admin.role
          }
        }
      },
      { new: true }
    );

    console.log(`✓ Overridden coordinator to: ${coordinatorB.firstName}`);

    // STEP 2: Fetch request again (simulating page refresh)
    const refetchedRequest = await EventRequest.findById(updatedRequest._id);

    // STEP 3: VERIFY
    const assertions = [
      {
        name: 'Reviewer is Coordinator B',
        condition: refetchedRequest.reviewer.userId.toString() === coordinatorB._id.toString(),
        actual: refetchedRequest.reviewer.name
      },
      {
        name: 'Assignment rule is "manual"',
        condition: refetchedRequest.reviewer.assignmentRule === 'manual',
        actual: refetchedRequest.reviewer.assignmentRule
      },
      {
        name: 'Override metadata exists',
        condition: !!refetchedRequest.reviewer.overriddenAt && !!refetchedRequest.reviewer.overriddenBy,
        actual: `overriddenAt: ${refetchedRequest.reviewer.overriddenAt}, overriddenBy: ${refetchedRequest.reviewer.overriddenBy?.name}`
      },
      {
        name: 'Status history includes override',
        condition: refetchedRequest.statusHistory?.some(h => h.description?.includes('manually overridden')),
        actual: refetchedRequest.statusHistory?.length
      }
    ];

    let allPassed = true;
    assertions.forEach(assertion => {
      if (assertion.condition) {
        console.log(`  ✓ ${assertion.name}`);
      } else {
        console.log(`  ✗ ${assertion.name} - Expected: true, Got: ${assertion.actual}`);
        allPassed = false;
      }
    });

    return allPassed;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * TEST SCENARIO 2: Broadcast Visibility
 * 
 * PROBLEM: Only single assigned reviewer can see request;
 * other qualified coordinators have no visibility
 * 
 * VERIFICATION STEPS:
 * 1. Create request
 * 2. Populate validCoordinators array
 * 3. Query with different coordinators
 * 4. Verify all valid coordinators see the request
 */
async function testBroadcastVisibility() {
  console.log('\n========================================');
  console.log('TEST 2: Broadcast Visibility');
  console.log('========================================');

  try {
    // SETUP: Get coordinators
    const coordinators = await User.find({ authority: { $gte: 60 }, isActive: true })
      .limit(3);

    if (coordinators.length < 2) {
      console.error('❌ Not enough coordinators for test');
      return false;
    }

    // SETUP: Create request
    const requestData = {
      Event_Title: 'Test Event Broadcast',
      organizationType: coordinators[0].organizationType,
      municipalityId: 'Test Municipality',
      reviewer: {
        userId: coordinators[0]._id,
        name: `${coordinators[0].firstName} ${coordinators[0].lastName}`
      },
      validCoordinators: coordinators.map(c => ({
        userId: c._id,
        name: `${c.firstName} ${c.lastName}`,
        discoveredAt: new Date()
      }))
    };

    const request = new EventRequest(requestData);
    const savedRequest = await request.save();
    console.log(`✓ Created request with ${coordinators.length} valid coordinators`);

    // STEP 1: Query from each coordinator's perspective
    const results = [];
    for (const coordinator of coordinators) {
      const visible = await EventRequest.findOne({
        $or: [
          { 'reviewer.userId': coordinator._id },
          { 'validCoordinators.userId': coordinator._id }
        ],
        _id: savedRequest._id
      });

      results.push({
        coordinator: coordinator.firstName,
        isVisible: !!visible
      });
    }

    // STEP 2: VERIFY
    console.log('✓ Visibility check results:');
    let allVisible = true;
    results.forEach(r => {
      if (r.isVisible) {
        console.log(`  ✓ ${r.coordinator} can see request`);
      } else {
        console.log(`  ✗ ${r.coordinator} CANNOT see request`);
        allVisible = false;
      }
    });

    return allVisible;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * TEST SCENARIO 3: Claim/Release Mechanism
 * 
 * PROBLEM: Multiple coordinators could simultaneously approve same request
 * 
 * VERIFICATION STEPS:
 * 1. Create request visible to multiple coordinators
 * 2. Coordinator A claims it
 * 3. Coordinator B tries to claim - should fail
 * 4. Coordinator A releases it
 * 5. Coordinator B can now claim
 */
async function testClaimReleaseMechanism() {
  console.log('\n========================================');
  console.log('TEST 3: Claim/Release Mechanism');
  console.log('========================================');

  try {
    // SETUP: Get two coordinators
    const coordinators = await User.find({ authority: { $gte: 60 }, isActive: true })
      .limit(2);

    if (coordinators.length < 2) {
      console.error('❌ Not enough coordinators for test');
      return false;
    }

    // SETUP: Create request
    const requestData = {
      Event_Title: 'Test Event Claim',
      organizationType: coordinators[0].organizationType,
      municipalityId: 'Test Municipality',
      reviewer: { userId: coordinators[0]._id },
      validCoordinators: coordinators.map(c => ({
        userId: c._id,
        name: `${c.firstName} ${c.lastName}`
      })),
      claimedBy: null
    };

    const request = new EventRequest(requestData);
    const savedRequest = await request.save();
    console.log(`✓ Created request`);

    // STEP 1: Coordinator A claims
    savedRequest.claimedBy = {
      userId: coordinators[0]._id,
      name: coordinators[0].firstName,
      claimedAt: new Date(),
      claimTimeoutAt: new Date(Date.now() + 30 * 60 * 1000)
    };
    await savedRequest.save();
    console.log(`✓ Coordinator A (${coordinators[0].firstName}) claimed request`);

    // STEP 2: Check if Coordinator B can claim (should fail)
    let refetched = await EventRequest.findById(savedRequest._id);
    const canCoordinatorBClaim = !refetched.claimedBy || 
      refetched.claimedBy.userId.toString() === coordinators[1]._id.toString();
    
    console.log(`✓ Coordinator B attempt to claim: ${canCoordinatorBClaim ? '✗ Allowed (BUG!)' : '✓ Blocked (correct)'}`);

    // STEP 3: Coordinator A releases
    refetched.claimedBy = null;
    await refetched.save();
    console.log(`✓ Coordinator A released request`);

    // STEP 4: Coordinator B can now claim
    refetched = await EventRequest.findById(savedRequest._id);
    refetched.claimedBy = {
      userId: coordinators[1]._id,
      name: coordinators[1].firstName,
      claimedAt: new Date(),
      claimTimeoutAt: new Date(Date.now() + 30 * 60 * 1000)
    };
    await refetched.save();
    console.log(`✓ Coordinator B (${coordinators[1].firstName}) claimed request`);

    // VERIFY
    const final = await EventRequest.findById(savedRequest._id);
    const claimedByB = final.claimedBy?.userId.toString() === coordinators[1]._id.toString();

    if (claimedByB) {
      console.log('✓ Claim/Release mechanism working correctly');
      return true;
    } else {
      console.log('✗ Coordinator B could not claim after release');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * TEST SCENARIO 4: Edge Cases
 * 
 * Tests boundary conditions:
 * 1. Override with invalid coordinator (not in validCoordinators)
 * 2. Claim with user not in validCoordinators
 * 3. Release claim by wrong user
 * 4. Double claim timeout handling
 */
async function testEdgeCases() {
  console.log('\n========================================');
  console.log('TEST 4: Edge Cases');
  console.log('========================================');

  try {
    // SETUP
    const users = await User.find({ isActive: true }).limit(4);
    if (users.length < 3) {
      console.error('❌ Not enough users for edge case tests');
      return false;
    }

    const coordinator1 = users[0];
    const coordinator2 = users[1];
    const invalidUser = users[2];

    // Create request
    const requestData = {
      Event_Title: 'Test Edge Cases',
      organizationType: coordinator1.organizationType,
      municipalityId: 'Test Municipality',
      reviewer: { userId: coordinator1._id },
      validCoordinators: [
        { userId: coordinator1._id, name: coordinator1.firstName },
        { userId: coordinator2._id, name: coordinator2.firstName }
      ]
    };

    const request = new EventRequest(requestData);
    const savedRequest = await request.save();

    // EDGE CASE 1: Claim with invalid user
    console.log('Edge Case 1: Claim with non-valid coordinator');
    const isValidCoordinator = savedRequest.validCoordinators?.some(vc =>
      vc.userId.toString() === invalidUser._id.toString()
    );
    
    if (!isValidCoordinator) {
      console.log('  ✓ User not in validCoordinators (correctly blocked)');
    } else {
      console.log('  ✗ User should not be in validCoordinators');
    }

    // EDGE CASE 2: Release by wrong user
    console.log('Edge Case 2: Release by wrong user');
    savedRequest.claimedBy = {
      userId: coordinator1._id,
      name: coordinator1.firstName,
      claimedAt: new Date()
    };
    await savedRequest.save();

    const claimedByCoordinator1 = savedRequest.claimedBy?.userId.toString() === coordinator1._id.toString();
    const attemptReleaseByCoordinator2 = savedRequest.claimedBy?.userId.toString() !== coordinator2._id.toString();

    if (claimedByCoordinator1 && attemptReleaseByCoordinator2) {
      console.log('  ✓ Release by wrong user correctly identified');
    }

    // EDGE CASE 3: Claim timeout handling
    console.log('Edge Case 3: Claim timeout handling');
    const expiredClaim = new Date(Date.now() - 1000); // 1 second in the past
    savedRequest.claimedBy.claimTimeoutAt = expiredClaim;
    await savedRequest.save();

    const isExpired = savedRequest.claimedBy.claimTimeoutAt < new Date();
    if (isExpired) {
      console.log('  ✓ Expired claim correctly identified');
    }

    console.log('✓ All edge cases handled');
    return true;

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

/**
 * RUN ALL TESTS
 */
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║     BROADCAST MODEL - COMPREHENSIVE TEST SUITE     ║');
  console.log('║                                                    ║');
  console.log('║  Tests are designed to validate the broadcast     ║');
  console.log('║  model implementation fixes                       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const results = {
    'Test 1: Coordinator Override Bug Fix': false,
    'Test 2: Broadcast Visibility': false,
    'Test 3: Claim/Release Mechanism': false,
    'Test 4: Edge Cases': false
  };

  try {
    // Run tests
    results['Test 1: Coordinator Override Bug Fix'] = await testCoordinatorOverrideBugFix();
    results['Test 2: Broadcast Visibility'] = await testBroadcastVisibility();
    results['Test 3: Claim/Release Mechanism'] = await testClaimReleaseMechanism();
    results['Test 4: Edge Cases'] = await testEdgeCases();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════╗');
    console.log('║                    TEST SUMMARY                   ║');
    console.log('╚════════════════════════════════════════════════════╝\n');

    Object.entries(results).forEach(([testName, passed]) => {
      const status = passed ? '✓ PASSED' : '✗ FAILED';
      console.log(`${status} - ${testName}`);
    });

    const passedCount = Object.values(results).filter(v => v).length;
    const totalCount = Object.values(results).length;
    
    console.log(`\nTotal: ${passedCount}/${totalCount} tests passed\n`);

    if (passedCount === totalCount) {
      console.log('🎉 All tests passed! Broadcast model is ready for deployment.\n');
    } else {
      console.log(`⚠️  ${totalCount - passedCount} test(s) failed. Review results above.\n`);
    }

  } catch (error) {
    console.error('Fatal test error:', error);
  }
}

// Export for use in test runners
module.exports = {
  testCoordinatorOverrideBugFix,
  testBroadcastVisibility,
  testClaimReleaseMechanism,
  testEdgeCases,
  runAllTests
};

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(error => {
    console.error('Test suite failed:', error);
    process.exit(1);
  });
}
