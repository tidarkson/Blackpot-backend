/**
 * Jest global setup for backend tests.
 * Uses mocked Redis and ensures required env vars are present.
 */
module.exports = async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
  process.env.REDIS_ENABLED = 'false';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/blackpot_test';
  process.env.RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS || 'true';
};