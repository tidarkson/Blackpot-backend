/**
 * Jest Global Setup File
 * Configures test environment variables and global mocks
 */

// Set test environment variables before anything imports config
process.env.REDIS_ENABLED = 'false';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Suppress logs in tests

// Optional: Set default test timeouts
jest.setTimeout(30000);
