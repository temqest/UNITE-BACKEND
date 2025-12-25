/**
 * Seed Roles and Permissions
 * 
 * Creates default roles and permissions for the RBAC system.
 * Usage: from project root run:
 *   node src/utils/seedRoles.js [--dry-run]
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const mongoose = require('mongoose');
const { Role, Permission } = require('../models');
const { connect, disconnect, getConnectionUri } = require('./dbConnection');

const dryRun = process.argv.includes('--dry-run');

// Default permissions to create
const defaultPermissions = [
  // Event permissions
  { code: 'event.create', name: 'Create Event', resource: 'event', action: 'create', description: 'Create new events' },
  { code: 'event.read', name: 'Read Event', resource: 'event', action: 'read', description: 'View events' },
  { code: 'event.update', name: 'Update Event', resource: 'event', action: 'update', description: 'Update existing events' },
  { code: 'event.delete', name: 'Delete Event', resource: 'event', action: 'delete', description: 'Delete events' },
  { code: 'event.approve', name: 'Approve Event', resource: 'event', action: 'approve', description: 'Approve events' },
  { code: 'event.publish', name: 'Publish Event', resource: 'event', action: 'publish', description: 'Publish and finalize events for public visibility' },
  
  // Request permissions
  { code: 'request.create', name: 'Create Request', resource: 'request', action: 'create', description: 'Create new requests' },
  { code: 'request.read', name: 'Read Request', resource: 'request', action: 'read', description: 'View requests' },
  { code: 'request.update', name: 'Update Request', resource: 'request', action: 'update', description: 'Update existing requests' },
  { code: 'request.delete', name: 'Delete Request', resource: 'request', action: 'delete', description: 'Delete requests' },
  { code: 'request.review', name: 'Review Request', resource: 'request', action: 'review', description: 'Review requests' },
  { code: 'request.approve', name: 'Approve Request', resource: 'request', action: 'approve', description: 'Approve requests' },
  { code: 'request.reject', name: 'Reject Request', resource: 'request', action: 'reject', description: 'Reject requests' },
  { code: 'request.reschedule', name: 'Reschedule Request', resource: 'request', action: 'reschedule', description: 'Reschedule requests' },
  { code: 'request.cancel', name: 'Cancel Request', resource: 'request', action: 'cancel', description: 'Cancel requests' },
  { code: 'request.confirm', name: 'Confirm Request', resource: 'request', action: 'confirm', description: 'Confirm request actions' },
  { code: 'request.decline', name: 'Decline Request', resource: 'request', action: 'decline', description: 'Decline request actions' },
  
  // User permissions
  { code: 'user.create', name: 'Create User', resource: 'user', action: 'create', description: 'Create new users' },
  { code: 'user.read', name: 'Read User', resource: 'user', action: 'read', description: 'View users' },
  { code: 'user.update', name: 'Update User', resource: 'user', action: 'update', description: 'Update existing users' },
  { code: 'user.delete', name: 'Delete User', resource: 'user', action: 'delete', description: 'Delete users' },
  { code: 'user.manage-roles', name: 'Manage User Roles', resource: 'user', action: 'manage-roles', description: 'Assign and revoke user roles' },
  
  // Location permissions
  { code: 'location.create', name: 'Create Location', resource: 'location', action: 'create', description: 'Create new locations' },
  { code: 'location.read', name: 'Read Location', resource: 'location', action: 'read', description: 'View locations' },
  { code: 'location.update', name: 'Update Location', resource: 'location', action: 'update', description: 'Update existing locations' },
  { code: 'location.delete', name: 'Delete Location', resource: 'location', action: 'delete', description: 'Delete locations' },
  
  // Role permissions
  { code: 'role.create', name: 'Create Role', resource: 'role', action: 'create', description: 'Create new roles' },
  { code: 'role.read', name: 'Read Role', resource: 'role', action: 'read', description: 'View roles' },
  { code: 'role.update', name: 'Update Role', resource: 'role', action: 'update', description: 'Update existing roles' },
  { code: 'role.delete', name: 'Delete Role', resource: 'role', action: 'delete', description: 'Delete roles' },
  
  // Chat permissions
  { code: 'chat.create', name: 'Create Chat Message', resource: 'chat', action: 'create', description: 'Send chat messages' },
  { code: 'chat.read', name: 'Read Chat', resource: 'chat', action: 'read', description: 'View chat messages and conversations' },
  { code: 'chat.update', name: 'Update Chat Message', resource: 'chat', action: 'update', description: 'Update chat messages (e.g., mark as read)' },
  { code: 'chat.delete', name: 'Delete Chat Message', resource: 'chat', action: 'delete', description: 'Delete chat messages' },
  
  // System permissions
  { code: 'system.settings', name: 'Manage System Settings', resource: 'system', action: 'settings', description: 'Manage system settings' },
  { code: 'system.audit', name: 'View Audit Logs', resource: 'system', action: 'audit', description: 'View system audit logs' },
  
  // Settings permissions
  { code: 'settings.edit-requesting', name: 'Edit Requesting Settings', resource: 'settings', action: 'edit-requesting', description: 'Edit requesting settings' },
  { code: 'settings.edit-location', name: 'Edit Location Settings', resource: 'settings', action: 'edit-location', description: 'Edit location settings' },
  { code: 'settings.edit-staff', name: 'Edit Staff Settings', resource: 'settings', action: 'edit-staff', description: 'Edit staff settings' },
  
  // Page permissions
  { code: 'page.dashboard', name: 'Access Dashboard', resource: 'page', action: 'dashboard', type: 'page', description: 'Access main dashboard page' },
  { code: 'page.campaign', name: 'Access Campaign Page', resource: 'page', action: 'campaign', type: 'page', description: 'Access campaign/requests page' },
  { code: 'page.calendar', name: 'Access Calendar Page', resource: 'page', action: 'calendar', type: 'page', description: 'Access calendar page' },
  { code: 'page.events', name: 'Access Events Page', resource: 'page', action: 'events', type: 'page', description: 'Access events management page' },
  { code: 'page.requests', name: 'Access Requests Page', resource: 'page', action: 'requests', type: 'page', description: 'Access requests management page' },
  { code: 'page.users', name: 'Access Users Page', resource: 'page', action: 'users', type: 'page', description: 'Access users management page' },
  { code: 'page.inventory', name: 'Access Inventory Page', resource: 'page', action: 'inventory', type: 'page', description: 'Access blood bag inventory page' },
  { code: 'page.locations', name: 'Access Locations Page', resource: 'page', action: 'locations', type: 'page', description: 'Access locations management page' },
  { code: 'page.reports', name: 'Access Reports Page', resource: 'page', action: 'reports', type: 'page', description: 'Access reports and analytics page' },
  { code: 'page.settings', name: 'Access Settings Page', resource: 'page', action: 'settings', type: 'page', description: 'Access system settings page' },
  { code: 'page.chat', name: 'Access Chat Page', resource: 'page', action: 'chat', type: 'page', description: 'Access chat/messaging page' },
  { code: 'page.notification', name: 'Access Notifications Page', resource: 'page', action: 'notification', type: 'page', description: 'Access notifications page' },
  { code: 'page.stakeholder-management', name: 'Access Stakeholder Management Page', resource: 'page', action: 'stakeholder-management', type: 'page', description: 'Access stakeholder management page' },
  { code: 'page.coordinator-management', name: 'Access Coordinator Management Page', resource: 'page', action: 'coordinator-management', type: 'page', description: 'Access coordinator management page' },
  
  // Feature permissions
  { code: 'feature.create-event', name: 'Create Event Feature', resource: 'feature', action: 'create-event', type: 'feature', description: 'Can create new events' },
  { code: 'feature.request-blood', name: 'Request Blood Feature', resource: 'feature', action: 'request-blood', type: 'feature', description: 'Can request blood bags' },
  { code: 'feature.manage-inventory', name: 'Manage Inventory Feature', resource: 'feature', action: 'manage-inventory', type: 'feature', description: 'Can manage blood bag inventory' },
  { code: 'feature.view-reports', name: 'View Reports Feature', resource: 'feature', action: 'view-reports', type: 'feature', description: 'Can view reports and analytics' },
  { code: 'feature.export-data', name: 'Export Data Feature', resource: 'feature', action: 'export-data', type: 'feature', description: 'Can export data' },
  { code: 'feature.send-notifications', name: 'Send Notifications Feature', resource: 'feature', action: 'send-notifications', type: 'feature', description: 'Can send system notifications' },
  
  // Staff management permissions
  { code: 'staff.create', name: 'Create Staff', resource: 'staff', action: 'create', type: 'staff', description: 'Create new staff members', metadata: {} },
  { code: 'staff.read', name: 'Read Staff', resource: 'staff', action: 'read', type: 'staff', description: 'View staff members' },
  { code: 'staff.update', name: 'Update Staff', resource: 'staff', action: 'update', type: 'staff', description: 'Update existing staff members', metadata: {} },
  { code: 'staff.delete', name: 'Delete Staff', resource: 'staff', action: 'delete', type: 'staff', description: 'Delete staff members', metadata: {} },
];

// Default roles to create
// Authority mapping:
// - system-admin: 100 (System Administrator)
// - coordinator: 60 (Coordinator)
// - stakeholder: 30 (Stakeholder)
const defaultRoles = [
  {
    code: 'system-admin',
    name: 'System Administrator',
    description: 'Full system access with all permissions',
    isSystemRole: true,
    authority: 100,
    permissions: [
      { resource: '*', actions: ['*'] } // Full access
    ]
  },
  {
    code: 'coordinator',
    name: 'Coordinator',
    description: 'Event and request coordinator with review and approval capabilities',
    isSystemRole: true,
    authority: 60,
    permissions: [
      { resource: 'event', actions: ['create', 'read', 'update', 'approve', 'publish'] },
      { resource: 'request', actions: ['create', 'read', 'review', 'approve', 'reject', 'reschedule'] },
      { resource: 'user', actions: ['read'] },
      { resource: 'location', actions: ['read'] },
      { resource: 'chat', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'page', actions: ['campaign', 'calendar', 'chat', 'notification', 'settings', 'stakeholder-management'] },
      { resource: 'feature', actions: ['create-event', 'request-blood', 'view-reports'] },
      { resource: 'staff', actions: ['read', 'create', 'update', 'delete'], metadata: { allowedStaffTypes: ['stakeholder'] } }
    ]
  },
  {
    code: 'stakeholder',
    name: 'Stakeholder',
    description: 'Stakeholder with event creation and request confirmation capabilities',
    isSystemRole: true,
    authority: 30,
    permissions: [
      { resource: 'event', actions: ['create', 'read'] },
      { resource: 'request', actions: ['create', 'read', 'confirm', 'decline'] },
      { resource: 'chat', actions: ['create', 'read', 'update', 'delete'] },
      { resource: 'page', actions: ['campaign', 'calendar', 'chat', 'notification', 'settings'] },
      { resource: 'feature', actions: ['create-event', 'request-blood'] }
    ]
  }
];

async function seedPermissions() {
  console.log('Seeding permissions...');
  
  for (const permData of defaultPermissions) {
    const existing = await Permission.findOne({ code: permData.code });
    
    if (existing) {
      console.log(`  Permission exists: ${permData.code}`);
    } else {
      console.log(`  Will create permission: ${permData.code} (${permData.resource}.${permData.action})`);
      if (!dryRun) {
        await Permission.create(permData);
      }
    }
  }
  
  console.log(`Permissions seeding ${dryRun ? 'dry-run' : ''} completed`);
}

async function seedRoles() {
  console.log('Seeding roles...');
  
  for (const roleData of defaultRoles) {
    const existing = await Role.findOne({ code: roleData.code });
    
    if (existing) {
      console.log(`  Role exists: ${roleData.code} (${roleData.name})`);
      let needsUpdate = false;
      
      // Update permissions if they've changed
      if (!dryRun && JSON.stringify(existing.permissions) !== JSON.stringify(roleData.permissions)) {
        console.log(`    Updating permissions for role: ${roleData.code}`);
        existing.permissions = roleData.permissions;
        needsUpdate = true;
      }
      
      // Update authority if it doesn't match expected value
      if (roleData.authority !== undefined && existing.authority !== roleData.authority) {
        console.log(`    Updating authority for role: ${roleData.code} (current: ${existing.authority || 'not set'}, expected: ${roleData.authority})`);
        existing.authority = roleData.authority;
        needsUpdate = true;
      }
      
      if (needsUpdate && !dryRun) {
        await existing.save();
        console.log(`    ✓ Role updated: ${roleData.code}`);
      }
    } else {
      console.log(`  Will create role: ${roleData.code} (${roleData.name}) with authority ${roleData.authority || 'default'}`);
      if (!dryRun) {
        await Role.create(roleData);
      }
    }
  }
  
  console.log(`Roles seeding ${dryRun ? 'dry-run' : ''} completed`);
}

async function seed() {
  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.');
  }

  const uri = getConnectionUri();
  await connect(uri);

  try {
    await seedPermissions();
    await seedRoles();
    
    console.log(dryRun ? 'Dry-run completed. No changes written.' : 'Seeding completed successfully.');
  } catch (err) {
    console.error('Seeding error:', err);
    throw err;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { seed, defaultPermissions, defaultRoles };
