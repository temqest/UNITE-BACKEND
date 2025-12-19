/**
 * Setup Admin Permissions
 * 
 * This script ensures that admin accounts have the proper roles and permissions.
 * It can be used to:
 * 1. Assign the system-admin role to existing admin accounts
 * 2. Verify that roles and permissions are properly seeded
 * 
 * Usage: from project root run:
 *   node src/utils/setupAdminPermissions.js [--email=admin@example.com] [--dry-run]
 * 
 * If --email is provided, it will assign the system-admin role to that user.
 * If not provided, it will list all users with isSystemAdmin flag and offer to assign roles.
 */

const mongoose = require('mongoose');
const { User } = require('../models');
const permissionService = require('../services/users_services/permission.service');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

// Accept multiple env var names for compatibility
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
const emailArg = process.argv.find(arg => arg.startsWith('--email='));
const targetEmail = emailArg ? emailArg.split('=')[1] : null;

async function setupAdminPermissions() {
  console.log('Setting up admin permissions...\n');

  // First, ensure roles and permissions are seeded
  console.log('Step 1: Checking if roles and permissions are seeded...');
  const { Role } = require('../models');
  const systemAdminRole = await Role.findOne({ code: 'system-admin' });
  
  if (!systemAdminRole) {
    console.error('❌ System-admin role not found!');
    console.error('   Please run: node src/utils/seedRoles.js');
    process.exit(1);
  }
  console.log('✓ System-admin role exists');

  // Find admin users
  let adminUsers = [];
  if (targetEmail) {
    const user = await User.findByEmail(targetEmail);
    if (user && user.isSystemAdmin) {
      adminUsers = [user];
    } else if (user) {
      console.log(`⚠ User ${targetEmail} exists but isSystemAdmin flag is false.`);
      console.log('   Setting isSystemAdmin flag...');
      if (!dryRun) {
        user.isSystemAdmin = true;
        await user.save();
      }
      adminUsers = [user];
    } else {
      console.error(`❌ User with email ${targetEmail} not found.`);
      process.exit(1);
    }
  } else {
    adminUsers = await User.find({ isSystemAdmin: true, isActive: true });
  }

  if (adminUsers.length === 0) {
    console.log('⚠ No admin users found. Create an admin account first:');
    console.log('   node src/utils/createAdmin.js');
    return;
  }

  console.log(`\nStep 2: Found ${adminUsers.length} admin user(s)`);
  
  for (const admin of adminUsers) {
    console.log(`\nProcessing: ${admin.email} (${admin.firstName} ${admin.lastName})`);
    
    // Check current roles
    const currentRoles = await permissionService.getUserRoles(admin._id);
    const hasSystemAdminRole = currentRoles.some(r => r.code === 'system-admin');
    
    if (hasSystemAdminRole) {
      console.log('  ✓ Already has system-admin role');
    } else {
      console.log('  ⚠ Missing system-admin role');
      if (!dryRun) {
        await permissionService.assignRole(admin._id, systemAdminRole._id, [], null, null);
        console.log('  ✓ Assigned system-admin role');
      } else {
        console.log('  [DRY-RUN] Would assign system-admin role');
      }
    }

    // Verify permissions
    const permissions = await permissionService.getUserPermissions(admin._id);
    const accessiblePages = await permissionService.getAccessiblePages(admin._id);
    
    console.log(`  Permissions: ${permissions.length} permission groups`);
    console.log(`  Accessible pages: ${accessiblePages.length} pages`);
    
    if (accessiblePages.length === 0) {
      console.log('  ⚠ WARNING: No accessible pages found!');
      console.log('     This might be because:');
      console.log('     1. The system-admin role has wildcard permissions (*.*)');
      console.log('     2. But getAccessiblePages needs to handle wildcards');
      console.log('     3. Or page permissions need to be explicitly added');
    } else {
      console.log(`  Accessible pages: ${accessiblePages.join(', ')}`);
    }
  }

  console.log('\n✓ Setup completed');
  if (dryRun) {
    console.log('  [DRY-RUN] No changes were made');
  }
}

async function run() {
  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.\n');
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  
  try {
    await setupAdminPermissions();
  } catch (err) {
    console.error('Error:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { setupAdminPermissions };
