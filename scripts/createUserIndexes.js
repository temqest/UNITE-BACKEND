// Script: createUserIndexes.js
// Usage: node scripts/createUserIndexes.js
// Purpose: Ensure user collection has indexes for fast stakeholder filtering by location and org types.

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

if (!MONGO_URI) {
  console.error('Missing MONGODB_URI|MONGO_URI|MONGO_URL');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const userCollection = mongoose.connection.collection('users');

  // Define indexes
  const indexes = [
    { key: { 'locations.municipalityId': 1 }, name: 'idx_user_locations_municipalityId' },
    { key: { 'locations.districtId': 1 }, name: 'idx_user_locations_districtId' },
    { key: { organizationTypes: 1 }, name: 'idx_user_orgTypes' },
    // Optional compounds to help combined filters
    { key: { 'locations.municipalityId': 1, organizationTypes: 1 }, name: 'idx_user_muni_orgTypes' },
    { key: { 'locations.districtId': 1, organizationTypes: 1 }, name: 'idx_user_district_orgTypes' },
  ];

  for (const idx of indexes) {
    try {
      await userCollection.createIndex(idx.key, { name: idx.name, background: true });
      console.log('Created/exists:', idx.name, idx.key);
    } catch (err) {
      console.error('Failed creating index', idx.name, err.message);
    }
  }

  const existing = await userCollection.indexes();
  console.log('Current indexes on users:', existing.map(i => ({ name: i.name, key: i.key })));

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
