/**
 * Debug: List ALL stakeholder and coordinator municipalities
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');
const Location = require('../models/utility_models/location.model');

async function listAllMunicipalities() {
  try {
    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log('✓ Connected to MongoDB\n');

    // Get ALL stakeholder municipalities
    console.log('📊 All stakeholder municipalities:');
    const stakeholders = await User.find({
      authority: 30,
      isActive: true,
    })
      .select('_id firstName lastName locations')
      .lean();

    const stakeholderMunicipalities = new Set();
    stakeholders.forEach(sh => {
      if (sh.locations && sh.locations.municipalityId) {
        stakeholderMunicipalities.add(sh.locations.municipalityId.toString());
      }
    });

    console.log(`${stakeholders.length} stakeholders with municipalities:`);
    for (const mun of stakeholderMunicipalities) {
      const munName = await Location.findById(mun).select('name').lean();
      console.log(`  - ${mun} (${munName?.name || 'unknown'})`);
    }

    // Get ALL coordinator coverage municipalities
    console.log('\n📊 All coordinator coverage municipalities:');
    const coordinators = await User.find({
      authority: 60,
      isActive: true,
    })
      .select('_id firstName lastName coverageAreas')
      .lean();

    for (const coord of coordinators) {
      const covMuns = new Set();
      if (coord.coverageAreas && coord.coverageAreas.length > 0) {
        coord.coverageAreas.forEach(ca => {
          if (ca.municipalityIds && Array.isArray(ca.municipalityIds)) {
            ca.municipalityIds.forEach(id => covMuns.add(id.toString()));
          }
        });
      }

      console.log(`\n${coord.firstName} ${coord.lastName} (${coord._id}):`);
      console.log(`  Municipalities in coverage: ${covMuns.size}`);
      
      // Check first 3 municipalities
      let count = 0;
      for (const mun of covMuns) {
        if (count >= 3) {
          console.log(`  ... and ${covMuns.size - 3} more`);
          break;
        }
        const munName = await Location.findById(mun).select('name').lean();
        console.log(`  - ${mun} (${munName?.name || 'unknown'})`);
        count++;
      }

      // Check if ANY stakeholder is in coordinator's coverage
      const matchingStakeholders = new Set();
      for (const stakeholder of stakeholders) {
        if (stakeholder.locations && stakeholder.locations.municipalityId) {
          if (covMuns.has(stakeholder.locations.municipalityId.toString())) {
            matchingStakeholders.add(stakeholder._id.toString());
          }
        }
      }
      console.log(`  Matching stakeholders: ${matchingStakeholders.size} of ${stakeholders.length}`);
    }

    // Check if there's a mismatch - are coordinator municipalities actually in the database?
    console.log('\n\n🔍 Verifying coordinator municipalities exist in Location collection...');
    const allCoordsWithCoverage = await User.find({
      authority: 60,
      'coverageAreas.municipalityIds': { $exists: true, $ne: [] }
    })
      .select('_id firstName lastName coverageAreas')
      .lean();

    if (allCoordsWithCoverage.length > 0) {
      const firstCoord = allCoordsWithCoverage[0];
      const munIds = firstCoord.coverageAreas[0].municipalityIds.slice(0, 5);
      
      console.log(`\nChecking first 5 municipality IDs from ${firstCoord.firstName}:`);
      for (const munId of munIds) {
        const location = await Location.findById(munId).select('_id name code level parent').lean();
        if (location) {
          console.log(`  ✓ ${munId} → ${location.name} (level: ${location.level}, parent: ${location.parent?.toString() || 'none'})`);
        } else {
          console.log(`  ✗ ${munId} → NOT FOUND`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

listAllMunicipalities();
