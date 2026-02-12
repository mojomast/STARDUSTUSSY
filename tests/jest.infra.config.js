module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/infrastructure/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageDirectory: 'reports/coverage-infra',
  coverageReporters: ['text', 'lcov'],
  reporters: ['default'],
  testTimeout: 120000,
  setupFilesAfterEnv: ['<rootDir>/setupInfraTests.ts'],
  verbose: true,
};
