/**
 * Jest Global Setup File
 * Configures test environment variables and global mocks
 */

// Set test environment variables before anything imports config
process.env.REDIS_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs in tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.DATABASE_URL =
	process.env.TEST_DATABASE_URL ||
	process.env.DATABASE_URL ||
	'postgresql://postgres:postgres@localhost:5432/blackpot_test';

jest.mock('ioredis', () => require('ioredis-mock'));

import { cleanupTestData, getRegisteredTestTenants } from './tests/helpers/testSetup';

// Optional: Set default test timeouts
jest.setTimeout(30000);

beforeAll(async () => {
	for (const tenantId of getRegisteredTestTenants()) {
		await cleanupTestData(tenantId);
	}
});

afterAll(async () => {
	for (const tenantId of getRegisteredTestTenants()) {
		await cleanupTestData(tenantId);
	}
});
