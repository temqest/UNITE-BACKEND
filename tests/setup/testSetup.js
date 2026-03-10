/**
 * Test Setup Configuration
 * Handles database connection, test environment setup, and cleanup
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { getConnectionUri } = require('../../src/utils/dbConnection');

// Mock tenantStorage so all legacy tests bypass the new multi-tenancy requirements globally
jest.mock('../../src/utils/tenantStorage', () => ({
  tenantContextStorage: {
    run: jest.fn((ctx, cb) => cb()),
    enterWith: jest.fn(),
    getStore: jest.fn(() => ({ bypassTenant: true }))
  },
  runWithTenantContext: jest.fn((ctx, cb) => cb()),
  runWithoutTenantContext: jest.fn((cb) => cb()),
  getTenantContext: jest.fn(() => ({ bypassTenant: true }))
}));

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
  }
});

// Wrap every test inside a bypassTenant context
beforeEach((done) => {
  tenantContextStorage.enterWith({ bypassTenant: true });
  done();
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

