/**
 * Creates an Admin account based on `src/utils/admin.json`.
 * Usage:
 *   node src/utils/createAdmin.js        # runs using env MONGODB_URI or MONGO_URI
 *   node src/utils/createAdmin.js --dry-run
 *
 * Edit `src/utils/admin.json` to change credentials before running.
 * 
 * This script creates a full admin account with:
 * - User account with all standard fields
 * - System admin flag set to true
 * - System admin role assigned (full permissions)
 * - Optional location assignments
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

const adminPath = path.join(__dirname, 'admin.json');
const dryRun = process.argv.includes('--dry-run');
const { User } = require('../models');
const permissionService = require('../services/users_services/permission.service');
const locationService = require('../services/utility_services/location.service');

// Accept multiple env names
const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
// Database name (optional) — allows connecting to a specific DB in the cluster
const dbName = process.env.MONGO_DB_NAME || process.env.MONGO_DB || process.env.DB_NAME || null;

function loadConfig() {
  if (fs.existsSync(adminPath)) {
    try {
      const raw = fs.readFileSync(adminPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse admin.json:', e.message);
      process.exit(1);
    }
  }
  console.error('No src/utils/admin.json found. Please create one.');
  process.exit(1);
}

async function createAdminAccount() {
  const cfg = loadConfig();
  const userData = cfg.user || {};
  const adminData = cfg.admin || {};
  const roles = cfg.roles || ['system-admin'];
  const locations = cfg.locations || [];

  console.log('Configuration to use:');
  console.log(JSON.stringify({ 
    user: { 
      firstName: userData.firstName, 
      lastName: userData.lastName, 
      email: userData.email 
    }, 
    admin: adminData,
    roles: roles,
    locations: locations.length > 0 ? locations : 'none'
  }, null, 2));

  // Log which database will be used (shows even for --dry-run)
  console.log('Database to use:', dbName ? dbName : '(from URI)');

  if (dryRun) {
    console.log('--dry-run provided; exiting without writing to DB.');
    return;
  }

  console.log('Connecting to DB:', uri.replace(/(mongodb\+srv:\/\/.*?:).*@/, '$1****@'), dbName ? `(using database: ${dbName})` : '');
  const connectOptions = { useNewUrlParser: true, useUnifiedTopology: true };
  if (dbName) connectOptions.dbName = dbName;
  await mongoose.connect(uri, connectOptions);

  try {
    // Check if email already exists
    const existingUser = await User.findByEmail(userData.email);
    if (existingUser) {
      console.error(`Error: User with email ${userData.email} already exists.`);
      process.exit(1);
    }

    // Validate required fields
    if (!userData.firstName || !userData.lastName || !userData.email || !userData.password) {
      console.error('Error: Missing required fields. firstName, lastName, email, and password are required.');
      process.exit(1);
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(userData.password, saltRounds);

    // Create user
    const user = new User({
      email: userData.email.toLowerCase(),
      firstName: userData.firstName,
      middleName: userData.middleName || null,
      lastName: userData.lastName,
      phoneNumber: userData.phoneNumber || null,
      password: hashedPassword,
      organizationType: userData.organizationType || null,
      organizationInstitution: userData.organizationInstitution || null,
      field: userData.field || null,
      isSystemAdmin: adminData.isSystemAdmin !== undefined ? adminData.isSystemAdmin : true,
      isActive: true,
      metadata: {
        accessLevel: adminData.accessLevel || 'super',
        ...(adminData.metadata || {})
      }
    });

    await user.save();
    console.log('✓ User created successfully');

    // Assign roles
    if (roles.length > 0) {
      console.log(`Assigning ${roles.length} role(s)...`);
      for (const roleCode of roles) {
        const role = await permissionService.getRoleByCode(roleCode);
        if (role) {
          await permissionService.assignRole(user._id, role._id, [], null, null);
          console.log(`  ✓ Assigned role: ${roleCode} (${role.name})`);
        } else {
          console.warn(`  ⚠ Role not found: ${roleCode}. Make sure to run seedRoles.js first.`);
        }
      }
    }

    // Assign locations if provided
    if (locations.length > 0) {
      console.log(`Assigning ${locations.length} location(s)...`);
      for (const loc of locations) {
        try {
          await locationService.assignUserToLocation(
            user._id,
            loc.locationId,
            loc.scope || 'exact',
            { isPrimary: loc.isPrimary || false }
          );
          console.log(`  ✓ Assigned location: ${loc.locationId}`);
        } catch (error) {
          console.warn(`  ⚠ Failed to assign location ${loc.locationId}: ${error.message}`);
        }
      }
    }

    // Get user roles and permissions for display
    const userRoles = await permissionService.getUserRoles(user._id);
    const userPermissions = await permissionService.getUserPermissions(user._id);

    // Prepare response
    const userResponse = user.toObject({ virtuals: true });
    delete userResponse.password;

    console.log('\n=== Admin Account Created Successfully ===');
    console.log('User Details:');
    console.log(JSON.stringify({
      _id: userResponse._id,
      email: userResponse.email,
      firstName: userResponse.firstName,
      lastName: userResponse.lastName,
      fullName: userResponse.fullName || `${userResponse.firstName} ${userResponse.middleName ? userResponse.middleName + ' ' : ''}${userResponse.lastName}`,
      isSystemAdmin: userResponse.isSystemAdmin,
      isActive: userResponse.isActive,
      metadata: userResponse.metadata
    }, null, 2));

    console.log('\nAssigned Roles:');
    userRoles.forEach(role => {
      console.log(`  - ${role.code}: ${role.name}`);
    });

    console.log('\nPermissions Summary:');
    const permissionSummary = {};
    userPermissions.forEach(perm => {
      permissionSummary[perm.resource] = perm.actions;
    });
    console.log(JSON.stringify(permissionSummary, null, 2));

    console.log('\nCredentials (from config):');
    console.log(JSON.stringify({
      email: userData.email,
      password: userData.password
    }, null, 2));

    console.log('\n⚠️  IMPORTANT: Save these credentials securely. The password is shown only once.');

    return {
      user: userResponse,
      roles: userRoles,
      permissions: userPermissions,
      credentials: {
        email: userData.email,
        password: userData.password
      }
    };
  } catch (err) {
    console.error('Failed to create admin account:', err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

async function run() {
  try {
    await createAdminAccount();
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { createAdminAccount };
