/**
 * Migration Script: UserLocation to CoverageArea System
 * 
 * Migrates existing UserLocation assignments to the new CoverageArea system.
 * 
 * This script:
 * 1. Creates Organizations from existing User.organizationType and User.organizationInstitution
 * 2. Creates default CoverageAreas from existing location hierarchy paths
 * 3. Migrates UserLocation assignments to UserCoverageAssignment
 * 
 * Usage: from project root run:
 *   node src/utils/migrateToCoverageSystem.js [--dry-run]
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const mongoose = require('mongoose');
const { User, UserLocation, Location, Organization, CoverageArea, UserCoverageAssignment } = require('../models');
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env' });

// Accept multiple env var names for compatibility with existing .env
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

/**
 * Create organizations from existing user organization data
 */
async function createOrganizationsFromUsers() {
  console.log('Creating organizations from existing user data...');
  
  const organizationMap = new Map(); // Map organization name to Organization ID
  
  // Get all users with organization information
  const users = await User.find({
    $or: [
      { organizationType: { $exists: true, $ne: null } },
      { organizationInstitution: { $exists: true, $ne: null } }
    ]
  });
  
  for (const user of users) {
    const orgName = user.organizationInstitution || user.organizationType || 'Unknown';
    const orgType = user.organizationType || 'Other';
    
    // Skip if already processed
    if (organizationMap.has(orgName)) {
      continue;
    }
    
    // Check if organization already exists
    let organization = await Organization.findOne({ name: orgName });
    
    if (!organization) {
      console.log(`  Will create organization: ${orgName} (${orgType})`);
      if (!dryRun) {
        organization = await Organization.create({
          name: orgName,
          type: orgType,
          isActive: true
        });
      } else {
        // Create a mock object for dry-run
        organization = { _id: new mongoose.Types.ObjectId(), name: orgName, type: orgType };
      }
    } else {
      console.log(`  Organization exists: ${orgName}`);
    }
    
    organizationMap.set(orgName, organization._id);
    
    // Update user's organizationId reference
    if (!dryRun && user.organizationId !== organization._id) {
      user.organizationId = organization._id;
      await user.save();
    }
  }
  
  console.log(`Organizations creation ${dryRun ? 'dry-run' : ''} completed. Total: ${organizationMap.size}`);
  return organizationMap;
}

/**
 * Create coverage areas from location hierarchy
 */
async function createCoverageAreasFromLocations() {
  console.log('Creating coverage areas from location hierarchy...');
  
  const coverageAreaMap = new Map(); // Map location ID to CoverageArea ID
  
  // Get all active user location assignments
  const userLocations = await UserLocation.find({ isActive: true }).populate('locationId');
  
  for (const userLocation of userLocations) {
    const location = userLocation.locationId;
    if (!location || !location.isActive) continue;
    
    // Create a coverage area name based on location hierarchy
    let coverageAreaName = location.name;
    
    // Try to build a meaningful name from hierarchy
    try {
      const ancestors = await Location.findAncestors(location._id);
      if (ancestors.length > 0) {
        const ancestorNames = ancestors.map(a => a.name).reverse();
        coverageAreaName = ancestorNames.join(' > ') + ' > ' + location.name;
      }
    } catch (error) {
      // If hierarchy lookup fails, just use location name
      console.log(`    Warning: Could not build hierarchy for location ${location.name}: ${error.message}`);
    }
    
    // Check if coverage area already exists for this location
    let coverageArea = await CoverageArea.findOne({ 
      name: coverageAreaName,
      geographicUnits: location._id
    });
    
    if (!coverageArea) {
      // Check if a coverage area with just this location exists
      coverageArea = await CoverageArea.findOne({
        geographicUnits: { $size: 1, $eq: [location._id] }
      });
    }
    
    if (!coverageArea) {
      console.log(`  Will create coverage area: ${coverageAreaName}`);
      if (!dryRun) {
        coverageArea = await CoverageArea.create({
          name: coverageAreaName,
          geographicUnits: [location._id],
          isActive: true,
          metadata: {
            isDefault: false,
            tags: ['migrated'],
            custom: {
              migratedFrom: 'UserLocation',
              originalLocationId: location._id.toString()
            }
          }
        });
      } else {
        // Create a mock object for dry-run
        coverageArea = { 
          _id: new mongoose.Types.ObjectId(), 
          name: coverageAreaName, 
          geographicUnits: [location._id] 
        };
      }
    } else {
      console.log(`  Coverage area exists: ${coverageAreaName}`);
    }
    
    // Map location to coverage area
    coverageAreaMap.set(location._id.toString(), coverageArea._id);
  }
  
  console.log(`Coverage areas creation ${dryRun ? 'dry-run' : ''} completed. Total: ${coverageAreaMap.size}`);
  return coverageAreaMap;
}

/**
 * Migrate UserLocation assignments to UserCoverageAssignment
 */
async function migrateUserLocationAssignments(coverageAreaMap) {
  console.log('Migrating UserLocation assignments to UserCoverageAssignment...');
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  const userLocations = await UserLocation.find({ isActive: true }).populate('locationId');
  
  for (const userLocation of userLocations) {
    try {
      const location = userLocation.locationId;
      if (!location || !location.isActive) {
        skipped++;
        continue;
      }
      
      const coverageAreaId = coverageAreaMap.get(location._id.toString());
      if (!coverageAreaId) {
        console.log(`    Warning: No coverage area found for location ${location.name} (${location._id})`);
        skipped++;
        continue;
      }
      
      // Check if assignment already exists
      const existing = await UserCoverageAssignment.findOne({
        userId: userLocation.userId,
        coverageAreaId: coverageAreaId
      });
      
      if (existing) {
        console.log(`    Assignment already exists for user ${userLocation.userId} and coverage area ${coverageAreaId}`);
        skipped++;
        continue;
      }
      
      console.log(`  Will migrate assignment: User ${userLocation.userId} -> CoverageArea ${coverageAreaId}`);
      if (!dryRun) {
        await UserCoverageAssignment.create({
          userId: userLocation.userId,
          coverageAreaId: coverageAreaId,
          isPrimary: userLocation.isPrimary || false,
          assignedBy: userLocation.assignedBy || null,
          assignedAt: userLocation.assignedAt || new Date(),
          expiresAt: userLocation.expiresAt || null,
          isActive: true
        });
      }
      
      migrated++;
    } catch (error) {
      console.error(`    Error migrating assignment for user ${userLocation.userId}: ${error.message}`);
      errors++;
    }
  }
  
  console.log(`Migration ${dryRun ? 'dry-run' : ''} completed.`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

/**
 * Main migration function
 */
async function migrate() {
  if (dryRun) {
    console.log('Running in dry-run mode — no writes will be performed.');
  }
  
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  
  try {
    console.log('Starting migration to CoverageArea system...\n');
    
    // Step 1: Create organizations
    const organizationMap = await createOrganizationsFromUsers();
    console.log('');
    
    // Step 2: Create coverage areas
    const coverageAreaMap = await createCoverageAreasFromLocations();
    console.log('');
    
    // Step 3: Migrate user location assignments
    await migrateUserLocationAssignments(coverageAreaMap);
    console.log('');
    
    console.log(dryRun ? 'Dry-run completed. No changes written.' : 'Migration completed successfully.');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { migrate, createOrganizationsFromUsers, createCoverageAreasFromLocations, migrateUserLocationAssignments };

