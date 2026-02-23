/**
 * BullMQ Queue Configuration
 * Central configuration for all job queues with Redis connection
 */

import { Queue, Worker, QueueOptions, WorkerOptions } from 'bullmq';
import { config } from '../../config/environment';
import logger from '../../config/logger';

// Redis connection configuration
export const redisConnection = {
  host: config.REDIS_HOST || 'localhost',
  port: config.REDIS_PORT || 6379,
  password: config.REDIS_PASSWORD,
  db: config.REDIS_DB || 0,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: true,
};

/**
 * Queue configuration with defaults
 * Each queue inherits these settings
 */
export const defaultQueueOptions: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
    },
    removeOnFail: false, // Keep failed jobs for inspection
  },
};

/**
 * Worker configuration with defaults
 * Each worker inherits these settings
 */
export const defaultWorkerOptions: WorkerOptions = {
  connection: redisConnection,
  concurrency: 5, // Default concurrency level
  autorun: true, // Start processing immediately
  maxStalledCount: 2, // Max stalled attempts
  stalledInterval: 5000, // Check for stalled jobs every 5 seconds
};

/**
 * Queue-specific configurations
 * Override defaults for specific queue needs
 */
export const queueConfigs = {
  email: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 5, // Retry emails up to 5 times
      backoff: {
        type: 'exponential',
        delay: 3000, // Start with 3 seconds for emails
      },
      priority: 2, // Higher priority by default
    },
  },
  report: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 3,
      timeout: 120000, // 2 minute timeout for reports
    },
  },
  dataProcessing: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 3,
      timeout: 180000, // 3 minute timeout for data processing
    },
  },
  scheduled: {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 2,
      removeOnComplete: true, // Don't keep scheduled job history
    },
  },
};

/**
 * Worker-specific configurations
 */
export const workerConfigs = {
  email: {
    ...defaultWorkerOptions,
    concurrency: 3, // Process 3 emails concurrently
  },
  report: {
    ...defaultWorkerOptions,
    concurrency: 2, // Process 2 reports concurrently (resource intensive)
  },
  dataProcessing: {
    ...defaultWorkerOptions,
    concurrency: 2, // Process 2 data processing jobs concurrently
  },
  scheduled: {
    ...defaultWorkerOptions,
    concurrency: 1, // Process scheduled tasks sequentially
  },
};

/**
 * Dead Letter Queue configuration
 * Failed jobs go here after max retries
 */
export const deadLetterQueueConfig: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: false,
  },
};

/**
 * Priority levels (1-10, 1 = highest priority)
 */
export enum JobPriority {
  CRITICAL = 1,
  HIGH = 3,
  NORMAL = 5,
  LOW = 7,
  BACKGROUND = 10,
}

/**
 * Job timeout values (milliseconds)
 */
export const JOB_TIMEOUT = {
  EMAIL: 30000, // 30 seconds
  REPORT: 120000, // 2 minutes
  DATA_PROCESSING: 180000, // 3 minutes
  BACKUP: 300000, // 5 minutes
};

/**
 * Queue names
 */
export const QUEUE_NAMES = {
  EMAIL: 'email',
  REPORT: 'report',
  DATA_PROCESSING: 'dataProcessing',
  SCHEDULED: 'scheduled',
  DEAD_LETTER: 'dead-letter',
};

/**
 * Job names for each queue
 */
export const JOB_NAMES = {
  // Email jobs
  SEND_ORDER_CONFIRMATION: 'sendOrderConfirmation',
  SEND_PASSWORD_RESET: 'sendPasswordReset',
  SEND_LOW_STOCK_ALERT: 'sendLowStockAlert',
  SEND_DAILY_REPORT: 'sendDailyReport',
  SEND_WEEKLY_REPORT: 'sendWeeklyReport',
  SEND_CUSTOM_EMAIL: 'sendCustomEmail',

  // Report jobs
  GENERATE_FINANCIAL_REPORT: 'generateFinancialReport',
  GENERATE_SALES_ANALYTICS: 'generateSalesAnalytics',
  GENERATE_INVENTORY_SUMMARY: 'generateInventorySummary',
  GENERATE_STAFF_PERFORMANCE: 'generateStaffPerformance',
  EXPORT_DATA: 'exportData',

  // Data processing jobs
  RECONCILE_INVENTORY: 'reconcileInventory',
  PROCESS_PAYMENT_SETTLEMENT: 'processPaymentSettlement',
  CLEANUP_DATABASE: 'cleanupDatabase',
  SYNC_EXTERNAL_SERVICE: 'syncExternalService',

  // Scheduled jobs
  DAILY_SALES_RECONCILIATION: 'dailySalesReconciliation',
  WEEKLY_REPORT_GENERATION: 'weeklyReportGeneration',
  MONTHLY_CLOSING: 'monthlyClosing',
  DAILY_BACKUP: 'dailyBackup',
};

logger.info('✅ Queue configuration loaded');

export default {
  redisConnection,
  defaultQueueOptions,
  defaultWorkerOptions,
  queueConfigs,
  workerConfigs,
  deadLetterQueueConfig,
  JobPriority,
  JOB_TIMEOUT,
  QUEUE_NAMES,
  JOB_NAMES,
};
