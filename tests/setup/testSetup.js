/**
 * Test Setup Configuration
 * Handles database connection, test environment setup, and cleanup
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { getConnectionUri } = require('../../src/utils/dbConnection');

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test setup
beforeAll(async () => {
  try {
    // Connect to MongoDB
    const uri = getConnectionUri();
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 5
    });
    console.log('✅ Test database connected');
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error);
    throw error;
  }
});

// Global test teardown
afterAll(async () => {
  try {
    // Close database connection
    await mongoose.connection.close();
    console.log('✅ Test database connection closed');
  } catch (error) {
    console.error('❌ Error closing test database connection:', error);
  }
});

// Clean up test data after each test (optional - can be disabled for debugging)
// Uncomment if you want to clean up after each test
// afterEach(async () => {
//   // Clean up test requests, events, etc.
//   // Be careful not to delete production data
// });

module.exports = {
  mongoose
};

