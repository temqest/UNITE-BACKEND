/**
 * Diagnostic script to check why a coordinator is not appearing in the Coordinator table
 * 
 * Usage: node src/utils/diagnose-coordinator.js <coordinator-email-or-id>
 */

const mongoose = require('mongoose');
require('dotenv').config();

const { User, UserRole, Role } = require('../models/index');

async function diagnoseCoordinator(identifier) {
  try {
    // Connect to MongoDB - using the same pattern as server.js
    const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
    const mongoDbName = process.env.MONGO_DB_NAME || 'unite-test-v2';
    
    if (!rawMongoUri) {
      console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
      console.error('Please set MONGODB_URI or MONGO_URI in your .env file');
      process.exit(1);
    }
    
    // If a DB name is provided separately and the URI does not already contain a DB path, append it.
    // This matches the logic in server.js
    let MONGO_URI = rawMongoUri;
    if (mongoDbName) {
      // Determine if the URI already has a database name portion (i.e. after the host and before query '?')
      const idx = rawMongoUri.indexOf('?');
      const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
      // If there is no DB portion (no slash followed by non-empty segment after the host), append one.
      const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
      if (!hasDb) {
        if (idx === -1) {
          MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
        } else {
          MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
        }
      } else {
        // Replace existing database name with the one from MONGO_DB_NAME
        const parts = beforeQuery.split('/');
        parts[parts.length - 1] = mongoDbName;
        MONGO_URI = idx === -1 ? parts.join('/') : `${parts.join('/')}${rawMongoUri.slice(idx)}`;
      }
      console.log(`Using database name from MONGO_DB_NAME: ${mongoDbName}`);
    }
    
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log(`✅ Connected to MongoDB database: ${mongoose.connection.name}\n`);

    // Find the coordinator user
    let user = null;
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      user = await User.findById(identifier);
    }
    if (!user) {
      user = await User.findOne({ email: identifier });
    }
    if (!user) {
      user = await User.findOne({ userId: identifier });
    }

    if (!user) {
      console.log(`❌ User not found: ${identifier}`);
      return;
    }

    console.log('=== USER DOCUMENT ===');
    console.log(`ID: ${user._id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.firstName} ${user.lastName}`);
    console.log(`isActive: ${user.isActive}`);
    console.log(`isSystemAdmin: ${user.isSystemAdmin}`);
    console.log('');

    // Check UserRole assignments
    console.log('=== USER ROLE ASSIGNMENTS ===');
    const userRoles = await UserRole.find({ userId: user._id })
      .populate('roleId')
      .sort({ createdAt: -1 });

    if (userRoles.length === 0) {
      console.log('❌ NO USERROLE ASSIGNMENTS FOUND!');
      console.log('This is the problem - the coordinator needs a role assignment.');
      console.log('');
      console.log('To fix: Assign a role with operational permissions (e.g., "coordinator" role)');
      return;
    }

    console.log(`Found ${userRoles.length} UserRole assignment(s):\n`);
    
    for (const ur of userRoles) {
      const role = ur.roleId;
      console.log(`UserRole ID: ${ur._id}`);
      console.log(`  - Role: ${role ? role.code : 'N/A'} (${role ? role.name : 'N/A'})`);
      console.log(`  - isActive: ${ur.isActive}`);
      console.log(`  - expiresAt: ${ur.expiresAt || 'Never'}`);
      console.log(`  - assignedAt: ${ur.assignedAt}`);
      
      if (!ur.isActive) {
        console.log('  ⚠️  WARNING: This UserRole is INACTIVE');
      }
      
      if (ur.expiresAt && ur.expiresAt < new Date()) {
        console.log('  ⚠️  WARNING: This UserRole has EXPIRED');
      }
      
      if (role) {
        console.log(`  - Role Permissions (${role.permissions?.length || 0}):`);
        if (role.permissions && role.permissions.length > 0) {
          // Check for operational permissions
          const operationalPerms = role.permissions.filter(p => 
            (p.resource === 'request' && p.actions.includes('create')) ||
            (p.resource === 'event' && (p.actions.includes('create') || p.actions.includes('update'))) ||
            (p.resource === 'staff' && (p.actions.includes('create') || p.actions.includes('update'))) ||
            (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('create')))
          );
          
          if (operationalPerms.length > 0) {
            console.log('    ✓ Has operational permissions:');
            operationalPerms.forEach(p => {
              console.log(`      - ${p.resource}: [${p.actions.join(', ')}]`);
            });
          } else {
            console.log('    ❌ NO OPERATIONAL PERMISSIONS FOUND!');
            console.log('    This role does not have request.create, event.create, or staff.create permissions.');
          }
        } else {
          console.log('    ❌ Role has NO permissions');
        }
      } else {
        console.log('  ❌ Role not found or not populated');
      }
      console.log('');
    }

    // Check active role assignments
    const activeUserRoles = userRoles.filter(ur => 
      ur.isActive && 
      (!ur.expiresAt || ur.expiresAt > new Date()) &&
      ur.roleId
    );

    console.log(`=== ACTIVE ROLE ASSIGNMENTS ===`);
    console.log(`Found ${activeUserRoles.length} active role assignment(s)\n`);

    if (activeUserRoles.length === 0) {
      console.log('❌ NO ACTIVE ROLE ASSIGNMENTS!');
      console.log('The coordinator needs at least one active, non-expired role assignment.');
      return;
    }

    // Test permission lookup
    console.log('=== PERMISSION LOOKUP TEST ===');
    const permissionService = require('../services/users_services/permission.service');
    
    const testCapabilities = ['request.create', 'event.create', 'event.update', 'staff.create', 'staff.update'];
    
    for (const cap of testCapabilities) {
      const userIds = await permissionService.getUsersWithPermission(cap, {});
      const hasPermission = userIds.some(id => id.toString() === user._id.toString());
      console.log(`${cap}: ${hasPermission ? '✓' : '❌'} ${hasPermission ? 'User has this permission' : 'User does NOT have this permission'}`);
    }

    console.log('\n=== SUMMARY ===');
    const hasOperationalPerms = activeUserRoles.some(ur => {
      const role = ur.roleId;
      if (!role || !role.permissions) return false;
      return role.permissions.some(p => 
        (p.resource === 'request' && p.actions.includes('create')) ||
        (p.resource === 'event' && (p.actions.includes('create') || p.actions.includes('update'))) ||
        (p.resource === 'staff' && (p.actions.includes('create') || p.actions.includes('update'))) ||
        (p.resource === '*' && (p.actions.includes('*') || p.actions.includes('create')))
      );
    });

    if (hasOperationalPerms && activeUserRoles.length > 0) {
      console.log('✓ Coordinator should appear in the list');
      console.log('If not appearing, check:');
      console.log('  1. Authority filtering (should allow system admins to see all)');
      console.log('  2. Backend logs for permission lookup results');
    } else {
      console.log('❌ Coordinator will NOT appear because:');
      if (activeUserRoles.length === 0) {
        console.log('  - No active role assignments');
      } else {
        console.log('  - Role(s) do not have operational permissions');
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Get identifier from command line
const identifier = process.argv[2];
if (!identifier) {
  console.log('Usage: node src/utils/diagnose-coordinator.js <coordinator-email-or-id>');
  console.log('Example: node src/utils/diagnose-coordinator.js patrickkurtv@gmail.com');
  process.exit(1);
}

diagnoseCoordinator(identifier);

