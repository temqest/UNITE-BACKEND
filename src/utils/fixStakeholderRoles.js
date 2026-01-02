/**
 * Fix Stakeholder Roles Script
 * 
 * This script fixes existing stakeholders who have coordinator roles assigned.
 * It removes coordinator roles (authority >= 60) and ensures only stakeholder roles remain.
 * 
 * Usage:
 *   node src/utils/fixStakeholderRoles.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be changed without actually updating
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, UserRole, Role } = require('../models');
const authorityService = require('../services/users_services/authority.service');
const { getConnectionUri, connect, disconnect } = require('./dbConnection');

async function fixStakeholderRoles(dryRun = false) {
  try {
    // Connect to database using shared utility
    const mongoUri = getConnectionUri();
    await connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get coordinator role IDs (authority >= 60)
    const coordinatorRoles = await Role.find({ authority: { $gte: 60 } }).select('_id code authority');
    const coordinatorRoleIds = coordinatorRoles.map(r => r._id);
    const coordinatorRoleCodes = coordinatorRoles.map(r => r.code);
    
    console.log(`\nFound ${coordinatorRoles.length} coordinator-level roles:`, coordinatorRoleCodes);

    // Find all users with authority < 60 (potential stakeholders)
    const stakeholders = await User.find({
      authority: { $lt: 60 }
    }).select('_id email firstName lastName authority roles');

    console.log(`\nFound ${stakeholders.length} users with authority < 60`);

    let fixedCount = 0;
    let skippedCount = 0;
    const updates = [];

    for (const user of stakeholders) {
      // Check if user has coordinator roles assigned
      const userRoles = await UserRole.find({ 
        userId: user._id, 
        isActive: true 
      }).populate('roleId');
      
      const hasCoordinatorRole = userRoles.some(ur => {
        const roleAuth = ur.roleId?.authority || 20;
        return roleAuth >= 60;
      });
      
      if (!hasCoordinatorRole) {
        skippedCount++;
        continue;
      }

      // User has coordinator role - need to remove it
      const coordinatorUserRoles = userRoles.filter(ur => {
        const roleAuth = ur.roleId?.authority || 20;
        return roleAuth >= 60;
      });
      
      const stakeholderUserRoles = userRoles.filter(ur => {
        const roleAuth = ur.roleId?.authority || 20;
        return roleAuth < 60;
      });

      updates.push({
        userId: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        currentAuthority: user.authority,
        coordinatorRoles: coordinatorUserRoles.map(ur => ({
          code: ur.roleId?.code,
          authority: ur.roleId?.authority
        })),
        stakeholderRoles: stakeholderUserRoles.map(ur => ({
          code: ur.roleId?.code,
          authority: ur.roleId?.authority
        }))
      });

      if (!dryRun) {
        // Deactivate coordinator roles
        for (const coordRole of coordinatorUserRoles) {
          coordRole.isActive = false;
          await coordRole.save();
          console.log(`  ✓ Deactivated coordinator role "${coordRole.roleId?.code}" for ${user.email}`);
        }

        // Update embedded roles array to only include stakeholder roles
        user.roles = stakeholderUserRoles.map(ur => ({
          roleId: ur.roleId._id,
          roleCode: ur.roleId.code,
          roleAuthority: ur.roleId.authority || 20,
          assignedAt: ur.assignedAt || new Date(),
          assignedBy: ur.assignedBy || null,
          isActive: ur.isActive !== false
        }));

        // Recalculate authority
        const correctAuthority = await authorityService.calculateUserAuthority(user._id);
        user.authority = correctAuthority;
        await user.save();
        
        fixedCount++;
        console.log(`✓ Fixed ${user.email}: removed coordinator roles, authority set to ${correctAuthority}`);
      } else {
        fixedCount++;
        console.log(`[DRY RUN] Would fix ${user.email}: remove ${coordinatorUserRoles.length} coordinator role(s)`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Total stakeholders checked: ${stakeholders.length}`);
    console.log(`Stakeholders with coordinator roles: ${fixedCount}`);
    console.log(`Stakeholders already correct: ${skippedCount}`);

    if (dryRun && updates.length > 0) {
      console.log(`\n=== Users that would be fixed ===`);
      updates.forEach(u => {
        console.log(`\n${u.name} (${u.email}):`);
        console.log(`  Current authority: ${u.currentAuthority}`);
        console.log(`  Coordinator roles to remove: ${u.coordinatorRoles.map(r => `${r.code} (${r.authority})`).join(', ')}`);
        console.log(`  Stakeholder roles to keep: ${u.stakeholderRoles.map(r => `${r.code} (${r.authority})`).join(', ')}`);
      });
    }

    if (!dryRun && fixedCount > 0) {
      console.log(`\n✓ Successfully fixed ${fixedCount} stakeholder(s)`);
    }

    await disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch (error) {
    console.error('Error fixing stakeholder roles:', error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

if (dryRun) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

fixStakeholderRoles(dryRun)
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

