/**
 * Fix Organization Types Script
 * 
 * Fixes organizations that have incorrect types. Specifically:
 * - Organizations with names ending in "LGU" should have type 'LGU' (not 'Other')
 * - Ensures all organization types conform to the enum: ['LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other']
 * 
 * Usage: from project root run:
 *   node src/utils/fixOrganizationTypes.js [--dry-run]
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env
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
 * Main function to fix organization types
 */
async function fixOrganizationTypes() {
  if (dryRun) {
    console.log('🔍 Running in DRY-RUN mode — no writes will be performed.\n');
  }

  console.log('🔧 Starting Organization Type Fix\n');
  console.log('='.repeat(60));

  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    // Find all organizations
    const organizations = await Organization.find({});
    console.log(`\n📋 Found ${organizations.length} organization(s) to check\n`);

    let fixedCount = 0;
    let skippedCount = 0;
    const validTypes = ['LGU', 'NGO', 'Hospital', 'BloodBank', 'RedCross', 'Non-LGU', 'Other'];

    for (const org of organizations) {
      let needsUpdate = false;
      let newType = org.type;
      let reason = '';

      // Fix: Organizations with names ending in "LGU" should have type 'LGU'
      if (org.name && org.name.trim().toUpperCase().endsWith('LGU')) {
        if (org.type !== 'LGU') {
          needsUpdate = true;
          newType = 'LGU';
          reason = `Name ends with "LGU" but type is "${org.type}"`;
        }
      }

      // Validate type is in enum
      if (!validTypes.includes(org.type)) {
        // Try to infer correct type from name
        const nameUpper = org.name ? org.name.toUpperCase() : '';
        if (nameUpper.includes('LGU') || nameUpper.endsWith('LGU')) {
          newType = 'LGU';
          reason = `Invalid type "${org.type}", inferred "LGU" from name`;
        } else if (nameUpper.includes('HOSPITAL')) {
          newType = 'Hospital';
          reason = `Invalid type "${org.type}", inferred "Hospital" from name`;
        } else if (nameUpper.includes('BLOOD') || nameUpper.includes('BLOOD BANK')) {
          newType = 'BloodBank';
          reason = `Invalid type "${org.type}", inferred "BloodBank" from name`;
        } else if (nameUpper.includes('RED CROSS') || nameUpper.includes('REDCROSS')) {
          newType = 'RedCross';
          reason = `Invalid type "${org.type}", inferred "RedCross" from name`;
        } else if (nameUpper.includes('NGO')) {
          newType = 'NGO';
          reason = `Invalid type "${org.type}", inferred "NGO" from name`;
        } else {
          newType = 'Other';
          reason = `Invalid type "${org.type}", defaulting to "Other"`;
        }
        needsUpdate = true;
      }

      if (needsUpdate) {
        console.log(`  🔄 ${org.name}:`);
        console.log(`     Current type: ${org.type}`);
        console.log(`     New type: ${newType}`);
        console.log(`     Reason: ${reason}`);

        if (!dryRun) {
          org.type = newType;
          await org.save();
          console.log(`     ✓ Updated successfully`);
        } else {
          console.log(`     ⚠ Would update (dry-run mode)`);
        }
        fixedCount++;
      } else {
        skippedCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Organization Type Fix Complete!');
    console.log('='.repeat(60));
    console.log(`\n📊 Summary:`);
    console.log(`  ✓ Organizations checked: ${organizations.length}`);
    console.log(`  ✓ Organizations fixed: ${fixedCount}`);
    console.log(`  ✓ Organizations skipped (already correct): ${skippedCount}`);

    if (dryRun) {
      console.log('\n⚠️  This was a dry-run. No changes were written.');
      console.log('   Run without --dry-run to apply changes.');
    }

  } catch (error) {
    console.error('\n❌ Error fixing organization types:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  fixOrganizationTypes().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { fixOrganizationTypes };

