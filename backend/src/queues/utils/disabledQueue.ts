import logger from '../../config/logger';

/**
 * Creates a lightweight no-op queue compatible with the subset of BullMQ APIs
 * used by the backend when Redis is intentionally disabled in development.
 */
export function createDisabledQueue(queueName: string) {
  logger.warn(`⚠️ Queue ${queueName} is running in disabled mode (REDIS_ENABLED=false)`);

  return {
    async add() {
      return {
        id: `disabled-${queueName}-${Date.now()}`,
        name: queueName,
      };
    },
    async close() {
      return;
    },
    on() {
      return;
    },
    async isPaused() {
      return true;
    },
    async getJobCounts() {
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        paused: 0,
      };
    },
    async getJobs() {
      return [];
    },
    async getJob() {
      return null;
    },
    async pause() {
      return;
    },
    async resume() {
      return;
    },
    async clean() {
      return [];
    },
    async getRepeatableJobs() {
      return [];
    },
    async removeRepeatableByKey() {
      return;
    },
  };
}
