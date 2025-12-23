/**
 * Migration Script: Users
 * 
 * Migrates existing BloodbankStaff, SystemAdmin, Coordinator, and Stakeholder
 * records to the new unified User model with RBAC roles.
 * 
 * Usage: node src/utils/migrateUsers.js [--dry-run]
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { User, BloodbankStaff, SystemAdmin, Coordinator, Stakeholder, Role, UserRole } = require('../models');
require('dotenv').config();

const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
const mongoDbName = process.env.MONGO_DB_NAME || null;

let uri = rawMongoUri;
if (mongoDbName) {
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      uri = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
    } else {
      uri = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
    }
  }
}

const dryRun = process.argv.includes('--dry-run');

async function migrateUsers() {
  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.');
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    // Get role mappings
    const systemAdminRole = await Role.findOne({ code: 'system-admin' });
    const coordinatorRole = await Role.findOne({ code: 'coordinator' });
    const stakeholderRole = await Role.findOne({ code: 'stakeholder' });

    if (!systemAdminRole || !coordinatorRole || !stakeholderRole) {
      throw new Error('Required roles not found. Please run seedRoles.js first.');
    }

    const userMap = new Map(); // Map legacy IDs to new User IDs

    // Step 1: Migrate BloodbankStaff (Admin and Coordinator)
    console.log('Step 1: Migrating BloodbankStaff...');
    const staffMembers = await BloodbankStaff.find().lean();
    
    for (const staff of staffMembers) {
      const existing = await User.findByLegacyId(staff.ID);
      if (existing) {
        console.log(`  User exists: ${staff.Email} (legacy ID: ${staff.ID})`);
        userMap.set(staff.ID, existing._id);
        continue;
      }

      console.log(`  Will create user: ${staff.Email} (${staff.StaffType})`);
      if (!dryRun) {
        const user = await User.create({
          userId: staff.ID,
          email: staff.Email,
          firstName: staff.First_Name,
          middleName: staff.Middle_Name || null,
          lastName: staff.Last_Name,
          phoneNumber: staff.Phone_Number || null,
          password: staff.Password, // Already hashed
          isSystemAdmin: staff.StaffType === 'Admin',
          isActive: true
        });

        // Assign role
        const role = staff.StaffType === 'Admin' ? systemAdminRole : coordinatorRole;
        await UserRole.create({
          userId: user._id,
          roleId: role._id,
          assignedAt: new Date(),
          isActive: true
        });

        userMap.set(staff.ID, user._id);
      }
    }

    // Step 2: Migrate SystemAdmin (additional data)
    console.log('\nStep 2: Migrating SystemAdmin data...');
    const admins = await SystemAdmin.find().lean();
    
    for (const admin of admins) {
      const user = await User.findByLegacyId(admin.Admin_ID);
      if (user) {
        console.log(`  Updating admin: ${admin.Admin_ID}`);
        if (!dryRun) {
          user.isSystemAdmin = true;
          user.metadata = { ...user.metadata, accessLevel: admin.AccessLevel };
          await user.save();
        }
      }
    }

    // Step 3: Migrate Coordinator (location assignments will be handled separately)
    console.log('\nStep 3: Migrating Coordinator data...');
    const coordinators = await Coordinator.find().lean();
    
    for (const coord of coordinators) {
      const user = await User.findByLegacyId(coord.Coordinator_ID);
      if (user) {
        console.log(`  Coordinator user exists: ${coord.Coordinator_ID}`);
        if (!dryRun) {
          user.metadata = { 
            ...user.metadata, 
            accountType: coord.accountType || 'LGU'
          };
          await user.save();
        }
      }
    }

    // Step 4: Migrate Stakeholder
    console.log('\nStep 4: Migrating Stakeholder...');
    const stakeholders = await Stakeholder.find().lean();
    
    for (const stakeholder of stakeholders) {
      const existing = await User.findOne({ email: stakeholder.email });
      if (existing) {
        console.log(`  User exists: ${stakeholder.email}`);
        userMap.set(stakeholder.Stakeholder_ID, existing._id);
        continue;
      }

      console.log(`  Will create stakeholder: ${stakeholder.email}`);
      if (!dryRun) {
        const user = await User.create({
          userId: stakeholder.Stakeholder_ID,
          email: stakeholder.email,
          firstName: stakeholder.firstName,
          middleName: stakeholder.middleName || null,
          lastName: stakeholder.lastName,
          phoneNumber: stakeholder.phoneNumber || null,
          password: stakeholder.password, // Already hashed
          organizationType: stakeholder.accountType === 'LGU' ? 'LGU' : 'Other',
          organizationInstitution: stakeholder.organizationInstitution || null,
          field: stakeholder.field || null,
          registrationCode: stakeholder.registrationCode || null,
          metadata: {
            accountType: stakeholder.accountType
          },
          isActive: true
        });

        // Assign stakeholder role
        await UserRole.create({
          userId: user._id,
          roleId: stakeholderRole._id,
          assignedAt: new Date(),
          isActive: true
        });

        userMap.set(stakeholder.Stakeholder_ID, user._id);
      }
    }

    console.log(`\nMigration ${dryRun ? 'dry-run' : ''} completed.`);
    console.log(`User map contains ${userMap.size} entries.`);
    
    return userMap;
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  migrateUsers().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { migrateUsers };
