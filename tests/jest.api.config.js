module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/api/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  coverageDirectory: 'reports/coverage-api',
  coverageReporters: ['text', 'lcov', 'html'],
  reporters: ['default'],
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/setupApiTests.ts'],
  verbose: true,
};
