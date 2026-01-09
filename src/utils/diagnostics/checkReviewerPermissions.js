/**
 * Diagnostic Script: Check Reviewer Permissions
 * 
 * Checks if reviewers have request.review permission and can actually review requests.
 * This helps diagnose why reviewers are assigned but can't perform review actions.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, Role, UserRole, EventRequest } = require('../../models/index');
const permissionService = require('../../services/users_services/permission.service');
const reviewerAssignmentService = require('../../services/eventRequests_services/reviewerAssignment.service');
const { getConnectionUri, connect, disconnect } = require('../../utils/dbConnection');

async function checkReviewerPermissions() {
  try {
    // Verify MONGO_DB_NAME is set
    if (!process.env.MONGO_DB_NAME) {
      console.error('❌ ERROR: MONGO_DB_NAME is not set in environment variables');
      console.error('Please set MONGO_DB_NAME in your .env file (e.g., MONGO_DB_NAME=unite-test-v2)');
      process.exit(1);
    }

    // Connect to database using MONGO_DB_NAME
    const uri = getConnectionUri();
    console.log(`Connecting to MongoDB...`);
    console.log(`Database: ${process.env.MONGO_DB_NAME}`);
    console.log(`URI: ${uri.replace(/\/\/.*@/, '//***@')}`); // Hide credentials in URI
    await connect(uri);
    console.log(`✅ Connected to database: ${mongoose.connection.name}\n`);

    console.log('='.repeat(80));
    console.log('REVIEWER PERMISSIONS DIAGNOSTIC');
    console.log('='.repeat(80));

    // 1. Check roles have request.review permission
    console.log('\n1. CHECKING ROLES FOR request.review PERMISSION');
    console.log('-'.repeat(80));
    
    const roles = await Role.find({ 
      $or: [
        { code: 'coordinator' },
        { code: 'system-admin' },
        { authority: { $gte: 60 } }
      ]
    }).sort({ code: 1 });

    const roleResults = [];
    for (const role of roles) {
      const hasReview = await permissionService.roleHasCapability(role._id, 'request.review');
      const hasWildcard = role.permissions?.some(p => p.resource === '*' && p.actions.includes('*'));
      
      roleResults.push({
        code: role.code,
        name: role.name,
        authority: role.authority,
        hasRequestReview: hasReview || hasWildcard,
        hasWildcard: hasWildcard
      });

      const status = (hasReview || hasWildcard) ? '✓' : '❌';
      console.log(`${status} ${role.code} (${role.name}) - Authority: ${role.authority}`);
      console.log(`   Has request.review: ${hasReview || hasWildcard ? 'YES' : 'NO'}`);
      if (hasWildcard) {
        console.log(`   Has wildcard (*.*): YES`);
      }
    }

    // 2. Check users with request.review permission
    console.log('\n2. CHECKING USERS WITH request.review PERMISSION');
    console.log('-'.repeat(80));
    
    const usersWithReview = await permissionService.getUsersWithPermission('request.review', null);
    console.log(`Found ${usersWithReview.length} user(s) with request.review permission globally`);
    
    if (usersWithReview.length > 0) {
      console.log('\nUsers with request.review permission:');
      for (const userId of usersWithReview.slice(0, 10)) { // Show first 10
        try {
          const user = await User.findById(userId).select('email firstName lastName authority').lean();
          if (user) {
            const roles = await permissionService.getUserRoles(userId);
            const roleCodes = roles.map(r => r.code).join(', ');
            console.log(`  - ${user.email} (${user.firstName} ${user.lastName}) - Authority: ${user.authority || 'N/A'} - Roles: ${roleCodes || 'None'}`);
          }
        } catch (e) {
          console.log(`  - User ID: ${userId} (error loading: ${e.message})`);
        }
      }
      if (usersWithReview.length > 10) {
        console.log(`  ... and ${usersWithReview.length - 10} more`);
      }
    } else {
      console.log('❌ NO USERS FOUND WITH request.review PERMISSION');
      console.log('   This is the root cause - reviewers cannot be found!');
    }

    // 3. Check recent requests and their reviewers
    console.log('\n3. CHECKING RECENT REQUESTS AND REVIEWERS');
    console.log('-'.repeat(80));
    
    const recentRequests = await EventRequest.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select('Request_ID requester reviewer status createdAt')
      .lean();

    console.log(`Found ${recentRequests.length} recent request(s)`);
    
    for (const req of recentRequests) {
      const reviewerId = req.reviewer?.userId?._id || req.reviewer?.userId;
      if (!reviewerId) {
        console.log(`\n  Request ${req.Request_ID}: ❌ NO REVIEWER ASSIGNED`);
        continue;
      }

      const reviewer = await User.findById(reviewerId).select('email firstName lastName authority').lean();
      if (!reviewer) {
        console.log(`\n  Request ${req.Request_ID}: ❌ REVIEWER NOT FOUND (ID: ${reviewerId})`);
        continue;
      }

      const hasReview = await permissionService.checkPermission(reviewerId, 'request', 'review', {});
      const roles = await permissionService.getUserRoles(reviewerId);
      const roleCodes = roles.map(r => r.code).join(', ');

      const status = hasReview ? '✓' : '❌';
      console.log(`\n  Request ${req.Request_ID}:`);
      console.log(`    Reviewer: ${reviewer.email} (${reviewer.firstName} ${reviewer.lastName})`);
      console.log(`    Authority: ${reviewer.authority || 'N/A'}`);
      console.log(`    Roles: ${roleCodes || 'None'}`);
      console.log(`    ${status} Has request.review permission: ${hasReview ? 'YES' : 'NO'}`);
      
      if (!hasReview) {
        console.log(`    ⚠️  WARNING: Reviewer cannot perform review actions!`);
      }
    }

    // 4. Test reviewer assignment
    console.log('\n4. TESTING REVIEWER ASSIGNMENT');
    console.log('-'.repeat(80));
    
    // Find a coordinator user
    const coordinatorUser = await User.findOne({ 
      authority: { $gte: 60, $lt: 80 },
      isActive: true 
    }).select('_id email authority').lean();

    if (coordinatorUser) {
      console.log(`Testing assignment for coordinator: ${coordinatorUser.email} (authority: ${coordinatorUser.authority})`);
      try {
        const reviewer = await reviewerAssignmentService.assignReviewer(coordinatorUser._id, {
          locationId: null
        });
        
        if (reviewer) {
          const reviewerUser = await User.findById(reviewer.userId).select('email authority').lean();
          const hasReview = await permissionService.checkPermission(reviewer.userId, 'request', 'review', {});
          
          console.log(`  ✓ Reviewer assigned: ${reviewerUser?.email || reviewer.userId}`);
          console.log(`    Assignment rule: ${reviewer.assignmentRule}`);
          console.log(`    Has request.review: ${hasReview ? 'YES' : 'NO'}`);
          
          if (!hasReview) {
            console.log(`    ⚠️  WARNING: Assigned reviewer does not have request.review permission!`);
          }
        } else {
          console.log('  ❌ No reviewer assigned');
        }
      } catch (error) {
        console.log(`  ❌ Error assigning reviewer: ${error.message}`);
      }
    } else {
      console.log('  No coordinator user found for testing');
    }

    // 5. Summary and recommendations
    console.log('\n5. SUMMARY AND RECOMMENDATIONS');
    console.log('-'.repeat(80));
    
    const rolesWithoutReview = roleResults.filter(r => !r.hasRequestReview);
    const reviewersWithoutPermission = recentRequests.filter(req => {
      const reviewerId = req.reviewer?.userId?._id || req.reviewer?.userId;
      return reviewerId; // We'll check this separately
    });

    if (rolesWithoutReview.length > 0) {
      console.log(`\n❌ ${rolesWithoutReview.length} role(s) missing request.review permission:`);
      rolesWithoutReview.forEach(r => {
        console.log(`   - ${r.code} (${r.name})`);
      });
      console.log('\n   RECOMMENDATION: Run migration to fix role permissions:');
      console.log('   node src/utils/migrations/fixCoordinatorPermissions.js');
    }

    if (usersWithReview.length === 0) {
      console.log('\n❌ NO USERS FOUND WITH request.review PERMISSION');
      console.log('\n   ROOT CAUSE: Users either:');
      console.log('   1. Don\'t have roles assigned');
      console.log('   2. Have roles that don\'t include request.review permission');
      console.log('   3. Role assignments are inactive or expired');
      console.log('\n   RECOMMENDATION:');
      console.log('   1. Verify roles have request.review permission (see section 1)');
      console.log('   2. Verify users have active role assignments');
      console.log('   3. Run: node src/utils/migrations/fixCoordinatorPermissions.js');
    } else {
      console.log(`\n✓ Found ${usersWithReview.length} user(s) with request.review permission`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('DIAGNOSTIC COMPLETE');
    console.log('='.repeat(80));

    return {
      rolesChecked: roleResults.length,
      rolesWithoutReview: rolesWithoutReview.length,
      usersWithReview: usersWithReview.length,
      recentRequests: recentRequests.length
    };

  } catch (error) {
    console.error('Error running diagnostic:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  checkReviewerPermissions()
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Diagnostic failed:', error);
      process.exit(1);
    });
}

module.exports = { checkReviewerPermissions };

