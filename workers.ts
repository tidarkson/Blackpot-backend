/**
 * Workers Entry Point
 * Standalone process for running BullMQ workers
 * Run separately from main application: ts-node backend/workers.ts
 */

import logger from './backend/src/config/logger';
import {
  emailWorker,
  reportWorker,
  dataProcessingWorker,
  scheduledWorker,
  JOB_NAMES,
  QUEUE_NAMES,
} from './backend/src/queues';
import { scheduledQueue } from './backend/src/queues';

/**
 * Initialize scheduled jobs that recur
 * These are set up only once when workers start
 */
async function initializeScheduledJobs() {
  try {
    logger.info('⏰ Initializing scheduled recurring jobs...');

    // Daily sales reconciliation at midnight
    await scheduledQueue.addScheduledJob(
      JOB_NAMES.DAILY_SALES_RECONCILIATION,
      {
        taskType: 'reconciliation',
      },
      {
        repeat: {
          pattern: '0 0 * * *', // Midnight every day
        },
      }
    );

    // Weekly report generation every Monday at 8 AM
    await scheduledQueue.addScheduledJob(
      JOB_NAMES.WEEKLY_REPORT_GENERATION,
      {
        taskType: 'report',
      },
      {
        repeat: {
          pattern: '0 8 * * 1', // 8 AM Monday
        },
      }
    );

    // Monthly closing on the 1st at 1 AM
    await scheduledQueue.addScheduledJob(
      JOB_NAMES.MONTHLY_CLOSING,
      {
        taskType: 'cleanup',
      },
      {
        repeat: {
          pattern: '0 1 1 * *', // 1 AM on 1st of month
        },
      }
    );

    // Daily backup at 2 AM
    await scheduledQueue.addScheduledJob(
      JOB_NAMES.DAILY_BACKUP,
      {
        taskType: 'backup',
      },
      {
        repeat: {
          pattern: '0 2 * * *', // 2 AM every day
        },
      }
    );

    logger.info('✅ Scheduled recurring jobs initialized');
  } catch (error) {
    logger.error('Failed to initialize scheduled jobs:', error);
    throw error;
  }
}

/**
 * Start all workers
 */
async function startWorkers() {
  try {
    logger.info('🚀 Starting BullMQ Workers...');

    // Initialize scheduled recurring jobs
    await initializeScheduledJobs();

    // Workers are auto-started when instantiated due to autorun: true
    logger.info('✅ All workers are running and listening for jobs');
    logger.info('📧 Email Worker: Processing email jobs');
    logger.info('📊 Report Worker: Processing report jobs');
    logger.info('⚙️ Data Processing Worker: Processing data jobs');
    logger.info('⏰ Scheduled Worker: Processing scheduled jobs');

    // Keep the process alive
    process.stdin.resume();
  } catch (error) {
    logger.error('Failed to start workers:', error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  logger.info('🛑 Shutting down workers gracefully...');

  try {
    // Close workers
    await emailWorker.close();
    await reportWorker.close();
    await dataProcessingWorker.close();
    await scheduledWorker.close();

    logger.info('✅ All workers closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });

  process.exit(1);
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  logger.error('Unhandled Rejection:', {
    reason,
    promise: promise.toString(),
  });

  process.exit(1);
});

// Start workers
startWorkers().catch((error) => {
  logger.error('Failed to start workers:', error);
  process.exit(1);
});
