/**
 * Find coordinators with District II coverage
 * Helps diagnose why District II coordinators may not be appearing
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
const CoverageArea = require('../../models/utility_models/coverageArea.model');
const Location = require('../../models/utility_models/location.model');
require('dotenv').config();

async function findDistrictIICoordinators() {
  try {
    console.log('🔍 Finding coordinators with District II coverage...\n');

    // First, find all coverage areas that mention "District II" or "District 2"
    const districtIICoverageAreas = await CoverageArea.find({
      coverageAreaName: { $regex: /district\s*ii|district\s*2/i }
    }).populate('geographicUnits');

    console.log(`Found ${districtIICoverageAreas.length} CoverageArea(s) with District II in name:\n`);
    districtIICoverageAreas.forEach(ca => {
      console.log(`- ${ca.coverageAreaName}`);
      console.log(`  ID: ${ca._id}`);
      console.log(`  Geographic units: ${ca.geographicUnits?.length || 0}`);
      if (ca.geographicUnits?.length > 0) {
        console.log(`  First 5 units: ${ca.geographicUnits.slice(0, 5).map(gu => gu?.name || '?').join(', ')}`);
      }
      console.log();
    });

    // Find all coordinators with authority 60-80
    const coordinators = await User.find({
      authority: { $gte: 60, $lt: 80 },
      isActive: true
    })
      .populate('organizations')
      .populate('coverageAreas');

    console.log(`\n📋 Found ${coordinators.length} active coordinators (authority 60-80)\n`);

    // Check each coordinator's coverage areas
    const districtIICoordinators = [];
    coordinators.forEach(coord => {
      const orgTypes = (coord.organizations || []).map(o => o.organizationType);
      const coverageAreaNames = (coord.coverageAreas || []).map(ca => ca.coverageAreaName);
      
      const hasDistrictII = coverageAreaNames.some(name => 
        /district\s*ii|district\s*2/i.test(name)
      );

      if (hasDistrictII) {
        districtIICoordinators.push(coord);
        console.log(`✅ ${coord.firstName} ${coord.lastName}`);
        console.log(`   ID: ${coord._id}`);
        console.log(`   Authority: ${coord.authority}`);
        console.log(`   Org Types: ${orgTypes.join(', ')}`);
        console.log(`   Coverage Areas: ${coverageAreaNames.join(', ')}`);
        console.log();
      }
    });

    console.log(`\n⚡ Summary: Found ${districtIICoordinators.length} coordinators with District II coverage\n`);

    // Now check Gainza specifically
    console.log('🔍 Checking which coordinators cover Gainza specifically...\n');

    const gainza = await Location.findOne({
      name: { $regex: /gainza/i },
      level: 'municipality'
    }).select('_id name districtId');

    if (gainza) {
      console.log(`Found Gainza: ${gainza._id}\n`);

      const coverageAreasWithGainza = await CoverageArea.find({
        geographicUnits: gainza._id
      });

      console.log(`Found ${coverageAreasWithGainza.length} coverage area(s) containing Gainza:\n`);
      coverageAreasWithGainza.forEach(ca => {
        console.log(`- ${ca.coverageAreaName} (${ca._id})`);
      });

      // Find coordinators using these coverage areas
      const coordinatorsWithGainza = await User.find({
        'coverageAreas._id': { $in: coverageAreasWithGainza.map(ca => ca._id) },
        authority: { $gte: 60, $lt: 80 },
        isActive: true
      }).populate('organizations');

      console.log(`\n✅ Coordinators with Gainza coverage:\n`);
      coordinatorsWithGainza.forEach(coord => {
        const orgTypes = (coord.organizations || []).map(o => o.organizationType);
        console.log(`${coord.firstName} ${coord.lastName}`);
        console.log(`  ID: ${coord._id}`);
        console.log(`  Org Types: ${orgTypes.join(', ')}`);
        console.log(`  Authority: ${coord.authority}`);
      });
    } else {
      console.log('❌ Gainza not found in Location collection');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/unite')
  .then(() => {
    console.log('✅ Connected to MongoDB\n');
    findDistrictIICoordinators();
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
