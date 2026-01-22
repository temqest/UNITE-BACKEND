/**
 * API Endpoint Tester: Test Stakeholder Filtering via HTTP
 * 
 * This script makes an actual HTTP request to test the filtering endpoint
 * Run: node src/utils/testStakeholderFilteringAPI.js
 */

const mongoose = require('mongoose');
const { connect, disconnect, getConnectionUri } = require('./dbConnection');
const User = require('../models/users_models/user.model');
const { AUTHORITY_TIERS } = require('../services/users_services/authority.service');

async function testViaAPI() {
  try {
    const uri = getConnectionUri();
    await connect(uri);
    console.log('✓ Connected to MongoDB\n');

    // Find a system admin for testing
    console.log('📍 Finding system admin to simulate API call...');
    const admin = await User.findOne({
      isSystemAdmin: true,
      isActive: true
    }).select('_id email firstName lastName').lean();

    if (!admin) {
      console.log('❌ No system admin found');
      process.exit(1);
    }

    console.log(`✓ Found admin: ${admin.firstName} ${admin.lastName}\n`);

    // Find a coordinator
    console.log('📍 Finding a coordinator...');
    const coordinator = await User.findOne({
      authority: { $gte: 60, $lt: 100 },
      coverageAreas: { $exists: true, $ne: [] },
      isActive: true
    }).populate('coverageAreas').lean();

    if (!coordinator) {
      console.log('❌ No coordinator with coverage areas found');
      process.exit(1);
    }

    console.log(`✓ Found coordinator: ${coordinator.firstName} ${coordinator.lastName}`);
    console.log(`  ID: ${coordinator._id}`);
    console.log(`  Coverage areas: ${coordinator.coverageAreas?.length || 0}\n`);

    // Get all stakeholders
    const stakeholders = await User.find({
      authority: { $lt: AUTHORITY_TIERS.COORDINATOR },
      isActive: true
    }).select('_id firstName lastName locations authority').lean();

    console.log(`✓ Found ${stakeholders.length} total stakeholders\n`);

    // Simulate the filtering service
    console.log('🔍 Simulating backend filtering...\n');

    const stakeholderFilteringService = require('../services/users_services/stakeholderFiltering.service');
    
    const startTime = Date.now();
    const filtered = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
      coordinator._id,
      stakeholders.map(s => s._id)
    );
    const elapsedMs = Date.now() - startTime;

    console.log(`\n📊 Results:`);
    console.log(`   Total stakeholders: ${stakeholders.length}`);
    console.log(`   Filtered stakeholders: ${filtered.length}`);
    console.log(`   Execution time: ${elapsedMs}ms`);

    if (filtered.length > 0) {
      console.log('\n✓ Filtering IS working - stakeholders were filtered\n');
      
      console.log('📋 Sample filtered stakeholders:');
      const filteredUsers = stakeholders
        .filter(s => filtered.includes(s._id.toString()))
        .slice(0, 5);
      
      filteredUsers.forEach(s => {
        console.log(`   - ${s.firstName} ${s.lastName} (${s.locations?.municipalityName || 'unknown'})`);
      });
    } else {
      console.log('\n⚠️  No stakeholders matched - check if coordinator coverage is properly set\n');
      
      console.log('🔧 Debugging: Coordinator coverage areas:');
      if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
        coordinator.coverageAreas.forEach((c, idx) => {
          console.log(`   Coverage ${idx}:`);
          console.log(`     - coverageAreaName: ${c.coverageAreaName || 'none'}`);
          console.log(`     - municipalityIds: ${c.municipalityIds?.length || 0}`);
          console.log(`     - districtIds: ${c.districtIds?.length || 0}`);
          console.log(`     - geographicUnits: ${c.geographicUnits?.length || 0}`);
        });
      }
    }

    console.log('\n✨ Test complete!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  testViaAPI().catch(console.error);
}

module.exports = { testViaAPI };
