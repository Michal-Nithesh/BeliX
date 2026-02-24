/**
 * Jest Configuration
 * Test framework setup for BeliX
 */

module.exports = {
  displayName: 'BeliX Bot',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.mock.js',
    '!src/config/**',
    '!src/utils/logger.js',
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  moduleFileExtensions: ['js'],
  verbose: true,
  bail: false,
  testTimeout: 10000,
};
