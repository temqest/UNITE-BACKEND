const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
require('dotenv').config();
const { Stakeholder } = require('./src/models');

async function hashPlainTextPasswords() {
  try {
    // Connect to database
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/unite';
    const dbName = process.env.MONGO_DB_NAME || 'unite';
    
    console.log('Connecting to:', mongoUri);
    console.log('Database:', dbName);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: dbName
    });

    console.log('Connected to database');
    
    // Check what collections exist
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Check if Stakeholder collection exists
    const stakeholderCollection = collections.find(c => c.name === 'stakeholders');
    if (!stakeholderCollection) {
      console.log('⚠️  Stakeholder collection not found. Available collections:', collections.map(c => c.name));
    }

    // Find all stakeholders
    const stakeholders = await Stakeholder.find({});
    console.log(`Found ${stakeholders.length} stakeholders`);

    let updatedCount = 0;
    let plainTextCount = 0;

    for (const stakeholder of stakeholders) {
      // Check if password is plain text (doesn't start with bcrypt hash prefix)
      if (stakeholder.password && !stakeholder.password.startsWith('$2a$') && !stakeholder.password.startsWith('$2b$')) {
        plainTextCount++;
        console.log(`Found plain text password for stakeholder: ${stakeholder.email} (${stakeholder.Stakeholder_ID})`);

        // Hash the plain text password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(stakeholder.password, saltRounds);

        // Update the stakeholder with hashed password
        await Stakeholder.updateOne(
          { _id: stakeholder._id },
          { password: hashedPassword }
        );

        updatedCount++;
        console.log(`✅ Updated password for: ${stakeholder.email}`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`- Total stakeholders: ${stakeholders.length}`);
    console.log(`- Plain text passwords found: ${plainTextCount}`);
    console.log(`- Passwords updated: ${updatedCount}`);

    if (plainTextCount === 0) {
      console.log('🎉 No plain text passwords found! All passwords are already hashed.');
    } else {
      console.log('✅ Password hashing migration completed successfully!');
    }

  } catch (error) {
    console.error('❌ Error during password hashing migration:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

// Run the migration
if (require.main === module) {
  console.log('🔄 Starting password hashing migration...');
  hashPlainTextPasswords();
}

module.exports = { hashPlainTextPasswords };