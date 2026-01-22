/**
 * Test: Multiple Coordinators with Different Coverage Areas
 * Purpose: Verify that stakeholder filtering changes based on which coordinator is selected
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Models
const User = require('../models/users_models/user.model');
const Location = require('../models/utility_models/location.model');

async function testMultipleCoordinators() {
  try {
    // Connect to MongoDB
    console.log('📍 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB_NAME,
    });
    console.log('✓ Connected to MongoDB\n');

    // Get all coordinators (authority 60-79)
    console.log('📍 Finding all coordinators...');
    const coordinators = await User.find({
      authority: { $gte: 60, $lt: 80 },
      isActive: true,
    })
      .select('_id firstName lastName authority coverageAreas')
      .lean();

    console.log(`✓ Found ${coordinators.length} coordinators\n`);

    if (coordinators.length < 2) {
      console.log('⚠️  Need at least 2 coordinators to test. Found:', coordinators.length);
      console.log('Test cannot proceed.');
      process.exit(0);
    }

    // Test each coordinator
    for (let i = 0; i < Math.min(coordinators.length, 3); i++) {
      const coordinator = coordinators[i];
      console.log(`\n${'='.repeat(80)}`);
      console.log(`COORDINATOR ${i + 1}: ${coordinator.firstName} ${coordinator.lastName}`);
      console.log(`${'='.repeat(80)}`);
      console.log(`ID: ${coordinator._id}`);
      console.log(`Coverage Areas: ${coordinator.coverageAreas?.length || 0}`);

      if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
        const ca = coordinator.coverageAreas[0];
        console.log(`  - Municipalities: ${ca.municipalityIds?.length || 0}`);
        console.log(`  - Districts: ${ca.districtIds?.length || 0}`);
      }

      // Get all location IDs from coverage
      const locationIds = new Set();
      if (coordinator.coverageAreas) {
        for (const coverage of coordinator.coverageAreas) {
          if (coverage.municipalityIds) {
            coverage.municipalityIds.forEach((id) => locationIds.add(id.toString()));
          }
          if (coverage.districtIds) {
            coverage.districtIds.forEach((id) => locationIds.add(id.toString()));
          }
        }
      }

      console.log(`\n  Direct location IDs: ${locationIds.size}`);

      // Get descendants for these locations
      if (locationIds.size > 0) {
        const locationIdArray = Array.from(locationIds)
          .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
          .filter(Boolean);

        console.log('  Resolving location descendants...');
        const startTime = Date.now();

        const descendantResults = await Location.aggregate([
          {
            $match: {
              $or: [{ _id: { $in: locationIdArray } }, { parent: { $in: locationIdArray } }],
            },
          },
          {
            $graphLookup: {
              from: 'locations',
              startWith: '$_id',
              connectFromField: '_id',
              connectToField: 'parent',
              as: 'descendants',
              maxDepth: 10,
            },
          },
          {
            $project: {
              _id: 1,
              descendants: { $map: { input: '$descendants', as: 'desc', in: '$$desc._id' } },
            },
          },
        ]);

        const elapsedMs = Date.now() - startTime;

        // Collect all descendant IDs
        const allLocationIds = new Set();
        for (const result of descendantResults) {
          allLocationIds.add(result._id.toString());
          if (result.descendants) {
            result.descendants.forEach((id) => allLocationIds.add(id.toString()));
          }
        }

        console.log(`  ✓ Resolved in ${elapsedMs}ms`);
        console.log(`  Total locations (including descendants): ${allLocationIds.size}`);

        // Now query stakeholders with these location IDs
        console.log('\n  Querying stakeholders in coverage area...');
        const stakeholderStartTime = Date.now();

        const stakeholdersInCoverage = await User.find({
          $or: [
            { 'locations._id': { $in: Array.from(allLocationIds).map((id) => new mongoose.Types.ObjectId(id)) } },
            { 'locations': { $elemMatch: { _id: { $in: Array.from(allLocationIds).map((id) => new mongoose.Types.ObjectId(id)) } } } },
          ],
          authority: { $lt: 60 }, // Only stakeholders
          isActive: true,
        })
          .select('_id firstName lastName authority locations')
          .lean();

        const stakeholderElapsedMs = Date.now() - stakeholderStartTime;

        console.log(`  ✓ Found ${stakeholdersInCoverage.length} stakeholders in ${stakeholderElapsedMs}ms`);

        // List sample stakeholders
        if (stakeholdersInCoverage.length > 0) {
          console.log(`  Sample stakeholders:`);
          for (let j = 0; j < Math.min(5, stakeholdersInCoverage.length); j++) {
            const sh = stakeholdersInCoverage[j];
            const loc = sh.locations?.[0];
            console.log(`    - ${sh.firstName} ${sh.lastName} (${loc?.municipalityName || 'Unknown'})`);
          }
        }
      }
    }

    // Compare results across coordinators
    console.log(`\n${'='.repeat(80)}`);
    console.log('COMPARISON ACROSS COORDINATORS');
    console.log(`${'='.repeat(80)}`);

    // Get stakeholder counts for each coordinator
    const coordinatorStakeholderCounts = [];

    for (const coordinator of coordinators.slice(0, 3)) {
      const locationIds = new Set();
      if (coordinator.coverageAreas) {
        for (const coverage of coordinator.coverageAreas) {
          if (coverage.municipalityIds) {
            coverage.municipalityIds.forEach((id) => locationIds.add(id.toString()));
          }
          if (coverage.districtIds) {
            coverage.districtIds.forEach((id) => locationIds.add(id.toString()));
          }
        }
      }

      const locationIdArray = Array.from(locationIds)
        .map((id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null))
        .filter(Boolean);

      const descendantResults = await Location.aggregate([
        {
          $match: {
            $or: [{ _id: { $in: locationIdArray } }, { parent: { $in: locationIdArray } }],
          },
        },
        {
          $graphLookup: {
            from: 'locations',
            startWith: '$_id',
            connectFromField: '_id',
            connectToField: 'parent',
            as: 'descendants',
            maxDepth: 10,
          },
        },
        {
          $project: {
            _id: 1,
            descendants: { $map: { input: '$descendants', as: 'desc', in: '$$desc._id' } },
          },
        },
      ]);

      const allLocationIds = new Set();
      for (const result of descendantResults) {
        allLocationIds.add(result._id.toString());
        if (result.descendants) {
          result.descendants.forEach((id) => allLocationIds.add(id.toString()));
        }
      }

      const stakeholderCount = await User.countDocuments({
        $or: [
          { 'locations._id': { $in: Array.from(allLocationIds).map((id) => new mongoose.Types.ObjectId(id)) } },
          { 'locations': { $elemMatch: { _id: { $in: Array.from(allLocationIds).map((id) => new mongoose.Types.ObjectId(id)) } } } },
        ],
        authority: { $lt: 60 },
        isActive: true,
      });

      coordinatorStakeholderCounts.push({
        name: `${coordinator.firstName} ${coordinator.lastName}`,
        stakeholderCount,
      });
    }

    console.log('\nStakeholder counts per coordinator:');
    for (const item of coordinatorStakeholderCounts) {
      console.log(`  ${item.name}: ${item.stakeholderCount}`);
    }

    // Check if counts vary
    const counts = coordinatorStakeholderCounts.map((c) => c.stakeholderCount);
    const allSame = counts.every((c) => c === counts[0]);

    if (allSame) {
      console.log(`\n⚠️  WARNING: All coordinators have the same stakeholder count (${counts[0]})`);
      console.log('This suggests filtering may not be working correctly.');
    } else {
      console.log(`\n✓ Coordinators have different stakeholder counts - filtering appears to be working!`);
      console.log(`  Range: ${Math.min(...counts)} - ${Math.max(...counts)} stakeholders`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✓ Disconnected from MongoDB');
  }
}

testMultipleCoordinators();
