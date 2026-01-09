/**
 * Migration Script: Fix Broken Stakeholder Organizations
 * 
 * This script fixes stakeholders created from sign-up requests that have:
 * - Empty organizations[] array
 * - Missing organizationId
 * - Only organizationInstitution text field
 * 
 * It attempts to:
 * 1. Match organizationInstitution to existing organizations
 * 2. Assign the organization properly using UserOrganization.assignOrganization()
 * 3. Set organizationId and organizationType
 * 4. Populate organizations[] array
 * 
 * Usage:
 *   node src/utils/migrations/fixBrokenStakeholderOrganizations.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be done without making changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

const { 
  User, 
  UserOrganization,
  Organization,
  SignUpRequest
} = require('../../models/index');

// Accept multiple env names for compatibility
const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL || null;
const mongoDbName = process.env.MONGO_DB_NAME || null;

if (!rawMongoUri) {
  console.error('❌ ERROR: MongoDB connection string is not defined (MONGODB_URI or MONGO_URI)');
  process.exit(1);
}

let MONGO_URI = rawMongoUri;
if (mongoDbName) {
  const idx = rawMongoUri.indexOf('?');
  const beforeQuery = idx === -1 ? rawMongoUri : rawMongoUri.slice(0, idx);
  const hasDb = /\/[A-Za-z0-9_\-]+$/.test(beforeQuery);
  if (!hasDb) {
    if (idx === -1) {
      MONGO_URI = `${rawMongoUri.replace(/\/$/, '')}/${mongoDbName}`;
    } else {
      MONGO_URI = `${rawMongoUri.slice(0, idx).replace(/\/$/, '')}/${mongoDbName}${rawMongoUri.slice(idx)}`;
    }
  }
}

const dryRun = process.argv.includes('--dry-run');

/**
 * Find broken stakeholders that need organization assignment
 */
async function findBrokenStakeholders() {
  // Find stakeholders with:
  // 1. Authority < 60 (stakeholder level)
  // 2. Empty or missing organizations[] array
  // 3. Has organizationInstitution text field
  // 4. Missing or null organizationId
  const brokenStakeholders = await User.find({
    authority: { $lt: 60 },
    isActive: true,
    $or: [
      { organizations: { $exists: false } },
      { organizations: { $size: 0 } },
      { organizations: [] }
    ],
    organizationInstitution: { $exists: true, $ne: null, $ne: '' },
    $or: [
      { organizationId: { $exists: false } },
      { organizationId: null }
    ]
  });

  return brokenStakeholders;
}

/**
 * Attempt to match organizationInstitution to an existing organization
 */
async function findMatchingOrganization(organizationInstitution) {
  if (!organizationInstitution || !organizationInstitution.trim()) {
    return null;
  }

  const searchTerm = organizationInstitution.trim();
  
  // Try exact match first (case-insensitive)
  let org = await Organization.findOne({
    name: { $regex: new RegExp(`^${searchTerm}$`, 'i') },
    isActive: true
  });

  if (org) {
    return org;
  }

  // Try partial match (contains)
  org = await Organization.findOne({
    name: { $regex: new RegExp(searchTerm, 'i') },
    isActive: true
  });

  if (org) {
    return org;
  }

  // Note: We can't search SignUpRequest by organizationInstitution text
  // This is handled separately when processing each stakeholder

  if (signupRequest && signupRequest.organizationId) {
    const org = signupRequest.organizationId;
    if (org.isActive) {
      return org;
    }
  }

  return null;
}

/**
 * Fix a broken stakeholder by assigning organization
 */
