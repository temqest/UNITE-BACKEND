/**
 * Seeder for provinces, districts and municipalities using the flexible Location model.
 * It reads `src/utils/locations.json` (if present) and inserts the hierarchy.
 * Usage: from project root run:
 *   node src/utils/seedLocations.js [--dry-run]
 *
 * The `--dry-run` flag will report changes without writing.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Location } = require('../models');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

// Accept multiple env var names for compatibility with existing .env
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
const mongoDbName = process.env.MONGO_DB_NAME || null; // optional DB name to ensure connection to a specific DB

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
const dataPath = path.join(__dirname, 'locations.json');
const dryRun = process.argv.includes('--dry-run');

function makeSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function loadData() {
  if (fs.existsSync(dataPath)) {
    try {
      const raw = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      console.warn('Failed to parse locations.json, falling back to defaults', e.message);
    }
  }

  // Fallback minimal defaults (keeps previous behavior)
  return [
    {
      name: 'Camarines Sur',
      districts: [
        { name: 'District I', municipalities: ['Cabusao','Del Gallego','Lupi','Ragay','Sipocot'] },
        { name: 'District II', municipalities: ['Gainza','Libmanan','Milaor','Minalabac','Pamplona','Pasacao','San Fernando'] },
        { name: 'District III', municipalities: ['Bombon','Calabanga','Camaligan','Canaman','Magarao','Ocampo','Pili'] },
        { name: 'District IV', municipalities: ['Caramoan','Garchitorena','Goa','Lagonoy','Presentacion','Sagnay','San Jose','Siruma','Tigaon','Tinambac'] },
        { name: 'District V', municipalities: ['Baao','Balatan','Bato','Buhi','Bula','Nabua'] },
        { name: 'Naga City', municipalities: ['Naga City'] },
        { name: 'Iriga City', municipalities: ['Iriga City'] }
      ]
    },
    {
      name: 'Camarines Norte',
      districts: [
        { name: 'District I', municipalities: ['Capalonga','Jose Panganiban','Labo','Paracale','Sta. Elena'] },
        { name: 'District II', municipalities: ['Basud','Daet','Mercedes','San Lorenzo Ruiz','San Vicente','Talisay','Vinzons'] }
      ]
    }
  ];
}

async function seed() {
  const data = loadData();
  if (!Array.isArray(data) || data.length === 0) {
    console.error('No location data found to seed. Please add `src/utils/locations.json`.');
    return;
  }

  if (dryRun) console.log('Running in dry-run mode — no writes will be performed.');

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  try {
    for (const p of data) {
      // Create province location
      const provinceCode = makeSlug(p.name || '') || `prov-${Date.now()}`;
      let existingProvince = await Location.findOne({ 
        name: p.name, 
        type: 'province', 
        isActive: true 
      });
      
      if (existingProvince) {
        console.log(`Province exists: ${p.name} (id=${existingProvince._id})`);
      } else {
        console.log(`Will create province: ${p.name}`);
        if (!dryRun) {
          existingProvince = await Location.create({
            name: p.name,
            type: 'province',
            code: provinceCode,
            level: 0,
            isActive: true
          });
          // Set province reference to self
          existingProvince.province = existingProvince._id;
          await existingProvince.save();
        } else {
          existingProvince = { _id: new mongoose.Types.ObjectId(), name: p.name };
        }
      }

      for (const d of p.districts || []) {
        // Determine if this is a city or district
        const isCity = d.name.toLowerCase().includes('city');
        const districtType = isCity ? 'city' : 'district';
        const districtCode = `${provinceCode}-${makeSlug(d.name || '')}`;
        
        // Check for combined districts (like "All LGUs (District I & II)")
        const isCombined = d.name.toLowerCase().includes('all lgu') || d.name.toLowerCase().includes('district i & ii');
        
        let existingDistrict = await Location.findOne({ 
          name: d.name, 
          type: districtType,
          parent: existingProvince._id,
          isActive: true 
        });
        
        if (existingDistrict) {
          console.log(`  District exists: ${d.name} (province=${p.name})`);
        } else {
          console.log(`  Will create ${districtType}: ${d.name} (province=${p.name})`);
          if (!dryRun) {
            existingDistrict = await Location.create({
              name: d.name,
              type: districtType,
              parent: existingProvince._id,
              code: districtCode,
              level: 1,
              province: existingProvince._id,
              metadata: {
                isCity: isCity,
                isCombined: isCombined,
                operationalGroup: isCombined ? d.name : null
              },
              isActive: true
            });
          } else {
            existingDistrict = { _id: new mongoose.Types.ObjectId(), name: d.name };
          }
        }

        for (const m of d.municipalities || []) {
          // Municipality code includes province and district
          const muniCode = `${provinceCode}-${makeSlug(d.name || '')}-${makeSlug(m || '')}`;
          let existingMuni = await Location.findOne({ 
            name: m, 
            type: 'municipality',
            parent: existingDistrict._id,
            isActive: true 
          });
          
          if (existingMuni) {
            // skip
          } else {
            console.log(`    Will create municipality: ${m} (district=${d.name})`);
            if (!dryRun) {
              // Ensure code uniqueness; if collision occurs, append a timestamp suffix
              let codeToUse = muniCode;
              try {
                existingMuni = await Location.create({
                  name: m,
                  type: 'municipality',
                  parent: existingDistrict._id,
                  code: codeToUse,
                  level: 2,
                  province: existingProvince._id,
                  isActive: true
                });
              } catch (err) {
                if (err && err.code === 11000) {
                  // Duplicate key error - code collision
                  codeToUse = `${muniCode}-${Date.now()}`;
                  existingMuni = await Location.create({
                    name: m,
                    type: 'municipality',
                    parent: existingDistrict._id,
                    code: codeToUse,
                    level: 2,
                    province: existingProvince._id,
                    isActive: true
                  });
                } else {
                  throw err;
                }
              }
            }
          }
        }
      }
    }

    console.log(dryRun ? 'Dry-run completed. No changes written.' : 'Seeding completed');
  } catch (err) {
    console.error('Seeding error', err);
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) seed();

module.exports = { seed, loadData };
