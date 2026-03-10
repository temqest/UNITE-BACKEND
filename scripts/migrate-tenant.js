const mongoose = require('mongoose');
require('dotenv').config();

// We run this without tenant context to see all records globally
const { runWithoutTenantContext } = require('../src/utils/tenantStorage');

// Import all models via index to ensure plugin and schemas are registered
const models = require('../src/models');
const { Organization, User, Event, EventRequest, BloodBag, Notification, Message, Conversation, SystemSettings, SignUpRequest, UserOrganization } = models;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/unite';

async function migrateData() {
  console.log('Starting Single-Tenant to Multi-Tenant Data Migration...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    await runWithoutTenantContext(async () => {
      // 1. Create Default Organization
      let defaultOrg = await Organization.findOne({ name: 'Default Legacy Organization' });
      
      if (!defaultOrg) {
        console.log('Creating Default Legacy Organization...');
        defaultOrg = new Organization({
          name: 'Default Legacy Organization',
          type: 'National',
          code: 'DEFAULT',
          isActive: true
        });
        await defaultOrg.save();
        console.log(`Created Default Organization with ID: ${defaultOrg._id}`);
      } else {
        console.log(`Found existing Default Organization with ID: ${defaultOrg._id}`);
      }

      const defaultOrgId = defaultOrg._id;

      // Helper function to update collections
      const updateCollection = async (Model, modelName) => {
        // Find documents missing organizationId
        const missingQuery = { 
          $or: [
            { organizationId: { $exists: false } }, 
            { organizationId: null }
          ] 
        };
        
        const count = await Model.countDocuments(missingQuery);
        if (count > 0) {
          console.log(`Migrating ${count} records in ${modelName}...`);
          const result = await Model.updateMany(missingQuery, {
            $set: { organizationId: defaultOrgId }
          });
          console.log(`Updated ${result.modifiedCount} records in ${modelName}.`);
        } else {
          console.log(`${modelName} is already up to date.`);
        }
      };

      // 2. Migrate Models
      // Wait for all updates sequentially to not overload connections
      const modelsToMigrate = [
        { model: User, name: 'User' },
        { model: Event, name: 'Event' },
        { model: EventRequest, name: 'EventRequest' },
        { model: BloodBag, name: 'BloodBag' },
        { model: Notification, name: 'Notification' },
        { model: Message, name: 'Message' },
        { model: Conversation, name: 'Conversation' },
        { model: SystemSettings, name: 'SystemSettings' },
        { model: SignUpRequest, name: 'SignUpRequest' }
      ];

      for (const item of modelsToMigrate) {
        // Some models might not have organizationId strictly required, but we want them grouped
        await updateCollection(item.model, item.name);
      }

      // 3. Create UserOrganization mappings for users so they can log in and see the default tenant
      console.log('Creating UserOrganization mappings for users lacking them...');
      const users = await User.find({ organizationId: defaultOrgId }).select('_id');
      let mappingCount = 0;
      
      for (const user of users) {
        const existingMapping = await UserOrganization.findOne({ userId: user._id, organizationId: defaultOrgId });
        if (!existingMapping) {
          await UserOrganization.create({
            userId: user._id,
            organizationId: defaultOrgId,
            roleId: null, // Depending on RBAC setup, might need a generic role
            isActive: true,
            isPrimary: true
          });
          mappingCount++;
        }
      }
      console.log(`Created ${mappingCount} new UserOrganization mappings.`);

      console.log('Migration completed successfully.');
    });

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

migrateData();
