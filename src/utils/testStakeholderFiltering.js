/**
 * Quick Diagnostic: Test Stakeholder Filtering End-to-End
 * 
 * This script tests the stakeholder filtering optimization to verify it's working
 * Run: node src/utils/testStakeholderFiltering.js
 */

const mongoose = require('mongoose');
const { connect, disconnect, getConnectionUri } = require('./dbConnection');
const User = require('../models/users_models/user.model');
const stakeholderFilteringService = require('../services/users_services/stakeholderFiltering.service');
const { AUTHORITY_TIERS } = require('../services/users_services/authority.service');

async function testStakeholderFiltering() {
  try {
    const uri = getConnectionUri();
    await connect(uri);
    console.log('✓ Connected to MongoDB\n');

    // Find a coordinator with coverage areas
    console.log('📍 Finding coordinator with coverage areas...');
    const coordinator = await User.findOne({
      coverageAreas: { $exists: true, $ne: [] },
      isActive: true
    }).populate('coverageAreas').lean();

    if (!coordinator) {
      console.log('❌ No coordinator with coverage areas found');
      process.exit(1);
    }

    console.log(`✓ Found coordinator: ${coordinator.firstName} ${coordinator.lastName}`);
    console.log(`  Coverage areas: ${coordinator.coverageAreas?.length || 0}`);
    console.log(`  Authority: ${coordinator.authority}`);
    console.log(`  ID: ${coordinator._id}\n`);

    // Get all stakeholders
    console.log('📍 Finding all stakeholders...');
    const allStakeholders = await User.find({
      authority: { $lt: AUTHORITY_TIERS.COORDINATOR },
      isActive: true
    }).select('_id firstName lastName authority locations').lean();

    console.log(`✓ Found ${allStakeholders.length} total stakeholders\n`);

    if (allStakeholders.length === 0) {
      console.log('❌ No stakeholders found to test');
      process.exit(1);
    }

    // Show sample stakeholders
    console.log('📋 Sample stakeholders (first 5):');
    allStakeholders.slice(0, 5).forEach(s => {
      console.log(`   - ${s.firstName} ${s.lastName} (${s.locations?.municipalityName || 'no municipality'})`);
    });
    console.log();

    // Test filtering
    console.log('🔍 Testing stakeholder filtering...');
    const startTime = Date.now();
    
    const stakeholderIds = allStakeholders.map(s => s._id);
    const filtered = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
      coordinator._id,
      stakeholderIds
    );

    const elapsedMs = Date.now() - startTime;

    console.log(`\n📊 Filtering Results:`);
    console.log(`   Total stakeholders: ${allStakeholders.length}`);
    console.log(`   Filtered stakeholders: ${filtered.length}`);
    console.log(`   Filtered out: ${allStakeholders.length - filtered.length}`);
    console.log(`   Execution time: ${elapsedMs}ms`);

    if (elapsedMs < 100) {
      console.log(`   Performance: ✓ EXCELLENT (< 100ms)`);
    } else if (elapsedMs < 500) {
      console.log(`   Performance: ✓ GOOD (< 500ms)`);
    } else {
      console.log(`   Performance: ⚠️  SLOW (> 500ms)`);
    }

    // Show filtered stakeholders
    if (filtered.length > 0 && filtered.length <= 10) {
      console.log('\n📋 Filtered stakeholders:');
      const filteredUsers = allStakeholders.filter(s => filtered.includes(s._id.toString()));
      filteredUsers.forEach(s => {
        console.log(`   - ${s.firstName} ${s.lastName} (${s.locations?.municipalityName || 'no municipality'})`);
      });
    } else if (filtered.length > 10) {
      console.log(`\n📋 First 5 filtered stakeholders (of ${filtered.length}):`);
      const filteredUsers = allStakeholders
        .filter(s => filtered.includes(s._id.toString()))
        .slice(0, 5);
      filteredUsers.forEach(s => {
        console.log(`   - ${s.firstName} ${s.lastName} (${s.locations?.municipalityName || 'no municipality'})`);
      });
    } else {
      console.log('\n⚠️  No stakeholders matched the coordinator\'s coverage area');
    }

    console.log('\n✨ Test complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  testStakeholderFiltering().catch(console.error);
}

module.exports = { testStakeholderFiltering };
