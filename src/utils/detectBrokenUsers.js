/**
 * Diagnostic Script: Detect Broken Users
 * 
 * Scans all users and identifies those with missing or invalid data:
 * - Users without authority
 * - Coordinators without organizations
 * - Coordinators without coverage areas
 * - Stakeholders without municipality
 * 
 * Usage:
 *   node src/utils/detectBrokenUsers.js [--fix]
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/index');
const authorityService = require('../services/users_services/authority.service');

const FIX_MODE = process.argv.includes('--fix');

async function detectBrokenUsers() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL);
    console.log('Connected to database');

    if (FIX_MODE) {
      console.log('⚠️  FIX MODE - Will attempt to fix issues where possible');
    }

    const issues = {
      MISSING_AUTHORITY: [],
      COORDINATOR_NO_ORG: [],
      COORDINATOR_NO_COVERAGE: [],
      STAKEHOLDER_NO_MUNICIPALITY: [],
      COORDINATOR_NO_MUNICIPALITIES: []
    };

    const users = await User.find({});
    console.log(`Scanning ${users.length} users...\n`);

    for (const user of users) {
      // Check for missing authority
      if (!user.authority || user.authority === 20) {
        // Try to calculate if it's actually 20 or missing
        const calculatedAuthority = await authorityService.calculateUserAuthority(user._id);
        if (calculatedAuthority !== 20 || !user.authority) {
          issues.MISSING_AUTHORITY.push({
            userId: user._id.toString(),
            email: user.email,
            currentAuthority: user.authority,
            calculatedAuthority: calculatedAuthority
          });
        }
      }

      // Check coordinators (authority >= 60, not system admin)
      if (user.authority >= 60 && !user.isSystemAdmin) {
        // Check for organizations
        if (!user.organizations || user.organizations.length === 0) {
          issues.COORDINATOR_NO_ORG.push({
            userId: user._id.toString(),
            email: user.email,
            authority: user.authority
          });
        }

        // Check for coverage areas
        if (!user.coverageAreas || user.coverageAreas.length === 0) {
          issues.COORDINATOR_NO_COVERAGE.push({
            userId: user._id.toString(),
            email: user.email,
            authority: user.authority
          });
        } else {
          // Check if coverage areas have municipalities
          const hasMunicipalities = user.coverageAreas.some(
            ca => ca.municipalityIds && ca.municipalityIds.length > 0
          );
          if (!hasMunicipalities) {
            issues.COORDINATOR_NO_MUNICIPALITIES.push({
              userId: user._id.toString(),
              email: user.email,
              authority: user.authority,
              coverageAreaCount: user.coverageAreas.length
            });
          }
        }
      }

      // Check stakeholders (authority < 60)
      if (user.authority < 60) {
        if (!user.locations || !user.locations.municipalityId) {
          issues.STAKEHOLDER_NO_MUNICIPALITY.push({
            userId: user._id.toString(),
            email: user.email,
            authority: user.authority
          });
        }
      }
    }

    // Print summary
    console.log('=== Broken Users Summary ===\n');

    let totalIssues = 0;

    for (const [issueType, affectedUsers] of Object.entries(issues)) {
      if (affectedUsers.length > 0) {
        console.log(`${issueType}: ${affectedUsers.length} users`);
        totalIssues += affectedUsers.length;
        
        if (affectedUsers.length <= 10) {
          affectedUsers.forEach(u => {
            console.log(`  - ${u.email} (${u.userId})`);
          });
        } else {
          affectedUsers.slice(0, 5).forEach(u => {
            console.log(`  - ${u.email} (${u.userId})`);
          });
          console.log(`  ... and ${affectedUsers.length - 5} more`);
        }
        console.log();
      }
    }

    if (totalIssues === 0) {
      console.log('✓ No broken users detected!');
    } else {
      console.log(`Total issues found: ${totalIssues}`);
    }

    // Fix mode: attempt to fix issues
    if (FIX_MODE && totalIssues > 0) {
      console.log('\n=== Attempting Fixes ===\n');

      // Fix missing authority
      for (const userIssue of issues.MISSING_AUTHORITY) {
        try {
          const user = await User.findById(userIssue.userId);
          if (user && userIssue.calculatedAuthority) {
            user.authority = userIssue.calculatedAuthority;
            await user.save();
            console.log(`✓ Fixed authority for ${userIssue.email}: ${userIssue.calculatedAuthority}`);
          }
        } catch (error) {
          console.error(`✗ Failed to fix authority for ${userIssue.email}:`, error.message);
        }
      }

      console.log('\n⚠️  Other issues require manual intervention:');
      console.log('  - Coordinators without organizations: Assign organizations via UserOrganization');
      console.log('  - Coordinators without coverage: Assign coverage areas via UserCoverageAssignment');
      console.log('  - Stakeholders without municipality: Assign municipality via UserLocation');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Detection failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run detection
detectBrokenUsers();















