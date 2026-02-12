module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/integration/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageDirectory: 'reports/coverage-integration',
  coverageReporters: ['text', 'lcov', 'html'],
  reporters: ['default'],
  testTimeout: 60000,
  setupFilesAfterEnv: ['<rootDir>/setupIntegrationTests.ts'],
  verbose: true,
  maxWorkers: 1,
};
