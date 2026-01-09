/**
 * Migration Script: Migrate Notifications to New Model
 * 
 * This script migrates existing notifications to use the new recipientUserId field
 * instead of the legacy Recipient_ID + RecipientType combination.
 * 
 * Usage: from project root run:
 *   node src/utils/migrations/migrateNotifications.js [--dry-run] [--batch-size=1000]
 * 
 * The script will:
 *   1. Find all notifications without recipientUserId
 *   2. Resolve User by Recipient_ID + RecipientType (legacy userId field or email)
 *   3. Update notification with recipientUserId
 *   4. Keep legacy fields for backward compatibility
 * 
 * Prerequisites:
 *   - MongoDB connection configured in .env with MONGO_DB_NAME
 *   - Users must be migrated to new User model first
 * 
 * The `--dry-run` flag will report changes without writing.
 */

const { connect, disconnect, getConnectionUri } = require('../dbConnection');
const { Notification, User } = require('../../models');

const dryRun = process.argv.includes('--dry-run');
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 1000;

/**
 * Resolve User from legacy Recipient_ID + RecipientType
 */
async function resolveUserFromLegacyFields(recipientId, recipientType) {
  if (!recipientId) return null;
  
  try {
    // Try to find by legacy userId field
    let user = await User.findOne({ userId: recipientId });
    if (user) return user;
    
    // Try to find by email (if Recipient_ID is an email)
    if (recipientId.includes('@')) {
      user = await User.findOne({ email: recipientId.toLowerCase() });
      if (user) return user;
    }
    
    // Try to find by _id if Recipient_ID is an ObjectId string
    if (recipientId.match(/^[0-9a-fA-F]{24}$/)) {
      user = await User.findById(recipientId);
      if (user) return user;
    }
    
    // Try to find by role-based lookup (for legacy role-specific IDs)
    // This is a fallback - may not always work
    if (recipientType) {
      const roleCode = recipientType.toLowerCase() === 'admin' ? 'system-admin' :
                      recipientType.toLowerCase() === 'coordinator' ? 'coordinator' :
                      recipientType.toLowerCase() === 'stakeholder' ? 'stakeholder' : null;
      
      if (roleCode) {
        // Try to find users with this role and match by some identifier
        // This is a best-effort approach
        const users = await User.find({ 
          'roles.roleCode': roleCode,
          isActive: true 
        }).limit(100);
        
        // Try to match by userId field
        for (const u of users) {
          if (u.userId === recipientId) {
            return u;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`  Error resolving user for ${recipientId}:`, error.message);
    return null;
  }
}

/**
 * Migrate notifications in batches
 */
async function migrateNotifications() {
  console.log('\n📝 Migrating Notifications to New Model');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE (changes will be saved)'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('='.repeat(60));
  
  let totalProcessed = 0;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  let hasMore = true;
  let skip = 0;
  
  while (hasMore) {
    // Find notifications without recipientUserId
    const notifications = await Notification.find({
      $or: [
        { recipientUserId: { $exists: false } },
        { recipientUserId: null }
      ]
    })
    .limit(batchSize)
    .skip(skip)
    .lean();
    
    if (notifications.length === 0) {
      hasMore = false;
      break;
    }
    
    console.log(`\nProcessing batch: ${skip + 1} to ${skip + notifications.length} of notifications`);
    
    for (const notification of notifications) {
      totalProcessed++;
      
      try {
        const recipientId = notification.Recipient_ID;
        const recipientType = notification.RecipientType;
        
        if (!recipientId) {
          console.log(`  ⚠ Skipping notification ${notification.Notification_ID}: No Recipient_ID`);
          totalSkipped++;
          continue;
        }
        
        // Resolve user
        const user = await resolveUserFromLegacyFields(recipientId, recipientType);
        
        if (!user) {
          console.log(`  ⚠ Could not resolve user for notification ${notification.Notification_ID} (Recipient_ID: ${recipientId}, Type: ${recipientType})`);
          totalSkipped++;
          continue;
        }
        
        // Update notification
        if (!dryRun) {
          await Notification.updateOne(
            { Notification_ID: notification.Notification_ID },
            { 
              $set: { 
                recipientUserId: user._id 
              }
            }
          );
        }
        
        console.log(`  ✓ Migrated notification ${notification.Notification_ID} → User ${user.email} (${user._id})`);
        totalMigrated++;
        
      } catch (error) {
        console.error(`  ✗ Error migrating notification ${notification.Notification_ID}:`, error.message);
        totalErrors++;
      }
    }
    
    skip += notifications.length;
    
    // If we got fewer than batchSize, we're done
    if (notifications.length < batchSize) {
      hasMore = false;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary:');
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Successfully migrated: ${totalMigrated}`);
  console.log(`  Skipped (no user found): ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('='.repeat(60));
  
  if (dryRun) {
    console.log('\n⚠ DRY RUN MODE - No changes were saved');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\n✓ Migration complete!');
  }
}

/**
 * Validate migration results
 */
async function validateMigration() {
  console.log('\n🔍 Validating Migration Results');
  console.log('='.repeat(60));
  
  const totalNotifications = await Notification.countDocuments({});
  const notificationsWithNewField = await Notification.countDocuments({ 
    recipientUserId: { $exists: true, $ne: null } 
  });
  const notificationsWithoutNewField = await Notification.countDocuments({
    $or: [
      { recipientUserId: { $exists: false } },
      { recipientUserId: null }
    ]
  });
  
  console.log(`Total notifications: ${totalNotifications}`);
  console.log(`With recipientUserId: ${notificationsWithNewField}`);
  console.log(`Without recipientUserId: ${notificationsWithoutNewField}`);
  
  // Check for invalid ObjectId references
  const invalidReferences = await Notification.countDocuments({
    recipientUserId: { $exists: true, $ne: null },
    recipientUserId: { $type: 'objectId' }
  });
  
  // Verify references exist in User collection
  const notificationsWithRefs = await Notification.find({
    recipientUserId: { $exists: true, $ne: null }
  }).select('recipientUserId').lean();
  
  let validRefs = 0;
  let invalidRefs = 0;
  
  for (const notif of notificationsWithRefs) {
    const user = await User.findById(notif.recipientUserId);
    if (user) {
      validRefs++;
    } else {
      invalidRefs++;
      console.log(`  ⚠ Invalid reference: Notification ${notif.Notification_ID} → User ${notif.recipientUserId} (not found)`);
    }
  }
  
  console.log(`\nReference validation:`);
  console.log(`  Valid references: ${validRefs}`);
  console.log(`  Invalid references: ${invalidRefs}`);
  
  if (invalidRefs > 0) {
    console.log('\n⚠ Warning: Some notifications have invalid user references');
  } else {
    console.log('\n✓ All references are valid');
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await connect();
    console.log('Connected to database');
    
    await migrateNotifications();
    
    if (!dryRun) {
      await validateMigration();
    }
    
    await disconnect();
    console.log('\nDisconnected from database');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Migration failed:', error);
    await disconnect();
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { migrateNotifications, validateMigration, resolveUserFromLegacyFields };

