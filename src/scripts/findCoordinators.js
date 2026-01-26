require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/users_models/user.model');
const CoverageArea = require('../models/utility_models/coverageArea.model');
const UserCoverageAssignment = require('../models/users_models/userCoverageAssignment.model');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    // Find the coverage area for District II
    const coverageArea = await CoverageArea.findOne({
      name: { $regex: 'Camarines Sur.*District II', $options: 'i' }
    });
    
    if (!coverageArea) {
      console.log('Coverage area not found');
      process.exit(1);
    }
    
    console.log(`\nCoverage Area: ${coverageArea.name} (ID: ${coverageArea._id})`);
    
    // Find all users assigned to this coverage area
    const assignments = await UserCoverageAssignment.find({ 
      coverageAreaId: coverageArea._id,
      isActive: true 
    }).populate('userId');
    
    console.log(`\nUsers assigned to ${coverageArea.name}:`);
    if (assignments.length === 0) {
      console.log('  (none found)');
    } else {
      assignments.forEach(assignment => {
        const user = assignment.userId;
        console.log(`  - ${user.email} (${user.firstName} ${user.lastName}) - Role: ${assignment.role}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
