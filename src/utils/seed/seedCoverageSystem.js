/**
 * Seeder for Coverage System (Coverage Areas)
 * 
 * Reads `src/utils/locations.json` and creates:
 * 1. Coverage Areas based on the location structure
 * 
 * Coverage areas can optionally be linked to organizations if an LGU organization exists.
 * If no organization is found, coverage areas are created without organization assignment.
 * 
 * Prerequisites:
 *   - Locations must be seeded first using: node src/utils/seedLocations.js
 *   - Organizations should be seeded first using: node src/utils/seedOrganizations.js (optional, but recommended)
 *   - The locations.json file must exist at src/utils/locations.json
 * 
 * Usage: from project root run:
 *   node src/utils/seed/seedCoverageSystem.js [--dry-run]
 * 
 * The `--dry-run` flag will report changes without writing.
 * 
 * Special Cases Handled:
 *   - "All LGUs (District I & II)" in Camarines Norte → Creates unified coverage area
 *   - Cities (Naga City, Iriga City) → Included in coverage areas as cities
 *   - Regular districts → Each district gets its own coverage area
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { Location, Organization, CoverageArea } = require('../../models');
const { connect, disconnect, getConnectionUri } = require('../dbConnection');

const dataPath = path.join(__dirname, '..', 'locations.json');
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

  // Fallback minimal defaults
  return [
    {
      name: 'Camarines Sur',
      districts: [
        { name: 'District I', municipalities: ['Cabusao', 'Del Gallego', 'Lupi', 'Ragay', 'Sipocot'] },
        { name: 'District II', municipalities: ['Gainza', 'Libmanan', 'Milaor', 'Minalabac', 'Pamplona', 'Pasacao', 'San Fernando'] },
        { name: 'District III', municipalities: ['Bombon', 'Calabanga', 'Camaligan', 'Canaman', 'Magarao', 'Ocampo', 'Pili'] },
        { name: 'District IV', municipalities: ['Caramoan', 'Garchitorena', 'Goa', 'Lagonoy', 'Presentacion', 'Sagnay', 'San Jose', 'Siruma', 'Tigaon', 'Tinambac'] },
        { name: 'District V', municipalities: ['Baao', 'Balatan', 'Bato', 'Buhi', 'Bula', 'Nabua'] },
        { name: 'Naga City', municipalities: ['Naga City'] },
        { name: 'Iriga City', municipalities: ['Iriga City'] }
      ]
    },
    {
      name: 'Camarines Norte',
      districts: [
        { name: 'All LGUs (District I & II)', municipalities: ['Basud', 'Capalonga', 'Daet', 'Jose Panganiban', 'Labo', 'Mercedes', 'Paracale', 'San Lorenzo Ruiz', 'San Vicente', 'Sta. Elena', 'Talisay', 'Vinzons'] }
      ]
    }
  ];
}

/**
 * Find a Location by name and type
 * Tries multiple strategies to find the location
 */
async function findLocation(name, type, parentId = null) {
  // Strategy 1: Exact match with parent
  if (parentId) {
    let location = await Location.findOne({ 
      name, 
      type, 
      parent: parentId, 
      isActive: true 
    });
    if (location) return location;
  }
  
  // Strategy 2: Exact match without parent (for provinces)
  let location = await Location.findOne({ 
    name, 
    type, 
    isActive: true 
  });
  if (location) return location;
  
  // Strategy 3: Case-insensitive match
  location = await Location.findOne({ 
    name: { $regex: new RegExp(`^${name}$`, 'i') }, 
    type, 
    isActive: true 
  });
  if (location) return location;
  
  // Strategy 4: For municipalities, try to find by name in any district of the province
  if (type === 'municipality' && parentId) {
    const parentLocation = await Location.findById(parentId);
    if (parentLocation) {
      // Find all districts/cities in this province
      const districts = await Location.find({ 
        parent: parentLocation._id, 
        type: { $in: ['district', 'city'] },
        isActive: true 
      });
      
      // Search in each district
      for (const district of districts) {
        location = await Location.findOne({ 
          name: { $regex: new RegExp(`^${name}$`, 'i') }, 
          type: 'municipality',
          parent: district._id,
          isActive: true 
        });
        if (location) return location;
      }
    }
  }
  
  console.log(`    Warning: Location not found: ${name} (${type})`);
  return null;
}

/**
 * Find or get a default LGU organization for coverage areas
 * Returns null if no LGU organization exists (coverage areas can be created without organizationId)
 */
async function getDefaultLGUOrganization() {
  // Try to find any LGU organization
  const lguOrg = await Organization.findOne({ type: 'LGU', isActive: true });
  if (lguOrg) {
    return lguOrg;
  }
  return null;
}

/**
 * Create coverage areas for a province
 */
