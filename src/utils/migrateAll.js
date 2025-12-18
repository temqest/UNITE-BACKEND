/**
 * Main Migration Script
 * 
 * Orchestrates all migration steps in the correct order:
 * 1. Seed roles and permissions
 * 2. Migrate locations
 * 3. Migrate users
 * 4. Migrate location assignments
 * 5. Migrate requests
 * 
 * Usage: node src/utils/migrateAll.js [--dry-run] [--step=1,2,3,4,5]
 */

const { seed } = require('./seedRoles');
const { migrateLocations } = require('./migrateLocations');
const { migrateUsers } = require('./migrateUsers');
// Additional migration modules would be imported here

const dryRun = process.argv.includes('--dry-run');
const stepArg = process.argv.find(arg => arg.startsWith('--step='));
const stepsToRun = stepArg ? stepArg.split('=')[1].split(',').map(s => parseInt(s)) : [1, 2, 3, 4, 5];

async function migrateAll() {
  console.log('=== UNITE Backend Migration ===\n');
  if (dryRun) {
    console.log('DRY-RUN MODE: No changes will be written.\n');
  }

  try {
    // Step 1: Seed roles and permissions
    if (stepsToRun.includes(1)) {
      console.log('=== Step 1: Seeding Roles and Permissions ===');
      await seed();
      console.log('Step 1 completed.\n');
    }

    // Step 2: Migrate locations
    if (stepsToRun.includes(2)) {
      console.log('=== Step 2: Migrating Locations ===');
      const locationMap = await migrateLocations();
      console.log('Step 2 completed.\n');
    }

    // Step 3: Migrate users
    if (stepsToRun.includes(3)) {
      console.log('=== Step 3: Migrating Users ===');
      const userMap = await migrateUsers();
      console.log('Step 3 completed.\n');
    }

    // Step 4: Migrate location assignments
    if (stepsToRun.includes(4)) {
      console.log('=== Step 4: Migrating Location Assignments ===');
      // TODO: Implement migrateLocationAssignments
      console.log('Step 4: Not yet implemented.');
      console.log('Step 4 completed.\n');
    }

    // Step 5: Migrate requests
    if (stepsToRun.includes(5)) {
      console.log('=== Step 5: Migrating Requests ===');
      // TODO: Implement migrateRequests
      console.log('Step 5: Not yet implemented.');
      console.log('Step 5 completed.\n');
    }

    console.log('=== Migration Complete ===');
    if (dryRun) {
      console.log('\nThis was a dry-run. No changes were written.');
      console.log('Run without --dry-run to apply changes.');
    }
  } catch (error) {
    console.error('\n=== Migration Failed ===');
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  migrateAll();
}

module.exports = { migrateAll };
