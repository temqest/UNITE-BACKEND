/**
 * Authority Migration Script
 * 
 * Calculates authority levels for all users and audits current violations.
 * This script helps identify permission leakage issues before deployment.
 * 
 * Usage: node src/utils/migrateAuthorityLevels.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User, UserRole } = require('../models/index');
const authorityService = require('../services/users_services/authority.service');

// Authority tier names
const AUTHORITY_TIERS = {
  SYSTEM_ADMIN: 100,
  OPERATIONAL_ADMIN: 80,
  COORDINATOR: 60,
  STAKEHOLDER: 40,
  BASIC_USER: 20
};

/**
 * Calculate authority for all users and generate audit report
 */
async function migrateAuthorityLevels() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    if (!mongoUri) {
      console.error('❌ ERROR: MongoDB connection string is not defined');
      process.exit(1);
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ Connected to MongoDB');
    console.log('📊 Starting authority migration and audit...\n');

    // Get all active users
    const users = await User.find({ isActive: true });
    console.log(`Found ${users.length} active users\n`);

    const authorityReport = {
      totalUsers: users.length,
      byTier: {
        SYSTEM_ADMIN: 0,
        OPERATIONAL_ADMIN: 0,
        COORDINATOR: 0,
        STAKEHOLDER: 0,
        BASIC_USER: 0
      },
      violations: {
        equalOrHigherAuthority: [],
        roleAssignmentViolations: []
      },
      users: []
    };

    // Calculate authority for each user
    for (const user of users) {
      try {
        const authority = await authorityService.calculateUserAuthority(user._id);
        
        // Helper to get tier name
        const getTierName = (auth) => {
          if (auth >= 100) return 'SYSTEM_ADMIN';
          if (auth >= 80) return 'OPERATIONAL_ADMIN';
          if (auth >= 60) return 'COORDINATOR';
          if (auth >= 40) return 'STAKEHOLDER';
          return 'BASIC_USER';
        };
        const tierName = getTierName(authority);

        authorityReport.byTier[tierName]++;
        authorityReport.users.push({
          userId: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          authority,
          tierName
        });

        // Optional: Store authority in user metadata for caching
        if (!user.metadata) {
          user.metadata = {};
        }
        user.metadata.authorityLevel = authority;
        user.metadata.authorityTierName = tierName;
        // Save without validation to avoid issues with required fields
        await user.save({ validateBeforeSave: false });

      } catch (error) {
        console.error(`Error processing user ${user._id}:`, error.message);
      }
    }

    // Audit role assignments for violations
    console.log('🔍 Auditing role assignments...\n');
    const userRoles = await UserRole.find({ isActive: true }).populate('roleId').populate('userId');

    for (const userRole of userRoles) {
      try {
        if (!userRole.userId || !userRole.roleId) continue;

        const userAuthority = await authorityService.calculateUserAuthority(userRole.userId._id);
        const roleAuthority = await authorityService.calculateRoleAuthority(userRole.roleId._id);

        // Check if user has equal or higher authority than role (potential violation)
        if (userAuthority <= roleAuthority && userAuthority !== AUTHORITY_TIERS.SYSTEM_ADMIN) {
          authorityReport.violations.roleAssignmentViolations.push({
            userId: userRole.userId._id,
            userEmail: userRole.userId.email,
            roleId: userRole.roleId._id,
            roleCode: userRole.roleId.code,
            userAuthority,
            roleAuthority,
            assignedAt: userRole.assignedAt
          });
        }
      } catch (error) {
        console.error(`Error auditing role assignment ${userRole._id}:`, error.message);
      }
    }

    // Check for users who can see others with equal/higher authority
    console.log('🔍 Auditing visibility violations...\n');
    for (let i = 0; i < authorityReport.users.length; i++) {
      const viewer = authorityReport.users[i];
      for (let j = 0; j < authorityReport.users.length; j++) {
        if (i === j) continue;
        const target = authorityReport.users[j];

        // Check if viewer can see target (should not see equal/higher authority)
        const canView = await authorityService.canViewUser(viewer.userId, target.userId);
        if (!canView && viewer.authority <= target.authority) {
          // This is expected - viewer cannot see target
          continue;
        }
        if (canView && viewer.authority <= target.authority && viewer.authority !== AUTHORITY_TIERS.SYSTEM_ADMIN) {
          authorityReport.violations.equalOrHigherAuthority.push({
            viewerId: viewer.userId,
            viewerEmail: viewer.email,
            viewerAuthority: viewer.authority,
            targetId: target.userId,
            targetEmail: target.email,
            targetAuthority: target.authority
          });
        }
      }
    }

    // Generate report
    console.log('\n' + '='.repeat(80));
    console.log('AUTHORITY MIGRATION REPORT');
    console.log('='.repeat(80) + '\n');

    console.log('📊 Authority Distribution:');
    console.log(`  SYSTEM_ADMIN (100):     ${authorityReport.byTier.SYSTEM_ADMIN}`);
    console.log(`  OPERATIONAL_ADMIN (80): ${authorityReport.byTier.OPERATIONAL_ADMIN}`);
    console.log(`  COORDINATOR (60):       ${authorityReport.byTier.COORDINATOR}`);
    console.log(`  STAKEHOLDER (40):       ${authorityReport.byTier.STAKEHOLDER}`);
    console.log(`  BASIC_USER (20):        ${authorityReport.byTier.BASIC_USER}`);
    console.log(`  Total:                  ${authorityReport.totalUsers}\n`);

    console.log('⚠️  Violations Found:');
    console.log(`  Role Assignment Violations: ${authorityReport.violations.roleAssignmentViolations.length}`);
    console.log(`  Visibility Violations:      ${authorityReport.violations.equalOrHigherAuthority.length}\n`);

    if (authorityReport.violations.roleAssignmentViolations.length > 0) {
      console.log('🔴 Role Assignment Violations:');
      authorityReport.violations.roleAssignmentViolations.slice(0, 10).forEach(v => {
        console.log(`  - User ${v.userEmail} (authority: ${v.userAuthority}) has role ${v.roleCode} (authority: ${v.roleAuthority})`);
      });
      if (authorityReport.violations.roleAssignmentViolations.length > 10) {
        console.log(`  ... and ${authorityReport.violations.roleAssignmentViolations.length - 10} more`);
      }
      console.log('');
    }

    if (authorityReport.violations.equalOrHigherAuthority.length > 0) {
      console.log('🔴 Visibility Violations:');
      authorityReport.violations.equalOrHigherAuthority.slice(0, 10).forEach(v => {
        console.log(`  - User ${v.viewerEmail} (authority: ${v.viewerAuthority}) can see ${v.targetEmail} (authority: ${v.targetAuthority})`);
      });
      if (authorityReport.violations.equalOrHigherAuthority.length > 10) {
        console.log(`  ... and ${authorityReport.violations.equalOrHigherAuthority.length - 10} more`);
      }
      console.log('');
    }

    if (authorityReport.violations.roleAssignmentViolations.length === 0 && 
        authorityReport.violations.equalOrHigherAuthority.length === 0) {
      console.log('✅ No violations found! System is compliant.\n');
    }

    console.log('='.repeat(80));
    console.log('Migration complete. Authority levels have been calculated and stored in user.metadata.');
    console.log('='.repeat(80) + '\n');

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateAuthorityLevels();
}

module.exports = { migrateAuthorityLevels };

