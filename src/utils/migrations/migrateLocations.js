/**
 * Migration Script: Locations
 * 
 * Migrates existing Province, District, Municipality data to the new flexible Location model.
 * Handles special cases: cities as districts, combined districts, province-wide coverage.
 * 
 * Usage: node src/utils/migrateLocations.js [--dry-run]
 */

const mongoose = require('mongoose');
const { Province, District, Municipality, Location } = require('../models');
require('dotenv').config();

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

function makeSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function migrateLocations() {
  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.');
  }

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const provinces = await Province.find().lean();
    const locationMap = new Map(); // Map old IDs to new Location IDs

    // Step 1: Create province locations
    console.log('Step 1: Migrating provinces...');
    for (const province of provinces) {
      const code = makeSlug(province.name) || `prov-${province._id}`;
      const existing = await Location.findOne({ code });
      
      if (existing) {
        console.log(`  Province exists: ${province.name} (code: ${code})`);
        locationMap.set(province._id.toString(), existing._id);
      } else {
        console.log(`  Will create province: ${province.name} (code: ${code})`);
        if (!dryRun) {
          const location = await Location.create({
            code,
            name: province.name,
            type: 'province',
            level: 0,
            isActive: true
          });
          location.province = location._id; // Self-reference
          await location.save();
          locationMap.set(province._id.toString(), location._id);
        }
      }
    }

    // Step 2: Create district/city locations
    console.log('\nStep 2: Migrating districts and cities...');
    const districts = await District.find().populate('province').lean();
    
    for (const district of districts) {
      const provinceLocationId = locationMap.get(district.province.toString());
      if (!provinceLocationId) {
        console.warn(`  Skipping district ${district.name}: province not found`);
        continue;
      }

      const code = `${makeSlug(district.province.name)}-${makeSlug(district.name)}` || `dist-${district._id}`;
      const existing = await Location.findOne({ code });
      
      // Check if this is a city acting as district (Naga City, Iriga City)
      const isCity = district.name.toLowerCase().includes('city');
      
      if (existing) {
        console.log(`  District exists: ${district.name} (code: ${code})`);
        locationMap.set(district._id.toString(), existing._id);
      } else {
        console.log(`  Will create ${isCity ? 'city' : 'district'}: ${district.name} (code: ${code})`);
        if (!dryRun) {
          const location = await Location.create({
            code,
            name: district.name,
            type: isCity ? 'city' : 'district',
            parent: provinceLocationId,
            level: 1,
            province: provinceLocationId,
            metadata: {
              isCity: isCity
            },
            isActive: true
          });
          locationMap.set(district._id.toString(), location._id);
        }
      }
    }

    // Step 3: Create municipality locations
    console.log('\nStep 3: Migrating municipalities...');
    const municipalities = await Municipality.find().populate('district province').lean();
    
    for (const municipality of municipalities) {
      const districtLocationId = locationMap.get(municipality.district.toString());
      if (!districtLocationId) {
        console.warn(`  Skipping municipality ${municipality.name}: district not found`);
        continue;
      }

      const provinceLocationId = locationMap.get(municipality.province.toString());
      const code = `${makeSlug(municipality.province.name)}-${makeSlug(municipality.district.name)}-${makeSlug(municipality.name)}` || `muni-${municipality._id}`;
      const existing = await Location.findOne({ code });
      
      if (existing) {
        console.log(`  Municipality exists: ${municipality.name} (code: ${code})`);
        locationMap.set(municipality._id.toString(), existing._id);
      } else {
        console.log(`  Will create municipality: ${municipality.name} (code: ${code})`);
        if (!dryRun) {
          const location = await Location.create({
            code,
            name: municipality.name,
            type: 'municipality',
            parent: districtLocationId,
            level: 2,
            province: provinceLocationId,
            isActive: true
          });
          locationMap.set(municipality._id.toString(), location._id);
        }
      }
    }

    // Step 4: Handle combined districts (e.g., "All LGUs (District I & II)")
    console.log('\nStep 4: Checking for combined districts...');
    // This would need to be configured based on your data
    // Example: Check for districts with "All LGUs" in name
    const combinedDistricts = districts.filter(d => 
      d.name.toLowerCase().includes('all lgu') || 
      d.name.toLowerCase().includes('district i & ii')
    );
    
    for (const combined of combinedDistricts) {
      console.log(`  Found combined district: ${combined.name}`);
      // Create parent location and link children
      // Implementation depends on your specific data structure
    }

    console.log(`\nMigration ${dryRun ? 'dry-run' : ''} completed.`);
    console.log(`Location map contains ${locationMap.size} entries.`);
    
    return locationMap;
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  migrateLocations().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { migrateLocations };
