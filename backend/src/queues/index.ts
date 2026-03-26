/**
 * Queues Index
 * Central export for all queue-related modules
 */

// Queue definitions
export { emailQueue, type EmailJobData } from './definitions/email.queue';
export { reportQueue, type ReportJobData } from './definitions/report.queue';
export { dataProcessingQueue, type DataProcessingJobData } from './definitions/dataProcessing.queue';
export { scheduledQueue, type ScheduledJobData } from './definitions/scheduled.queue';
export { failedJobsQueue, type FailedJobData } from './definitions/failedJobs.queue';

// Queue configuration
export {
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
} from './config/queue.config';

// Workers
export { emailWorker } from './workers/email.worker';
export { reportWorker } from './workers/report.worker';
export { dataProcessingWorker } from './workers/dataProcessing.worker';
export { scheduledWorker } from './workers/scheduled.worker';

// Job helpers
export {
  sendOrderConfirmationEmail,
  sendPasswordResetEmail,
  sendLowStockAlertEmail,
  sendDailyReportEmail,
  sendWeeklyReportEmail,
  sendCustomEmail,
} from './jobs/emailJobs';

export {
  generateFinancialReport,
  generateSalesAnalytics,
  generateInventorySummary,
  generateStaffPerformance,
  exportData,
} from './jobs/reportJobs';

export {
  reconcileInventory,
  processPaymentSettlement,
  cleanupDatabase,
  syncExternalService,
} from './jobs/dataJobs';

import logger from '../config/logger';

logger.info('✅ Queues module loaded');