async function createCoverageAreasForProvince(provinceData, organization = null) {
  const coverageAreas = [];
  
  // Find the province location
  const provinceLocation = await findLocation(provinceData.name, 'province');
  if (!provinceLocation) {
    console.log(`  Warning: Province location not found: ${provinceData.name}. Make sure locations are seeded first.`);
    return coverageAreas;
  }
  
  // Check for special unified case (like "All LGUs (District I & II)" in Camarines Norte)
  const hasUnifiedDistrict = provinceData.districts.some(d => 
    d.name.toLowerCase().includes('all lgu') || d.name.toLowerCase().includes('district i & ii')
  );
  
  if (hasUnifiedDistrict) {
    // Create a unified coverage area for the entire province
    const unifiedDistrict = provinceData.districts.find(d => 
      d.name.toLowerCase().includes('all lgu') || d.name.toLowerCase().includes('district i & ii')
    );
    
    const coverageAreaName = `${provinceData.name} – Unified`;
    let coverageArea = await CoverageArea.findOne({ name: coverageAreaName });
    
    if (coverageArea) {
      console.log(`    Coverage area exists: ${coverageAreaName}`);
    } else {
      // Collect all geographic units: province + all municipalities
      const geographicUnitIds = [provinceLocation._id];
      
      // Find all municipalities (they might be under different districts)
      for (const municipalityName of unifiedDistrict.municipalities) {
        const municipality = await findLocation(municipalityName, 'municipality', provinceLocation._id);
        if (municipality) {
          geographicUnitIds.push(municipality._id);
        }
      }
      
      // Also find districts if they exist
      const districtNames = ['District I', 'District II'];
      for (const districtName of districtNames) {
        const district = await findLocation(districtName, 'district', provinceLocation._id);
        if (district) {
          geographicUnitIds.push(district._id);
        }
      }
      
      console.log(`    Will create unified coverage area: ${coverageAreaName} (${geographicUnitIds.length} geographic units)`);
      if (!dryRun) {
        coverageArea = await CoverageArea.create({
          name: coverageAreaName,
          geographicUnits: geographicUnitIds,
          organizationId: organization ? organization._id : null,
          description: `Unified coverage area for all LGUs in ${provinceData.name}`,
          isActive: true,
          metadata: {
            isDefault: true,
            tags: ['unified', 'province-wide'],
            custom: {
              source: 'locations.json',
              unifiedDistrict: unifiedDistrict.name
            }
          }
        });
      } else {
        coverageArea = { _id: new mongoose.Types.ObjectId(), name: coverageAreaName, geographicUnits: geographicUnitIds };
      }
    }
    
    coverageAreas.push(coverageArea);
  } else {
    // Create coverage areas for each district
    for (const districtData of provinceData.districts) {
      const isCity = districtData.name.toLowerCase().includes('city');
      const districtType = isCity ? 'city' : 'district';
      
      // Find the district/city location
      const districtLocation = await findLocation(districtData.name, districtType, provinceLocation._id);
      
      if (!districtLocation) {
        console.log(`    Warning: District/City location not found: ${districtData.name}`);
        continue;
      }
      
      // Create coverage area name
      const coverageAreaName = `${provinceData.name} > ${districtData.name}`;
      let coverageArea = await CoverageArea.findOne({ name: coverageAreaName });
      
      if (coverageArea) {
        console.log(`    Coverage area exists: ${coverageAreaName}`);
      } else {
        // Collect geographic units: province + district/city + all municipalities
        const geographicUnitIds = [provinceLocation._id, districtLocation._id];
        
        // Find all municipalities in this district
        for (const municipalityName of districtData.municipalities) {
          const municipality = await findLocation(municipalityName, 'municipality', districtLocation._id);
          if (municipality) {
            geographicUnitIds.push(municipality._id);
          }
        }
        
        console.log(`    Will create coverage area: ${coverageAreaName} (${geographicUnitIds.length} geographic units)`);
        if (!dryRun) {
          coverageArea = await CoverageArea.create({
            name: coverageAreaName,
            geographicUnits: geographicUnitIds,
            organizationId: organization ? organization._id : null,
            description: `Coverage area for ${districtData.name} in ${provinceData.name}`,
            isActive: true,
            metadata: {
              isDefault: false,
              tags: isCity ? ['city'] : ['district'],
              custom: {
                source: 'locations.json',
                districtType: districtType
              }
            }
          });
        } else {
          coverageArea = { _id: new mongoose.Types.ObjectId(), name: coverageAreaName, geographicUnits: geographicUnitIds };
        }
      }
      
      coverageAreas.push(coverageArea);
    }
  }
  
  return coverageAreas;
}

/**
 * Main seeding function
 */
async function seed() {
  const data = loadData();
  if (!Array.isArray(data) || data.length === 0) {
    console.error('No location data found to seed. Please add `src/utils/locations.json`.');
    return;
  }

  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.\n');
  }

  const uri = getConnectionUri();
  await connect(uri);
  
  try {
    // Step 1: Try to find a default LGU organization (optional)
    // Coverage areas can be created without an organization
    const defaultOrganization = await getDefaultLGUOrganization();
    if (defaultOrganization) {
      console.log(`Using default LGU organization: ${defaultOrganization.name}`);
    } else {
      console.log('No LGU organization found. Coverage areas will be created without organization assignment.');
      console.log('You can assign organizations to coverage areas later through the admin interface.');
    }
    
    // Step 2: Create coverage areas for each province
    console.log('\nCreating coverage areas...');
    let totalCoverageAreas = 0;
    
    for (let i = 0; i < data.length; i++) {
      const provinceData = data[i];
      
      console.log(`\nProcessing province: ${provinceData.name}`);
      const coverageAreas = await createCoverageAreasForProvince(provinceData, defaultOrganization);
      totalCoverageAreas += coverageAreas.length;
    }
    
    console.log(`\nCoverage areas ${dryRun ? 'dry-run' : ''} completed. Total: ${totalCoverageAreas}`);
    console.log(dryRun ? '\nDry-run completed. No changes written.' : '\nSeeding completed successfully.');
  } catch (err) {
    console.error('Seeding error:', err);
    throw err;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { seed, createCoverageAreasForProvince };

