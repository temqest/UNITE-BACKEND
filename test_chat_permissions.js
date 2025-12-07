// Test script for chat permissions
const { permissionsService } = require('./src/services/chat_services');

async function testPermissions() {
  try {
    console.log('Testing Chat Permissions...\n');

    // Test cases - you'll need to replace these with actual user IDs from your database
    const testUsers = {
      systemAdmin: 'ADMIN001', // Replace with actual System Admin ID
      coordinator: 'COORD001', // Replace with actual Coordinator ID
      stakeholder: 'STAKE001'  // Replace with actual Stakeholder ID
    };

    console.log('1. Testing System Admin permissions:');
    try {
      const adminRecipients = await permissionsService.getAllowedRecipients(testUsers.systemAdmin);
      console.log('   Allowed recipients:', adminRecipients);
    } catch (error) {
      console.log('   Error:', error.message);
    }

    console.log('\n2. Testing Coordinator permissions:');
    try {
      const coordRecipients = await permissionsService.getAllowedRecipients(testUsers.coordinator);
      console.log('   Allowed recipients:', coordRecipients);
    } catch (error) {
      console.log('   Error:', error.message);
    }

    console.log('\n3. Testing Stakeholder permissions:');
    try {
      const stakeRecipients = await permissionsService.getAllowedRecipients(testUsers.stakeholder);
      console.log('   Allowed recipients:', stakeRecipients);
    } catch (error) {
      console.log('   Error:', error.message);
    }

    console.log('\n4. Testing permission validation:');
    try {
      // Test if System Admin can message Coordinator
      const canAdminMessageCoord = await permissionsService.canSendMessage(testUsers.systemAdmin, testUsers.coordinator);
      console.log('   System Admin -> Coordinator:', canAdminMessageCoord);

      // Test if Coordinator can message System Admin
      const canCoordMessageAdmin = await permissionsService.canSendMessage(testUsers.coordinator, testUsers.systemAdmin);
      console.log('   Coordinator -> System Admin:', canCoordMessageAdmin);

      // Test if Stakeholder can message Coordinator
      const canStakeMessageCoord = await permissionsService.canSendMessage(testUsers.stakeholder, testUsers.coordinator);
      console.log('   Stakeholder -> Coordinator:', canStakeMessageCoord);

    } catch (error) {
      console.log('   Error:', error.message);
    }

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testPermissions();
}

module.exports = { testPermissions };