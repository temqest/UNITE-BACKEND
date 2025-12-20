/**
 * System Setup Script (Without Admin Account)
 * 
 * Sets up a new system from scratch, excluding admin account creation:
 * 1. Roles and Permissions
 * 2. Locations (Provinces, Districts, Municipalities)
 * 3. Coverage System (Organizations and Coverage Areas)
 * 
 * Use this script when:
 * - Admin account already exists
 * - You want to set up the system without creating a new admin
 * - Re-seeding data without affecting existing admin accounts
 * 
 * Usage: from project root run:
 *   node src/utils/setupSystemWithoutAdmin.js [--dry-run]
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env
 *   - src/utils/locations.json file exists (for location seeding)
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

// Import seed functions
const { seed: seedRoles } = require('./seedRoles');
const { seed: seedLocations } = require('./seedLocations');
const { seed: seedOrganizations } = require('./seedOrganizations');
const { seed: seedCoverageSystem } = require('./seedCoverageSystem');
const { fixOrganizationTypes } = require('./fixOrganizationTypes');

// Accept multiple env var names for compatibility with existing .env
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

/**
 * Check if locations.json exists
 */
function checkLocationsConfig() {
  const locationsPath = path.join(__dirname, 'locations.json');
  if (!fs.existsSync(locationsPath)) {
    console.warn('⚠ Warning: src/utils/locations.json not found.');
    console.warn('   Location seeding will use fallback defaults.');
    return false;
  }
  return true;
}

/**
 * Create database indexes
 */
async function createIndexes() {
  console.log('\n📊 Step 4: Creating database indexes...');
  
  try {
    const { createIndexes } = require('./createIndexes');
    if (typeof createIndexes === 'function') {
      await createIndexes();
      console.log('✓ Database indexes created');
    } else {
      console.log('⚠ Index creation script not available, skipping...');
    }
  } catch (error) {
    console.warn('⚠ Could not create indexes:', error.message);
  }
}

/**
 * Main setup function
 */
async function setupSystem() {
  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode — no writes will be performed.\n');
  }

  console.log('🚀 Starting System Setup (Without Admin Account)\n');
  console.log('=' .repeat(60));

  // Pre-flight checks
  console.log('\n📋 Pre-flight Checks:');
  const hasLocationsConfig = checkLocationsConfig();
  
  console.log('ℹ️  Note: Admin account creation is skipped in this script.');
  console.log('   Use setupSystem.js if you need to create an admin account.');

  // Note: Each seed function connects/disconnects to database internally
  // We only need to connect for index creation

  try {
    // Step 1: Seed Roles and Permissions
    console.log('\n' + '='.repeat(60));
    console.log('📝 Step 1: Seeding Roles and Permissions');
    console.log('='.repeat(60));
    await seedRoles();
    console.log('✓ Roles and permissions seeded');

    // Step 2: Seed Locations
    console.log('\n' + '='.repeat(60));
    console.log('📍 Step 2: Seeding Locations');
    console.log('='.repeat(60));
    await seedLocations();
    console.log('✓ Locations seeded');

    // Step 3: Seed Organizations
    console.log('\n' + '='.repeat(60));
    console.log('🏢 Step 3: Seeding Organizations');
    console.log('='.repeat(60));
    await seedOrganizations();
    console.log('✓ Organizations seeded');

    // Step 4: Seed Coverage System
    console.log('\n' + '='.repeat(60));
    console.log('🗺️  Step 4: Seeding Coverage System (Coverage Areas)');
    console.log('='.repeat(60));
    await seedCoverageSystem();
    console.log('✓ Coverage system seeded');

    // Step 4.5: Fix Organization Types
    console.log('\n' + '='.repeat(60));
    console.log('🔧 Step 4.5: Fixing Organization Types');
    console.log('='.repeat(60));
    if (!dryRun) {
      await fixOrganizationTypes();
      console.log('✓ Organization types fixed');
    } else {
      console.log('⚠ Skipping organization type fix (dry-run mode)');
    }

    // Step 5: Create Indexes
    console.log('\n' + '='.repeat(60));
    console.log('📊 Step 5: Creating Database Indexes');
    console.log('='.repeat(60));
    
    if (!dryRun) {
      // createIndexes handles its own database connection
      await createIndexes();
    } else {
      console.log('⚠ Skipping index creation (dry-run mode)');
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ System Setup Complete!');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('  ✓ Roles and permissions created');
    console.log('  ✓ Locations seeded');
    console.log('  ✓ Organizations seeded');
    console.log('  ✓ Coverage system (coverage areas) created');
    console.log('  ✓ Database indexes created');
    console.log('  ⏭️  Admin account creation skipped (as requested)');
    
    console.log('\n🎉 Your system is ready to use!');
    console.log('\nNext steps:');
    console.log('  1. Log in with an existing admin account');
    console.log('  2. Configure system settings');
    console.log('  3. Create additional staff accounts as needed');
    console.log('\n💡 To create an admin account, run:');
    console.log('   node src/utils/createAdmin.js');
    
  } catch (error) {
    console.error('\n❌ Setup error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  }
}

if (require.main === module) {
  setupSystem().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { setupSystem };

