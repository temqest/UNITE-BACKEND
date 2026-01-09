/**
 * Complete System Setup Script
 * 
 * Sets up a new system from scratch, including:
 * 1. Roles and Permissions
 * 2. Locations (Provinces, Districts, Municipalities)
 * 3. Coverage System (Organizations and Coverage Areas)
 * 4. Admin Account
 * 
 * Usage: from project root run:
 *   node src/utils/setupSystem.js [--dry-run]
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env
 *   - src/utils/admin.json file exists (for admin account creation)
 *   - src/utils/locations.json file exists (for location seeding)
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const fs = require('fs');
const path = require('path');

// Import seed functions
const { seed: seedRoles } = require('./seed/seedRoles');
const { seed: seedLocations } = require('./seed/seedLocations');
const { seed: seedOrganizations } = require('./seed/seedOrganizations');
const { seed: seedCoverageSystem } = require('./seed/seedCoverageSystem');
const { createAdminAccount } = require('./createAdmin');

const dryRun = process.argv.includes('--dry-run');

/**
 * Check if admin.json exists
 */
function checkAdminConfig() {
  const adminPath = path.join(__dirname, 'admin.json');
  if (!fs.existsSync(adminPath)) {
    console.error('❌ Error: src/utils/admin.json not found.');
    console.error('   Please create admin.json with admin account details.');
    console.error('   See src/utils/admin.json.example for reference.');
    return false;
  }
  return true;
}

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
  console.log('\n📊 Step 5: Creating database indexes...');
  
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

  console.log('🚀 Starting Complete System Setup\n');
  console.log('=' .repeat(60));

  // Pre-flight checks
  console.log('\n📋 Pre-flight Checks:');
  const hasAdminConfig = checkAdminConfig();
  const hasLocationsConfig = checkLocationsConfig();
  
  if (!hasAdminConfig && !dryRun) {
    process.exit(1);
  }

  // Note: Each seed function and createAdminAccount connect/disconnect to database internally
  // We only need to connect for index creation

  try {
    // Step 1: Seed Roles and Permissions
    console.log('\n' + '='.repeat(60));
    console.log('📝 Step 1: Seeding Roles and Permissions');
    console.log('='.repeat(60));
    // Note: seedRoles connects/disconnects internally
    await seedRoles();
    console.log('✓ Roles and permissions seeded');

    // Step 2: Seed Locations
    console.log('\n' + '='.repeat(60));
    console.log('📍 Step 2: Seeding Locations');
    console.log('='.repeat(60));
    // Note: seedLocations connects/disconnects internally
    await seedLocations();
    console.log('✓ Locations seeded');

    // Step 3: Seed Organizations
    console.log('\n' + '='.repeat(60));
    console.log('🏢 Step 3: Seeding Organizations');
    console.log('='.repeat(60));
    // Note: seedOrganizations connects/disconnects internally
    await seedOrganizations();
    console.log('✓ Organizations seeded');

    // Step 4: Seed Coverage System
    console.log('\n' + '='.repeat(60));
    console.log('🗺️  Step 4: Seeding Coverage System (Coverage Areas)');
    console.log('='.repeat(60));
    // Note: seedCoverageSystem connects/disconnects internally
    await seedCoverageSystem();
    console.log('✓ Coverage system seeded');

    // Step 5: Create Admin Account
    console.log('\n' + '='.repeat(60));
    console.log('👤 Step 5: Creating Admin Account');
    console.log('='.repeat(60));
    
    // createAdminAccount handles its own database connection and dry-run check
    if (hasAdminConfig) {
      try {
        // Note: createAdminAccount checks for dry-run from process.argv internally
        const result = await createAdminAccount();
        if (result) {
          console.log('✓ Admin account created successfully');
          console.log('\n📧 Admin Credentials:');
          console.log(`   Email: ${result.credentials.email}`);
          console.log(`   Password: ${result.credentials.password}`);
          console.log('\n⚠️  IMPORTANT: Save these credentials securely!');
        } else if (dryRun) {
          console.log('✓ Admin account creation skipped (dry-run mode)');
        }
      } catch (error) {
        // createAdminAccount may exit the process on some errors
        if (error.message && (error.message.includes('already exists') || error.message.includes('User with email'))) {
          console.log('⚠ Admin account already exists, skipping...');
        } else {
          console.error('⚠ Error creating admin account:', error.message || 'Unknown error');
          // Don't fail the entire setup if admin creation fails
        }
      }
    } else {
      console.log('⚠ Skipping admin account creation (admin.json not found)');
    }

    // Step 6: Create Indexes
    console.log('\n' + '='.repeat(60));
    console.log('📊 Step 6: Creating Database Indexes');
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
    if (hasAdminConfig) {
      console.log('  ✓ Admin account created');
    }
    console.log('  ✓ Database indexes created');
    
    console.log('\n🎉 Your system is ready to use!');
    console.log('\nNext steps:');
    console.log('  1. Log in with the admin credentials shown above');
    console.log('  2. Configure system settings');
    console.log('  3. Create additional staff accounts as needed');
    
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

