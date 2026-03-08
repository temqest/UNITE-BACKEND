require('dotenv').config();
const mongoose = require('mongoose');
const { Organization } = require('../src/models');

async function main() {
  const rawMongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;
  if (!rawMongoUri) {
    console.error('Missing MONGODB_URI / MONGO_URI / MONGO_URL env var');
    process.exit(1);
  }

  try {
    await mongoose.connect(rawMongoUri);
    console.log('Connected to MongoDB');

    const code = (process.env.DEFAULT_ORG_CODE || 'default').toLowerCase().trim();
    const name = process.env.DEFAULT_ORG_NAME || 'Default Organization';

    let org = await Organization.findOne({ code });
    if (org) {
      console.log('Default organization already exists:');
      console.log(JSON.stringify({ id: org._id.toString(), code: org.code, name: org.name }, null, 2));
      process.exit(0);
    }

    org = new Organization({
      name,
      code,
      type: 'Other',
      description: 'Auto-created default organization for single-tenant migration',
      isActive: true,
      metadata: {}
    });

    await org.save();
    console.log('Created default organization:');
    console.log(JSON.stringify({ id: org._id.toString(), code: org.code, name: org.name }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Failed to create default organization:', err);
    process.exit(1);
  }
}

main();

