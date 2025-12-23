/**
 * Seeder for provinces, districts and municipalities using the flexible Location model.
 * It reads `src/utils/locations.json` (if present) and inserts the hierarchy.
 * Usage: from project root run:
 *   node src/utils/seed/seedLocations.js [--dry-run]
 *
 * The `--dry-run` flag will report changes without writing.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Location } = require('../../models');
const { connect, disconnect, getConnectionUri } = require('../dbConnection');

// Barangay data file paths
const barangayFiles = {
  'Camarines Norte': path.join(__dirname, '..', 'camnorte-dis-barangay.txt'),
  'Camarines Sur': path.join(__dirname, '..', 'camsur-dis-barangay.txt'),
  'Masbate': path.join(__dirname, '..', 'masbate-dis-barangay.txt')
};
const dataPath = path.join(__dirname, '..', 'locations.json');
const dryRun = process.argv.includes('--dry-run');

function makeSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * Load barangay data from text files
 * Format: "BarangayName, Municipality"
 * @param {string} provinceName - Province name to load barangays for
 * @returns {Object} Map of municipality name -> array of barangay names
 */
function loadBarangayData(provinceName) {
  const filePath = barangayFiles[provinceName];
  if (!filePath || !fs.existsSync(filePath)) {
    console.log(`[INFO] No barangay file found for ${provinceName}`);
    return {};
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const barangayMap = {};
    for (const line of lines) {
      const [barangayName, municipalityName] = line.split(',').map(s => s.trim());
      if (barangayName && municipalityName) {
        if (!barangayMap[municipalityName]) {
          barangayMap[municipalityName] = [];
        }
        barangayMap[municipalityName].push(barangayName);
      }
    }
    
    console.log(`[INFO] Loaded barangay data for ${provinceName}: ${Object.keys(barangayMap).length} municipalities`);
    return barangayMap;
  } catch (error) {
    console.error(`[ERROR] Failed to load barangay data for ${provinceName}:`, error.message);
    return {};
  }
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
        // Unified structure: All municipalities accessible regardless of district
        // Districts are kept for organizational purposes but municipalities are accessible from both
        { name: 'District I', municipalities: ['Capalonga','Jose Panganiban','Labo','Paracale','Sta. Elena'] },
        { name: 'District II', municipalities: ['Basud','Daet','Mercedes','San Lorenzo Ruiz','San Vicente','Talisay','Vinzons'] }
      ]
    },
    {
      name: 'Masbate',
      districts: [
        // Masbate structure - districts will be created from municipalities
        { name: 'All LGUs', municipalities: ['Aroroy','Baleno','Balud','Batuan','Cataingan','Cawayan','Claveria','Dimasalang','Esperanza','Mandaon','Masbate City','Milagros','Mobo','Monreal','Palanas','Pio V. Corpuz','Placer','San Fernando','San Jacinto','San Pascual','Uson'] }
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

  const uri = getConnectionUri();
  await connect(uri);
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
            console.log(`    Municipality exists: ${m} (district=${d.name})`);
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
            } else {
              existingMuni = { _id: new mongoose.Types.ObjectId(), name: m };
            }
          }

          // Seed barangays for this municipality
          if (existingMuni && !dryRun) {
            const barangayMap = loadBarangayData(p.name);
            const barangays = barangayMap[m] || [];
            
            if (barangays.length > 0) {
              console.log(`      Seeding ${barangays.length} barangays for ${m}`);
              
              for (const barangayName of barangays) {
                const barangayCode = `${muniCode}-${makeSlug(barangayName)}`;
                
                // Check if barangay already exists
                const existingBarangay = await Location.findOne({
                  name: barangayName,
                  type: 'barangay',
                  parent: existingMuni._id,
                  isActive: true
                });
                
                if (!existingBarangay) {
                  try {
                    await Location.create({
                      name: barangayName,
                      type: 'barangay',
                      parent: existingMuni._id,
                      code: barangayCode,
                      level: 3,
                      province: existingProvince._id,
                      isActive: true
                    });
                  } catch (err) {
                    if (err && err.code === 11000) {
                      // Duplicate code, try with timestamp
                      const uniqueCode = `${barangayCode}-${Date.now()}`;
                      await Location.create({
                        name: barangayName,
                        type: 'barangay',
                        parent: existingMuni._id,
                        code: uniqueCode,
                        level: 3,
                        province: existingProvince._id,
                        isActive: true
                      });
                    } else {
                      console.error(`[ERROR] Failed to create barangay ${barangayName}:`, err.message);
                    }
                  }
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
    await disconnect();
  }
}

if (require.main === module) seed();

module.exports = { seed, loadData };
