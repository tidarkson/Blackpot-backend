/**
 * Jest global teardown for backend tests.
 */
module.exports = async () => {
  delete process.env.RUN_INTEGRATION_TESTS;
};