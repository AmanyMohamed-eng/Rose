module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  setupFiles: ['<rootDir>/tests/helpers/setup-env.js'],
  globalSetup: '<rootDir>/tests/helpers/global-setup.js',
  testTimeout: 30000,
};
