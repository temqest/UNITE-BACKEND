/**
 * Complete diagnostic: Show ALL potential coordinators and their matching criteria
 */

const mongoose = require('mongoose');
const User = require('../../models/users_models/user.model');
require('dotenv').config();

async function fullDiagnostic() {
  try {
    console.log('🔍 FULL COORDINATOR DIAGNOSTIC\n');

    // Get coordinators using new query logic (role OR authority)
    const coordinators = await User.find({
      $or: [
        { 'roles.roleCode': 'coordinator', isActive: true },
        { authority: { $gte: 60 }, isActive: true }
      ],
      isActive: true
    })
      .select('firstName lastName authority roles organizations coverageAreas')
      .populate('organizations')
      .populate('coverageAreas');

    console.log(`Found ${coordinators.length} coordinators (using role OR authority >= 60)\n`);

    coordinators.forEach(coord => {
      const roles = (coord.roles || []).map(r => r.roleCode).join(', ');
      const orgTypes = (coord.organizations || []).map(o => o.organizationType).join(', ');
      const coverageNames = (coord.coverageAreas || []).map(ca => ca.coverageAreaName).join(', ');

      console.log(`${coord.firstName} ${coord.lastName}`);
      console.log(`  Authority: ${coord.authority || 'undefined'}`);
      console.log(`  Roles: ${roles || 'none'}`);
      console.log(`  Org Types: ${orgTypes || 'none'}`);
      console.log(`  Coverage Areas: ${coverageNames || 'none'}`);
      console.log();
    });

    // Now check a specific stakeholder
    const stakeholder = await User.findById('697184d66d0127f028ac2ee4')
      .populate('organizations')
      .populate('locations.municipalityId');

    if (stakeholder) {
      console.log(`\n✅ Stakeholder: ${stakeholder.firstName} ${stakeholder.lastName}`);
      console.log(`   Org Types: ${(stakeholder.organizations || []).map(o => o.organizationType).join(', ')}`);
      console.log(`   Municipality: ${stakeholder.locations?.[0]?.municipalityId?.name || 'unknown'}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

mongoose.connect(process.env.MONGODB_URI).then(() => {
  console.log('✅ Connected to MongoDB\n');
  fullDiagnostic();
}).catch(err => {
  console.error('❌ Connection failed:', err.message);
  process.exit(1);
});
