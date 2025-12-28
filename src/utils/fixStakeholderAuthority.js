/**
 * Fix Stakeholder Authority Script
 * 
 * This script fixes existing stakeholders who have incorrect authority (20 instead of 30).
 * It recalculates authority from their roles and updates the user document.
 * 
 * Usage:
 *   node src/utils/fixStakeholderAuthority.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be changed without actually updating
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, Role } = require('../models');
const authorityService = require('../services/users_services/authority.service');
const { getConnectionUri, connect, disconnect } = require('./dbConnection');

async function fixStakeholderAuthority(dryRun = false) {
  try {
    // Connect to database using shared utility
    const mongoUri = getConnectionUri();
    await connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all users with authority < 60 (potential stakeholders)
    const potentialStakeholders = await User.find({
      authority: { $lt: 60 }
    }).select('_id email firstName lastName authority roles');

    console.log(`\nFound ${potentialStakeholders.length} users with authority < 60`);

    let fixedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const user of potentialStakeholders) {
      // Calculate correct authority from roles
      const correctAuthority = await authorityService.calculateUserAuthority(user._id);
      
      // Check if authority needs to be updated
      if (user.authority !== correctAuthority) {
        updates.push({
          userId: user._id.toString(),
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          currentAuthority: user.authority,
          correctAuthority: correctAuthority,
          roles: user.roles?.map(r => ({
            code: r.roleCode,
            authority: r.roleAuthority
          })) || []
        });

        if (!dryRun) {
          // Update user authority
          user.authority = correctAuthority;
          await user.save();
          fixedCount++;
          console.log(`✓ Fixed ${user.email}: ${user.authority} → ${correctAuthority}`);
        } else {
          fixedCount++;
          console.log(`[DRY RUN] Would fix ${user.email}: ${user.authority} → ${correctAuthority}`);
        }
      } else {
        skippedCount++;
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total users checked: ${potentialStakeholders.length}`);
    console.log(`Users that need fixing: ${fixedCount}`);
    console.log(`Users already correct: ${skippedCount}`);

    if (dryRun && updates.length > 0) {
      console.log(`\n=== Users that would be updated ===`);
      updates.forEach(u => {
        console.log(`\n${u.name} (${u.email}):`);
        console.log(`  Current: ${u.currentAuthority}`);
        console.log(`  Correct: ${u.correctAuthority}`);
        console.log(`  Roles: ${u.roles.map(r => `${r.code} (${r.roleAuthority})`).join(', ')}`);
      });
    }

    if (!dryRun && fixedCount > 0) {
      console.log(`\n✓ Successfully fixed ${fixedCount} stakeholder(s)`);
    }

    await disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error fixing stakeholder authority:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

fixStakeholderAuthority(dryRun)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