async function fixStakeholder(stakeholder, organization, approverId = null) {
  try {
    if (dryRun) {
      console.log(`  [DRY RUN] Would fix stakeholder ${stakeholder.email}:`);
      console.log(`    - Assign organization: ${organization.name} (${organization._id})`);
      console.log(`    - Set organizationId: ${organization._id}`);
      console.log(`    - Set organizationType: ${organization.type}`);
      return { success: true, dryRun: true };
    }

    // Use proper assignment method
    await UserOrganization.assignOrganization(
      stakeholder._id,
      organization._id,
      {
        roleInOrg: 'member',
        isPrimary: true,
        assignedBy: approverId || null
      }
    );

    // Set top-level organizationId and organizationType
    stakeholder.organizationId = organization._id;
    stakeholder.organizationType = organization.type;

    // Update embedded organizations array
    stakeholder.organizations = [{
      organizationId: organization._id,
      organizationName: organization.name,
      organizationType: organization.type,
      isPrimary: true,
      assignedAt: new Date(),
      assignedBy: approverId || null
    }];

    await stakeholder.save();

    return { success: true, organization: organization.name };
  } catch (error) {
    console.error(`  ❌ Error fixing stakeholder ${stakeholder.email}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main migration function
 */
async function fixBrokenStakeholderOrganizations() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✓ Connected to MongoDB\n');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    const results = {
      fixed: [],
      notFound: [],
      multipleMatches: [],
      failed: [],
      skipped: []
    };

    // Find broken stakeholders
    console.log('Finding broken stakeholders...');
    const brokenStakeholders = await findBrokenStakeholders();
    console.log(`Found ${brokenStakeholders.length} broken stakeholders\n`);

    if (brokenStakeholders.length === 0) {
      console.log('✓ No broken stakeholders found. All stakeholders have proper organization assignments.');
      await mongoose.disconnect();
      return;
    }

    // Process each broken stakeholder
    for (const stakeholder of brokenStakeholders) {
      console.log(`\nProcessing stakeholder: ${stakeholder.email}`);
      console.log(`  - organizationInstitution: ${stakeholder.organizationInstitution || 'N/A'}`);
      console.log(`  - organizationId: ${stakeholder.organizationId || 'MISSING'}`);
      console.log(`  - organizations[]: ${stakeholder.organizations?.length || 0} entries`);

      // Try to find matching organization
      const matchingOrg = await findMatchingOrganization(stakeholder.organizationInstitution);

      if (!matchingOrg) {
        console.log(`  ⚠️  No matching organization found for "${stakeholder.organizationInstitution}"`);
        results.notFound.push({
          userId: stakeholder._id,
          email: stakeholder.email,
          organizationInstitution: stakeholder.organizationInstitution
        });
        continue;
      }

      console.log(`  ✓ Found matching organization: ${matchingOrg.name} (${matchingOrg._id})`);

      // Try to find the approver from SignUpRequest if available
      let approverId = null;
      try {
        const signupRequest = await SignUpRequest.findOne({
          email: stakeholder.email.toLowerCase()
        }).sort({ createdAt: -1 });
        
        if (signupRequest && signupRequest.organizationId) {
          // Check if the organization matches
          const orgIdStr = signupRequest.organizationId.toString();
          const matchingOrgIdStr = matchingOrg._id.toString();
          if (orgIdStr === matchingOrgIdStr) {
            // This is the correct organization from the signup request
            console.log(`  ✓ Organization matches signup request`);
          }
        }
      } catch (err) {
        // Ignore errors when looking up signup request
      }

      // Fix the stakeholder
      const fixResult = await fixStakeholder(stakeholder, matchingOrg, approverId);

      if (fixResult.success) {
        if (!fixResult.dryRun) {
          console.log(`  ✓ Fixed stakeholder: ${stakeholder.email}`);
        }
        results.fixed.push({
          userId: stakeholder._id,
          email: stakeholder.email,
          organizationId: matchingOrg._id,
          organizationName: matchingOrg.name
        });
      } else {
        results.failed.push({
          userId: stakeholder._id,
          email: stakeholder.email,
          error: fixResult.error
        });
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Fixed: ${results.fixed.length}`);
    console.log(`Not Found (needs manual review): ${results.notFound.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Total Processed: ${brokenStakeholders.length}`);

    if (results.fixed.length > 0) {
      console.log('\n✓ Fixed Stakeholders:');
      results.fixed.forEach(item => {
        console.log(`  - ${item.email} → ${item.organizationName}`);
      });
    }

    if (results.notFound.length > 0) {
      console.log('\n⚠️  Stakeholders needing manual review:');
      results.notFound.forEach(item => {
        console.log(`  - ${item.email} (organizationInstitution: "${item.organizationInstitution}")`);
      });
    }

    if (results.failed.length > 0) {
      console.log('\n❌ Failed to fix:');
      results.failed.forEach(item => {
        console.log(`  - ${item.email}: ${item.error}`);
      });
    }

    await mongoose.disconnect();
    console.log('\n✓ Migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  fixBrokenStakeholderOrganizations()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { fixBrokenStakeholderOrganizations };

