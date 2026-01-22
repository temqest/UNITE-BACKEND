/**
 * Diagnostic Script: Stakeholder Filtering Validation
 * 
 * Validates coordinator/stakeholder data structure and tests filtering logic
 * to identify issues with admin-side stakeholder filtering during event creation.
 * 
 * Usage:
 *   node src/utils/diagnoseStakeholderFiltering.js [coordinatorId]
 * 
 * If coordinatorId is provided, tests filtering for that specific coordinator.
 * Otherwise, tests all coordinators in the system.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/users_models/user.model');
const Location = require('../models/utility_models/location.model');
const CoverageArea = require('../models/utility_models/coverageArea.model');
const stakeholderFilteringService = require('../services/users_services/stakeholderFiltering.service');

// Resolve MongoDB URI: prefer MONGODB_URI, then MONGO_URI from .env.
// If a separate MONGO_DB_NAME is provided, inject it into the URI when missing.
function buildMongoUri() {
  const raw = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!raw) return 'mongodb://localhost:27017/unite';

  let uri = raw;
  const dbName = process.env.MONGO_DB_NAME;
  if (dbName) {
    // If URI already contains a path with a DB name, leave it.
    // Detect pattern like '/?query' or '/dbname' after host.
    if (uri.match(/\/[^\/?]+(?=\?|$)/)) {
      // Already has a path component (may be db or '/'). Do nothing.
    } else if (uri.includes('?')) {
      uri = uri.replace('/?', `/${dbName}?`);
    } else if (uri.endsWith('/')) {
      uri = `${uri}${dbName}`;
    } else {
      uri = `${uri}/${dbName}`;
    }
  }

  return uri;
}

const MONGODB_URI = buildMongoUri();

/**
 * Validate coordinator data structure
 */
async function validateCoordinator(coordinator) {
  const issues = [];
  const warnings = [];

  // Check coverage areas
  if (!coordinator.coverageAreas || coordinator.coverageAreas.length === 0) {
    issues.push('❌ Coordinator has no coverage areas assigned');
  } else {
    coordinator.coverageAreas.forEach((coverage, idx) => {
      if (!coverage.coverageAreaId) {
        issues.push(`❌ Coverage area ${idx} missing coverageAreaId`);
      }
      if (!coverage.coverageAreaName) {
        warnings.push(`⚠️  Coverage area ${idx} missing coverageAreaName`);
      }
      if (!coverage.municipalityIds || coverage.municipalityIds.length === 0) {
        if (!coverage.districtIds || coverage.districtIds.length === 0) {
          warnings.push(`⚠️  Coverage area ${idx} has no municipalityIds or districtIds`);
        }
      }
    });
  }

  // Check organizations
  if (!coordinator.organizations || coordinator.organizations.length === 0) {
    warnings.push('⚠️  Coordinator has no organizations assigned');
  } else {
    coordinator.organizations.forEach((org, idx) => {
      if (!org.organizationId) {
        issues.push(`❌ Organization ${idx} missing organizationId`);
      }
      if (!org.organizationType) {
        issues.push(`❌ Organization ${idx} missing organizationType`);
      }
      if (org.isActive === false) {
        warnings.push(`⚠️  Organization ${idx} is inactive`);
      }
    });
  }

  // Check for non-existent organizationTypes field
  if (coordinator.organizationTypes) {
    issues.push('❌ Coordinator has deprecated organizationTypes field (should use organizations[].organizationType)');
  }

  return { issues, warnings };
}

/**
 * Validate stakeholder data structure
 */
async function validateStakeholder(stakeholder) {
  const issues = [];
  const warnings = [];

  // Check location
  if (!stakeholder.locations || !stakeholder.locations.municipalityId) {
    issues.push('❌ Stakeholder has no municipality assigned');
  } else {
    // Verify municipality exists
    const municipality = await Location.findById(stakeholder.locations.municipalityId).lean();
    if (!municipality) {
      issues.push(`❌ Stakeholder's municipality (${stakeholder.locations.municipalityId}) does not exist`);
    } else if (municipality.type !== 'municipality') {
      issues.push(`❌ Stakeholder's location is not a municipality (type: ${municipality.type})`);
    }
  }

  // Check organizations
  if (!stakeholder.organizations || stakeholder.organizations.length === 0) {
    warnings.push('⚠️  Stakeholder has no organizations assigned');
  } else {
    stakeholder.organizations.forEach((org, idx) => {
      if (!org.organizationId) {
        issues.push(`❌ Organization ${idx} missing organizationId`);
      }
      if (!org.organizationType) {
        issues.push(`❌ Organization ${idx} missing organizationType`);
      }
      if (org.isActive === false) {
        warnings.push(`⚠️  Organization ${idx} is inactive`);
      }
    });
  }

  // Check for non-existent organizationTypes field
  if (stakeholder.organizationTypes) {
    issues.push('❌ Stakeholder has deprecated organizationTypes field (should use organizations[].organizationType)');
  }

  return { issues, warnings };
}

/**
 * Test filtering for a specific coordinator
 */
