/**
 * Comprehensive Test: Verify API returns correct stakeholders per coordinator
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');
const stakeholderFilteringService = require('../services/users_services/stakeholderFiltering.service');

async function comprehensiveTest() {
  try {
    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log('✓ Connected to MongoDB\n');

    // Get all stakeholders
    const allStakeholders = await User.find({
      authority: 30,
      isActive: true,
    })
      .select('_id firstName lastName locations')
      .lean();

    const stakeholderIds = allStakeholders.map(s => s._id);

    console.log(`Found ${allStakeholders.length} stakeholders\n`);

    // Get all coordinators
    const coordinators = await User.find({
      authority: 60,
      isActive: true,
      'coverageAreas.0': { $exists: true }
    })
      .select('_id firstName lastName organizations')
      .lean();

    console.log(`Found ${coordinators.length} coordinators\n`);
    console.log('='.repeat(80));

    for (const coord of coordinators) {
      console.log(`\n📍 Coordinator: ${coord.firstName} ${coord.lastName} (${coord._id})`);
      
      try {
        const filteredIds = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
          coord._id,
          stakeholderIds
        );

        console.log(`✓ Filtered stakeholders: ${filteredIds.length} of ${allStakeholders.length}`);

        if (filteredIds.length > 0) {
          // Show who was filtered IN
          console.log(`  Matching stakeholders:`);
          for (const filteredId of filteredIds) {
            const stakeholder = allStakeholders.find(s => s._id.toString() === filteredId.toString());
            if (stakeholder) {
              const municipalityName = stakeholder.locations?.municipalityName || 'Unknown';
              console.log(`    ✓ ${stakeholder.firstName} ${stakeholder.lastName} (${municipalityName})`);
            }
          }

          // Show who was filtered OUT
          const filteredOutIds = stakeholderIds.filter(id => !filteredIds.includes(id.toString()));
          if (filteredOutIds.length > 0) {
            console.log(`  Filtered OUT (${filteredOutIds.length} stakeholders):`);
            for (const filteredOutId of filteredOutIds.slice(0, 3)) {
              const stakeholder = allStakeholders.find(s => s._id.toString() === filteredOutId.toString());
              if (stakeholder) {
                const municipalityName = stakeholder.locations?.municipalityName || 'Unknown';
                console.log(`    ✗ ${stakeholder.firstName} ${stakeholder.lastName} (${municipalityName})`);
              }
            }
            if (filteredOutIds.length > 3) {
              console.log(`    ... and ${filteredOutIds.length - 3} more`);
            }
          }
        } else {
          console.log(`  (No matching stakeholders for this coordinator)`);
        }
      } catch (err) {
        console.error(`✗ Error filtering: ${err.message}`);
      }

      console.log('-'.repeat(80));
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

comprehensiveTest();
