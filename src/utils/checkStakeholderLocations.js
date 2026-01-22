/**
 * Debug: Check stakeholder location structure
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');

async function checkStakeholderLocations() {
  try {
    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log('✓ Connected to MongoDB\n');

    // Get a few stakeholders
    console.log('📍 Fetching sample stakeholders...');
    const stakeholders = await User.find({
      authority: 30,
      isActive: true,
    })
      .select('_id firstName lastName locations organizationTypes')
      .limit(5)
      .lean();

    console.log(`Found ${stakeholders.length} stakeholders\n`);

    for (const sh of stakeholders) {
      console.log(`\n📋 ${sh.firstName} ${sh.lastName} (${sh._id})`);
      console.log(`   organizationTypes: ${JSON.stringify(sh.organizationTypes)}`);
      console.log(`   locations structure:`);
      
      if (sh.locations) {
        if (Array.isArray(sh.locations)) {
          console.log(`   - Array of ${sh.locations.length} items`);
          sh.locations.forEach((loc, i) => {
            console.log(`     [${i}]:`, {
              _id: loc._id?.toString() || 'no _id',
              municipalityId: loc.municipalityId?.toString() || 'none',
              districtId: loc.districtId?.toString() || 'none',
              municipalityName: loc.municipalityName || 'none',
              districtName: loc.districtName || 'none',
              keys: Object.keys(loc)
            });
          });
        } else {
          console.log(`   - Object:`, sh.locations);
        }
      } else {
        console.log(`   - No locations field`);
      }
    }

    // Also check a coordinator's coverage areas
    console.log('\n\n🔍 Checking coordinator coverage structure...');
    const coordinator = await User.findOne({
      authority: 60,
      isActive: true,
    })
      .select('_id firstName lastName coverageAreas')
      .lean();

    if (coordinator) {
      console.log(`\n📋 ${coordinator.firstName} ${coordinator.lastName} (${coordinator._id})`);
      if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
        const ca = coordinator.coverageAreas[0];
        console.log(`Coverage Area 0:`, {
          municipalityIds: ca.municipalityIds?.length || 0,
          districtIds: ca.districtIds?.length || 0,
          provinceIds: ca.provinceIds?.length || 0,
          sampleMunicipalityId: ca.municipalityIds?.[0]?.toString() || 'none',
          sampleDistrictId: ca.districtIds?.[0]?.toString() || 'none',
        });

        // Try to find a stakeholder whose municipality matches
        if (ca.municipalityIds && ca.municipalityIds.length > 0) {
          const targetMunicipalityId = ca.municipalityIds[0];
          console.log(`\nSearching for stakeholders in municipality ${targetMunicipalityId}...`);
          
          const matchingStakeholders = await User.find({
            authority: 30,
            'locations.municipalityId': targetMunicipalityId
          })
            .select('_id firstName lastName locations')
            .limit(3)
            .lean();
          
          console.log(`Found ${matchingStakeholders.length} stakeholders in that municipality`);
          matchingStakeholders.forEach((sh, i) => {
            console.log(`  [${i}] ${sh.firstName} ${sh.lastName}`);
            if (sh.locations && sh.locations.length > 0) {
              console.log(`      locations[0].municipalityId: ${sh.locations[0].municipalityId?.toString()}`);
            }
          });
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

checkStakeholderLocations();