async function testFilteringForCoordinator(coordinatorId) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing Filtering for Coordinator: ${coordinatorId}`);
  console.log('='.repeat(80));

  // Fetch coordinator
  const coordinator = await User.findById(coordinatorId)
    .select('coverageAreas organizations firstName lastName email authority')
    .lean();

  if (!coordinator) {
    console.error(`❌ Coordinator not found: ${coordinatorId}`);
    return;
  }

  console.log(`\n📋 Coordinator Info:`);
  console.log(`   Name: ${coordinator.firstName} ${coordinator.lastName}`);
  console.log(`   Email: ${coordinator.email}`);
  console.log(`   Authority: ${coordinator.authority}`);

  // Validate coordinator structure
  const coordValidation = await validateCoordinator(coordinator);
  if (coordValidation.issues.length > 0) {
    console.log(`\n❌ Coordinator Structure Issues:`);
    coordValidation.issues.forEach(issue => console.log(`   ${issue}`));
  }
  if (coordValidation.warnings.length > 0) {
    console.log(`\n⚠️  Coordinator Structure Warnings:`);
    coordValidation.warnings.forEach(warning => console.log(`   ${warning}`));
  }

  // Display coverage areas
  console.log(`\n📍 Coverage Areas (${coordinator.coverageAreas?.length || 0}):`);
  if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
    for (const [idx, coverage] of coordinator.coverageAreas.entries()) {
      console.log(`   ${idx + 1}. ${coverage.coverageAreaName || 'Unnamed'}`);
      console.log(`      - Municipality IDs: ${coverage.municipalityIds?.length || 0}`);
      console.log(`      - District IDs: ${coverage.districtIds?.length || 0}`);
    }
  }

  // Display organizations
  console.log(`\n🏢 Organizations (${coordinator.organizations?.length || 0}):`);
  if (coordinator.organizations && coordinator.organizations.length > 0) {
    const orgTypes = coordinator.organizations
      .filter(org => org.isActive !== false)
      .map(org => org.organizationType)
      .filter(Boolean);
    console.log(`   Types: ${orgTypes.join(', ') || 'None'}`);
    coordinator.organizations.forEach((org, idx) => {
      console.log(`   ${idx + 1}. ${org.organizationName || 'Unnamed'} (${org.organizationType || 'Unknown'}) ${org.isActive === false ? '[INACTIVE]' : ''}`);
    });
  }

  // Fetch all stakeholders
  const allStakeholders = await User.find({
    authority: { $lt: 60 },
    isActive: true
  })
    .select('_id firstName lastName email locations organizations authority')
    .lean();

  console.log(`\n👥 Total Stakeholders in System: ${allStakeholders.length}`);

  // Display stakeholder details for debugging
  console.log(`\n📋 Stakeholder Details:`);
  for (const [idx, stakeholder] of allStakeholders.entries()) {
    const orgTypes = (stakeholder.organizations || [])
      .filter(org => org.isActive !== false)
      .map(org => org.organizationType)
      .filter(Boolean);
    console.log(`   ${idx + 1}. ${stakeholder.firstName} ${stakeholder.lastName}`);
    console.log(`      Municipality ID: ${stakeholder.locations?.municipalityId || 'MISSING'}`);
    console.log(`      Municipality Name: ${stakeholder.locations?.municipalityName || 'MISSING'}`);
    console.log(`      Organization Types: ${orgTypes.join(', ') || 'NONE'}`);
    console.log(`      Organizations: ${(stakeholder.organizations || []).map(o => `${o.organizationName || 'Unknown'} (${o.organizationType || 'Unknown'})`).join(', ') || 'NONE'}`);
  }

  // Test filtering
  const stakeholderIds = allStakeholders.map(s => s._id.toString());
  console.log(`\n🔍 Testing Filtering Service...`);
  
  try {
    const filteredIds = await stakeholderFilteringService.filterStakeholdersByCoverageArea(
      coordinatorId,
      stakeholderIds
    );

    console.log(`\n✅ Filtering Results:`);
    console.log(`   Input: ${stakeholderIds.length} stakeholders`);
    console.log(`   Output: ${filteredIds.length} stakeholders`);
    console.log(`   Filtered: ${stakeholderIds.length - filteredIds.length} stakeholders`);

    // Validate filtered stakeholders
    const filteredStakeholders = allStakeholders.filter(s => 
      filteredIds.includes(s._id.toString())
    );

    console.log(`\n📊 Filtered Stakeholders Breakdown:`);
    
    // Group by organization type
    const byOrgType = {};
    filteredStakeholders.forEach(stakeholder => {
      const orgTypes = (stakeholder.organizations || [])
        .filter(org => org.isActive !== false)
        .map(org => org.organizationType)
        .filter(Boolean);
      
      orgTypes.forEach(orgType => {
        if (!byOrgType[orgType]) {
          byOrgType[orgType] = [];
        }
        byOrgType[orgType].push(stakeholder);
      });
    });

    Object.keys(byOrgType).forEach(orgType => {
      console.log(`   ${orgType}: ${byOrgType[orgType].length} stakeholders`);
    });

    // Sample filtered stakeholders
    if (filteredStakeholders.length > 0) {
      console.log(`\n📝 Sample Filtered Stakeholders (first 5):`);
      filteredStakeholders.slice(0, 5).forEach((stakeholder, idx) => {
        const orgTypes = (stakeholder.organizations || [])
          .filter(org => org.isActive !== false)
          .map(org => org.organizationType)
          .join(', ') || 'None';
        console.log(`   ${idx + 1}. ${stakeholder.firstName} ${stakeholder.lastName} (${orgTypes})`);
        console.log(`      Municipality: ${stakeholder.locations?.municipalityName || stakeholder.locations?.municipalityId || 'Unknown'}`);
      });
    } else {
      console.log(`\n⚠️  No stakeholders matched the filtering criteria`);
    }

    // Validate a few filtered stakeholders
    if (filteredStakeholders.length > 0) {
      console.log(`\n🔬 Validating Sample Filtered Stakeholders...`);
      for (const stakeholder of filteredStakeholders.slice(0, 3)) {
        const validation = await validateStakeholder(stakeholder);
        if (validation.issues.length > 0 || validation.warnings.length > 0) {
          console.log(`\n   Stakeholder: ${stakeholder.firstName} ${stakeholder.lastName}`);
          validation.issues.forEach(issue => console.log(`      ${issue}`));
          validation.warnings.forEach(warning => console.log(`      ${warning}`));
        }
      }
    }

    // Debug: Check why stakeholders were filtered out
    if (filteredStakeholders.length === 0 && allStakeholders.length > 0) {
      console.log(`\n🔍 Debugging: Why were stakeholders filtered out?`);
      
      // Get coordinator's resolved municipality IDs
      const coordinatorMunicipalityIds = new Set();
      if (coordinator.coverageAreas && coordinator.coverageAreas.length > 0) {
        for (const coverage of coordinator.coverageAreas) {
          if (coverage.municipalityIds && coverage.municipalityIds.length > 0) {
            coverage.municipalityIds.forEach(id => {
              coordinatorMunicipalityIds.add(id.toString());
            });
          }
        }
      }
      
      // Get coordinator's organization types (normalized)
      const coordinatorOrgTypes = (coordinator.organizations || [])
        .filter(org => org.isActive !== false && org.organizationType)
        .map(org => String(org.organizationType).toLowerCase().trim());
      
      console.log(`\n   Coordinator Municipality IDs (${coordinatorMunicipalityIds.size}):`, Array.from(coordinatorMunicipalityIds).slice(0, 5));
      console.log(`   Coordinator Organization Types: ${coordinatorOrgTypes.join(', ')}`);
      
      // Check each stakeholder
      for (const stakeholder of allStakeholders) {
        const stakeholderMunicipalityId = stakeholder.locations?.municipalityId?.toString();
        const stakeholderOrgTypes = (stakeholder.organizations || [])
          .filter(org => org.isActive !== false && org.organizationType)
          .map(org => String(org.organizationType).toLowerCase().trim());
        
        const municipalityMatch = stakeholderMunicipalityId && coordinatorMunicipalityIds.has(stakeholderMunicipalityId);
        const orgTypeMatch = stakeholderOrgTypes.length > 0 && coordinatorOrgTypes.length > 0 &&
          stakeholderOrgTypes.some(sType => coordinatorOrgTypes.includes(sType));
        
        console.log(`\n   ${stakeholder.firstName} ${stakeholder.lastName}:`);
        console.log(`      Municipality ID: ${stakeholderMunicipalityId || 'MISSING'}`);
        console.log(`      Municipality Match: ${municipalityMatch ? '✅' : '❌'}`);
        console.log(`      Stakeholder Org Types: ${stakeholderOrgTypes.join(', ') || 'NONE'}`);
        console.log(`      Org Type Match: ${orgTypeMatch ? '✅' : '❌'}`);
        console.log(`      Would Match: ${municipalityMatch && orgTypeMatch ? '✅ YES' : '❌ NO'}`);
      }
    }

  } catch (error) {
    console.error(`\n❌ Filtering Error:`, error.message);
    console.error(error.stack);
  }
}

/**
 * Main diagnostic function
 */
async function diagnose() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const coordinatorId = process.argv[2];

    if (coordinatorId) {
      // Test specific coordinator
      await testFilteringForCoordinator(coordinatorId);
    } else {
      // Test all coordinators
      const coordinators = await User.find({
        authority: { $gte: 60, $lt: 80 },
        isActive: true
      })
        .select('_id firstName lastName email')
        .lean();

      console.log(`\n📋 Found ${coordinators.length} coordinators in system`);
      console.log(`\nTesting filtering for each coordinator...\n`);

      for (const coordinator of coordinators) {
        await testFilteringForCoordinator(coordinator._id);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Diagnostic complete');
  } catch (error) {
    console.error('❌ Diagnostic Error:', error);
    process.exit(1);
  }
}

// Run diagnostic
if (require.main === module) {
  diagnose();
}

module.exports = {
  validateCoordinator,
  validateStakeholder,
  testFilteringForCoordinator
};
