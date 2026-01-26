require('dotenv').config();
const mongoose = require('mongoose');
const Location = require('../models/utility_models/location.model');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const provinces = await Location.find({ type: 'Province' }, { name: 1 });
    console.log('Provinces found:');
    provinces.forEach(p => console.log(`  - ${p.name}`));
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
