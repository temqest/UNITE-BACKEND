/**
 * Seeder for Organizations
 * 
 * Creates general organizations of various types:
 * - LGU (Local Government Units)
 * - NGO (Non-Government Organizations)
 * - Hospital
 * - BloodBank
 * - RedCross
 * - Non-LGU
 * - Other
 * 
 * These are general organizations that can be used across different locations.
 * They are not tied to specific provinces or districts.
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env
 * 
 * Usage: from project root run:
 *   node src/utils/seedOrganizations.js [--dry-run]
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const mongoose = require('mongoose');
const { Organization } = require('../models');
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
 * Default organizations to seed
 * These are general organizations that can be used across different locations
 */
const defaultOrganizations = [
  // LGU Organizations
  {
    name: 'Local Government Unit',
    type: 'LGU',
    description: 'Local Government Unit organization',
    code: 'lgu'
  },
  
  // NGO Organizations
  {
    name: 'Community Health NGO',
    type: 'NGO',
    description: 'Non-Government Organization focused on community health',
    code: 'community-health-ngo'
  },
  {
    name: 'Public Health NGO',
    type: 'NGO',
    description: 'Non-Government Organization focused on public health initiatives',
    code: 'public-health-ngo'
  },
  
  // Hospital Organizations
  {
    name: 'General Hospital',
    type: 'Hospital',
    description: 'General hospital providing medical services',
    code: 'general-hospital'
  },
  {
    name: 'Regional Hospital',
    type: 'Hospital',
    description: 'Regional hospital providing specialized medical services',
    code: 'regional-hospital'
  },
  
  // Blood Bank Organizations
  {
    name: 'Regional Blood Bank',
    type: 'BloodBank',
    description: 'Regional blood bank facility',
    code: 'regional-blood-bank'
  },
  {
    name: 'Community Blood Bank',
    type: 'BloodBank',
    description: 'Community-based blood bank facility',
    code: 'community-blood-bank'
  },
  
  // Red Cross Organizations
  {
    name: 'Red Cross',
    type: 'RedCross',
    description: 'Red Cross organization providing humanitarian services',
    code: 'red-cross'
  },
  
  // Non-LGU Organizations
  {
    name: 'Non-LGU Organization',
    type: 'Non-LGU',
    description: 'Non-Local Government Unit organization',
    code: 'non-lgu-organization'
  },
  
  // Other Organizations
  {
    name: 'Community Organization',
    type: 'Other',
    description: 'General community organization',
    code: 'community-organization'
  },
  {
    name: 'Other',
    type: 'Other',
    description: 'Organization type for specific cases not covered by other categories',
    code: 'other'
  }
];

/**
 * Main seeding function
 */
async function seed() {
  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode — no writes will be performed.\n');
  }

  console.log('🏢 Starting Organization Seeding\n');
  console.log('='.repeat(60));

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    console.log(`\n📋 Seeding ${defaultOrganizations.length} organization(s)...\n`);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const orgData of defaultOrganizations) {
      // Check if organization exists by name or code
      let organization = await Organization.findOne({
        $or: [
          { name: orgData.name },
          { code: orgData.code }
        ]
      });

      if (organization) {
        // Check if type needs updating
        if (organization.type !== orgData.type) {
          console.log(`  🔄 Updating organization: ${orgData.name}`);
          console.log(`     Type: "${organization.type}" → "${orgData.type}"`);
          
          if (!dryRun) {
            organization.type = orgData.type;
            // Update description if it's different
            if (orgData.description && organization.description !== orgData.description) {
              organization.description = orgData.description;
            }
            await organization.save();
            updatedCount++;
            console.log(`     ✓ Updated successfully`);
          } else {
            console.log(`     ⚠ Would update (dry-run mode)`);
            updatedCount++;
          }
        } else {
          console.log(`  ✓ Organization exists: ${orgData.name} (${orgData.type})`);
          skippedCount++;
        }
      } else {
        console.log(`  ➕ Creating organization: ${orgData.name} (${orgData.type})`);
        
        if (!dryRun) {
          organization = await Organization.create({
            name: orgData.name,
            type: orgData.type,
            code: orgData.code,
            description: orgData.description,
            isActive: true
          });
          createdCount++;
          console.log(`     ✓ Created successfully`);
        } else {
          console.log(`     ⚠ Would create (dry-run mode)`);
          createdCount++;
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Organization Seeding Complete!');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  ✓ Organizations created: ${createdCount}`);
    console.log(`  ✓ Organizations updated: ${updatedCount}`);
    console.log(`  ✓ Organizations skipped: ${skippedCount}`);
    console.log(`  ✓ Total processed: ${defaultOrganizations.length}`);

    if (dryRun) {
      console.log('\n⚠️  This was a dry-run. No changes were written.');
      console.log('   Run without --dry-run to apply changes.');
    } else {
      console.log('\n🎉 Organizations seeded successfully!');
    }

  } catch (error) {
    console.error('\n❌ Seeding error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { seed };

