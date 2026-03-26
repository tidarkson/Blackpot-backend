/**
 * Workers Entry Point
 * Standalone process for BullMQ workers in production.
 */

import logger from './config/logger';
import {
  emailWorker,
  reportWorker,
  dataProcessingWorker,
  scheduledWorker,
  emailQueue,
  reportQueue,
  dataProcessingQueue,
  scheduledQueue,
  failedJobsQueue,
  JOB_NAMES,
} from './queues';

let isShuttingDown = false;

async function initializeScheduledJobs() {
  try {
    logger.info('⏰ Initializing scheduled recurring jobs...');

    await scheduledQueue.addScheduledJob(
      JOB_NAMES.DAILY_SALES_RECONCILIATION,
      { taskType: 'reconciliation' },
      { repeat: { pattern: '0 0 * * *' } }
    );

    await scheduledQueue.addScheduledJob(
      JOB_NAMES.WEEKLY_REPORT_GENERATION,
      { taskType: 'report' },
      { repeat: { pattern: '0 8 * * 1' } }
    );

    await scheduledQueue.addScheduledJob(
      JOB_NAMES.MONTHLY_CLOSING,
      { taskType: 'cleanup' },
      { repeat: { pattern: '0 1 1 * *' } }
    );

    await scheduledQueue.addScheduledJob(
      JOB_NAMES.DAILY_BACKUP,
      { taskType: 'backup' },
      { repeat: { pattern: '0 2 * * *' } }
    );

    logger.info('✅ Scheduled recurring jobs initialized');
  } catch (error) {
    logger.error('Failed to initialize scheduled jobs:', error);
    throw error;
  }
}

async function startWorkers() {
  try {
    logger.info('🚀 Starting BullMQ workers process...');
    await initializeScheduledJobs();

    logger.info('✅ All workers are running and listening for jobs');
    logger.info('📧 Email Worker: Processing email jobs');
    logger.info('📊 Report Worker: Processing report jobs');
    logger.info('⚙️ Data Processing Worker: Processing data jobs');
    logger.info('⏰ Scheduled Worker: Processing scheduled jobs');

    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start workers:', error);
    process.exit(1);
  }
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info('🛑 Shutting down workers gracefully...');
  logger.info('⏳ Draining queue — waiting for active jobs to complete before exit...');

  try {
    await Promise.all([
      emailWorker.close(),
      reportWorker.close(),
      dataProcessingWorker.close(),
      scheduledWorker.close(),
    ]);

    await Promise.all([
      emailQueue.close(),
      reportQueue.close(),
      dataProcessingQueue.close(),
      scheduledQueue.close(),
      failedJobsQueue.close(),
    ]);

    logger.info('✅ Workers and queues closed gracefully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during workers shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception in workers process:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });

  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  logger.error('Unhandled Rejection in workers process:', {
    reason,
    promise: promise.toString(),
  });

  process.exit(1);
});

startWorkers().catch((error) => {
  logger.error('Failed to start workers:', error);
  process.exit(1);
});
