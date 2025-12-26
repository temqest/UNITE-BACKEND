module.exports = {
  testEnvironment: 'node',
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/utils/migrations/**',
    '!src/utils/seed/**'
  ],
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/eventRequests/eventRequest.test.js' // Exclude Mocha test file
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/testSetup.js'],
  // Handle ES modules - uuid v13+ uses pure ES modules
  // Transform uuid and other ES module packages
  transformIgnorePatterns: [
    'node_modules/(?!(uuid)/)'
  ],
  // Use Babel to transform ES modules to CommonJS
  transform: {
    '^.+\\.js$': 'babel-jest'
  }
};

