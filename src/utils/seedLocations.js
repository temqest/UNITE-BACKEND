/**
 * Seeder for provinces, districts and municipalities.
 * It reads `src/utils/locations.json` (if present) and inserts the hierarchy.
 * Usage: from project root run:
 *   node src/utils/seedLocations.js [--dry-run]
 *
 * The `--dry-run` flag will report changes without writing.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Province, District, Municipality } = require('../models');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

// Accept multiple env var names for compatibility with existing .env
const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
const dataPath = path.join(__dirname, 'locations.json');
const dryRun = process.argv.includes('--dry-run');

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
        { name: 'District V', municipalities: ['Baao','Balatan','Bato','Buhi','Bula','Nabua'] }
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
      // create a deterministic code for the province (slug)
      const makeSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const provinceCode = makeSlug(p.name || '') || `prov-${Date.now()}`;
      const provinceQuery = { name: p.name };
      const existingProvince = await Province.findOne(provinceQuery).exec();
      if (existingProvince) {
        console.log(`Province exists: ${p.name} (id=${existingProvince._id})`);
      } else {
        console.log(`Will create province: ${p.name}`);
      }

      let province;
      if (!dryRun) province = existingProvince || await Province.create({ name: p.name, code: provinceCode });

      for (const d of p.districts || []) {
        // district code includes province to keep it unique across provinces
        const districtCode = province ? `${provinceCode}-${makeSlug(d.name || '')}` : makeSlug(d.name || '') || `dist-${Date.now()}`;
        const districtQuery = { name: d.name, province: province ? province._id : undefined };
        let existingDistrict = null;
        if (province) existingDistrict = await District.findOne(districtQuery).exec();

        if (existingDistrict) {
          console.log(`  District exists: ${d.name} (province=${p.name})`);
        } else {
          console.log(`  Will create district: ${d.name} (province=${p.name})`);
        }

        let district;
        if (!dryRun) district = existingDistrict || await District.create({ name: d.name, province: province._id, code: districtCode });

        for (const m of d.municipalities || []) {
          // municipality code includes province and district
          const muniCode = (province && district) ? `${provinceCode}-${makeSlug(d.name || '')}-${makeSlug(m || '')}` : makeSlug(m || '') || `muni-${Date.now()}`;
          const muniQuery = { name: m, district: district ? district._id : undefined };
          let existingMuni = null;
          if (district) existingMuni = await Municipality.findOne(muniQuery).exec();

          if (existingMuni) {
            // skip
          } else {
            console.log(`    Will create municipality: ${m} (district=${d.name})`);
          }

          if (!dryRun && district && !existingMuni) {
            // ensure code uniqueness; if collision occurs, append a timestamp suffix
            let codeToUse = muniCode;
            try {
              await Municipality.create({ name: m, district: district._id, province: province._id, code: codeToUse });
            } catch (err) {
              if (err && err.code === 11000) {
                codeToUse = `${muniCode}-${Date.now()}`;
                await Municipality.create({ name: m, district: district._id, province: province._id, code: codeToUse });
              } else {
                throw err;
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
