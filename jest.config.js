module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/backend'],
  testMatch: [
    '<rootDir>/backend/tests/unit/**/*.test.ts',
    '<rootDir>/backend/tests/integration/**/*.test.ts',
    '<rootDir>/backend/tests/*.test.ts',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/backend/src/$1',
  },
  globalSetup: '<rootDir>/backend/tests/helpers/globalSetup.js',
  globalTeardown: '<rootDir>/backend/tests/helpers/globalTeardown.js',
  setupFilesAfterEnv: ['<rootDir>/backend/jest.setup.ts'],
  testTimeout: 30000,
};
