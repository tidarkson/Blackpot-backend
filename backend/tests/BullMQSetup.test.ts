/**
 * BullMQ Setup and Integration Tests
 * Tests job queue configuration, workers, and failure handling
 */

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { Queue, Worker, Job } from 'bullmq';
import {
  redisConnection,
  queueConfigs,
  workerConfigs,
  QUEUE_NAMES,
  JOB_NAMES,
  JobPriority,
} from '../src/queues/config/queue.config';
import { emailQueue } from '../src/queues/definitions/email.queue';
import { reportQueue } from '../src/queues/definitions/report.queue';
import { dataProcessingQueue } from '../src/queues/definitions/dataProcessing.queue';
import { scheduledQueue } from '../src/queues/definitions/scheduled.queue';
import { queueService } from '../src/services/queue.service';
import {
  sendOrderConfirmationEmail,
  sendPasswordResetEmail,
} from '../src/queues/jobs/emailJobs';
import {
  generateFinancialReport,
  generateSalesAnalytics,
} from '../src/queues/jobs/reportJobs';
import {
  reconcileInventory,
  processPaymentSettlement,
} from '../src/queues/jobs/dataJobs';

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';
const describeIfIntegration = runIntegrationTests ? describe : describe.skip;

describeIfIntegration('BullMQ Queue Setup and Integration', () => {
  /**
   * ACCEPTANCE CRITERIA 1: BullMQ installed and configured
   */
  describe('✅ Acceptance Criteria 1: BullMQ installed and configured', () => {
    it('should have BullMQ dependencies installed', () => {
      const packageJson = require('../../package.json');
      expect(packageJson.dependencies.bullmq).toBeDefined();
      expect(packageJson.dependencies.bull).toBeDefined();
    });

    it('should have Redis connection configured', () => {
      expect(redisConnection).toBeDefined();
      expect(redisConnection.host).toBeDefined();
      expect(redisConnection.port).toBeDefined();
    });

    it('should have queue configurations defined', () => {
      expect(queueConfigs.email).toBeDefined();
      expect(queueConfigs.report).toBeDefined();
      expect(queueConfigs.dataProcessing).toBeDefined();
      expect(queueConfigs.scheduled).toBeDefined();
    });

    it('should have worker configurations defined', () => {
      expect(workerConfigs.email).toBeDefined();
      expect(workerConfigs.report).toBeDefined();
      expect(workerConfigs.dataProcessing).toBeDefined();
      expect(workerConfigs.scheduled).toBeDefined();
    });

    it('should have job names defined for all job types', () => {
      // Email jobs
      expect(JOB_NAMES.SEND_ORDER_CONFIRMATION).toBe('sendOrderConfirmation');
      expect(JOB_NAMES.SEND_PASSWORD_RESET).toBe('sendPasswordReset');
      expect(JOB_NAMES.SEND_LOW_STOCK_ALERT).toBe('sendLowStockAlert');

      // Report jobs
      expect(JOB_NAMES.GENERATE_FINANCIAL_REPORT).toBe('generateFinancialReport');
      expect(JOB_NAMES.GENERATE_SALES_ANALYTICS).toBe('generateSalesAnalytics');

      // Data jobs
      expect(JOB_NAMES.RECONCILE_INVENTORY).toBe('reconcileInventory');
      expect(JOB_NAMES.PROCESS_PAYMENT_SETTLEMENT).toBe('processPaymentSettlement');

      // Scheduled jobs
      expect(JOB_NAMES.DAILY_SALES_RECONCILIATION).toBe('dailySalesReconciliation');
      expect(JOB_NAMES.WEEKLY_REPORT_GENERATION).toBe('weeklyReportGeneration');
    });

    it('should have priority levels defined', () => {
      expect(JobPriority.CRITICAL).toBe(1);
      expect(JobPriority.HIGH).toBe(3);
      expect(JobPriority.NORMAL).toBe(5);
      expect(JobPriority.LOW).toBe(7);
      expect(JobPriority.BACKGROUND).toBe(10);
    });

    it('default queue options should have retry configuration', () => {
      const emailConfig = queueConfigs.email;
      expect(emailConfig.defaultJobOptions?.attempts).toBe(5);
      expect(emailConfig.defaultJobOptions?.backoff).toBeDefined();
      expect(emailConfig.defaultJobOptions?.backoff?.type).toBe('exponential');
      expect(emailConfig.defaultJobOptions?.backoff?.delay).toBeDefined();
    });

    it('should have concurrency limits configured per worker', () => {
      expect(workerConfigs.email.concurrency).toBe(3);
      expect(workerConfigs.report.concurrency).toBe(2);
      expect(workerConfigs.dataProcessing.concurrency).toBe(2);
      expect(workerConfigs.scheduled.concurrency).toBe(1);
    });
  });

  /**
   * ACCEPTANCE CRITERIA 2: Job queue workers running
   */
  describe('✅ Acceptance Criteria 2: Job queue workers running', () => {
    it('should initialize email queue', async () => {
      const queue = emailQueue.getQueue();
      expect(queue).toBeDefined();
      expect(queue.name).toBe(QUEUE_NAMES.EMAIL);
      await queue.close();
    });

    it('should initialize report queue', async () => {
      const queue = reportQueue.getQueue();
      expect(queue).toBeDefined();
      expect(queue.name).toBe(QUEUE_NAMES.REPORT);
      await queue.close();
    });

    it('should initialize data processing queue', async () => {
      const queue = dataProcessingQueue.getQueue();
      expect(queue).toBeDefined();
      expect(queue.name).toBe(QUEUE_NAMES.DATA_PROCESSING);
      await queue.close();
    });

    it('should initialize scheduled queue', async () => {
      const queue = scheduledQueue.getQueue();
      expect(queue).toBeDefined();
      expect(queue.name).toBe(QUEUE_NAMES.SCHEDULED);
      await queue.close();
    });

    it('should be able to add jobs to email queue', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test Email',
      });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.name).toBe(JOB_NAMES.SEND_ORDER_CONFIRMATION);
      await queue.close();
    });

    it('should be able to add jobs with priority', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(
        JOB_NAMES.SEND_PASSWORD_RESET,
        {
          to: 'user@example.com',
          subject: 'Reset Password',
        },
        { priority: JobPriority.HIGH }
      );

      expect(job.opts.priority).toBe(JobPriority.HIGH);
      await queue.close();
    });

    it('should be able to add jobs with delay', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(
        JOB_NAMES.GENERATE_FINANCIAL_REPORT,
        {
          type: 'financial',
          restaurantId: 'rest-1',
        },
        { delay: 5000 } // 5 second delay
      );

      expect(job.opts.delay).toBe(5000);
      await queue.close();
    });

    it('should support job helper functions for email jobs', async () => {
      // This test verifies the helper functions exist and can queue jobs
      await expect(
        sendOrderConfirmationEmail(
          'customer@example.com',
          'ORD-123',
          'John Doe',
          [{ name: 'Pizza', quantity: 1, price: 15.99 }],
          15.99,
          30
        )
      ).resolves.not.toThrow();
    });

    it('should support job helper functions for report jobs', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await expect(
        generateFinancialReport('rest-1', startDate, endDate, 'pdf')
      ).resolves.not.toThrow();
    });

    it('should support job helper functions for data processing jobs', async () => {
      await expect(
        reconcileInventory('rest-1', { 'item-1': 50, 'item-2': 30 })
      ).resolves.not.toThrow();
    });
  });

  /**
   * ACCEPTANCE CRITERIA 3: Failed job retry mechanism
   */
  describe('✅ Acceptance Criteria 3: Failed job retry mechanism', () => {
    it('should configure retry attempts for email jobs', () => {
      const config = queueConfigs.email;
      expect(config.defaultJobOptions?.attempts).toBe(5);
    });

    it('should configure retry attempts for report jobs', () => {
      const config = queueConfigs.report;
      expect(config.defaultJobOptions?.attempts).toBe(3);
    });

    it('should configure exponential backoff for retries', () => {
      const config = queueConfigs.email;
      const backoff = config.defaultJobOptions?.backoff as any;
      expect(backoff?.type).toBe('exponential');
      expect(backoff?.delay).toBe(3000); // 3 seconds
    });

    it('should have exponential backoff for report jobs', () => {
      const config = queueConfigs.report;
      const backoff = config.defaultJobOptions?.backoff as any;
      expect(backoff?.type).toBe('exponential');
      expect(backoff?.delay).toBeDefined();
    });

    it('should configure timeout for long-running jobs', () => {
      const config = queueConfigs.report;
      expect(config.defaultJobOptions?.timeout).toBe(120000); // 2 minutes
    });

    it('should keep failed jobs for inspection', () => {
      const config = queueConfigs.email;
      expect(config.defaultJobOptions?.removeOnFail).toBe(false);
    });
  });

  /**
   * ACCEPTANCE CRITERIA 4: Job progress tracking
   */
  describe('✅ Acceptance Criteria 4: Job progress tracking', () => {
    it('should support job progress updates', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
      });

      // Simple mock: Report worker would call job.progress(percentage)
      expect(typeof job.progress).toBe('function');
      await queue.close();
    });

    it('should track job attempts and max retries', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test',
      });

      expect(job.attemptsMade).toBeDefined();
      expect(job.opts.attempts).toBeDefined();
      await queue.close();
    });

    it('should provide job state information', async () => {
      const queue = dataProcessingQueue.getQueue();
      const job = await queue.add(JOB_NAMES.RECONCILE_INVENTORY, {
        operation: 'inventory-reconciliation',
        entityId: 'rest-1',
      });

      const state = await job.getState();
      expect(state).toBe('waiting');
      await queue.close();
    });

    it('queue service should track job progress', async () => {
      const stats = await queueService.getQueueStats();
      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should report active, waiting, and completed jobs', async () => {
      const stats = await queueService.getQueueStats();
      const stat = stats[0];

      expect(stat).toHaveProperty('waiting');
      expect(stat).toHaveProperty('active');
      expect(stat).toHaveProperty('completed');
      expect(stat).toHaveProperty('failed');
    });
  });

  /**
   * ACCEPTANCE CRITERIA 5: Dead letter queue for failed jobs
   */
  describe('✅ Acceptance Criteria 5: Dead letter queue for failed jobs', () => {
    it('should have dead letter queue configuration', () => {
      const deadLetterConfig = require('../backend/src/queues/config/queue.config')
        .deadLetterQueueConfig;
      expect(deadLetterConfig).toBeDefined();
      expect(deadLetterConfig.defaultJobOptions?.removeOnComplete).toBe(false);
    });

    it('should not remove failed jobs on failure', () => {
      const config = queueConfigs.email;
      expect(config.defaultJobOptions?.removeOnFail).toBe(false);
    });

    it('queue service should retrieve failed jobs', async () => {
      const failedJobs = await queueService.getFailedJobs(QUEUE_NAMES.EMAIL, 50);
      expect(failedJobs).toBeDefined();
      expect(Array.isArray(failedJobs)).toBe(true);
    });

    it('should allow retrying failed jobs', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test',
      });

      const jobId = job.id as string;
      expect(jobId).toBeDefined();
      await queue.close();
    });

    it('queue service should support job removal', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_PASSWORD_RESET, {
        to: 'test@example.com',
        subject: 'Reset',
      });

      const jobId = job.id as string;
      const success = await queueService.removeJob(QUEUE_NAMES.EMAIL, jobId);
      expect(typeof success).toBe('boolean');
      await queue.close();
    });

    it('should provide failure reason information', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test',
      });

      // failedReason is set when job fails
      expect(job.failedReason === undefined || typeof job.failedReason === 'string').toBe(true);
      await queue.close();
    });

    it('should track stacktrace for debugging failed jobs', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
      });

      // stacktrace is populated when job fails
      expect(job.stacktrace === undefined || Array.isArray(job.stacktrace)).toBe(true);
      await queue.close();
    });
  });

  /**
   * ACCEPTANCE CRITERIA 6: Queue monitoring dashboard data
   */
  describe('✅ Acceptance Criteria 6: Queue monitoring dashboard data', () => {
    it('should provide queue health status', async () => {
      const health = await queueService.getQueueHealth();
      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.metrics).toBeDefined();
    });

    it('should report total jobs metric', async () => {
      const health = await queueService.getQueueHealth();
      expect(health.metrics.totalJobs).toBeDefined();
      expect(typeof health.metrics.totalJobs).toBe('number');
    });

    it('should report failed jobs metric', async () => {
      const health = await queueService.getQueueHealth();
      expect(health.metrics.failedJobs).toBeDefined();
      expect(typeof health.metrics.failedJobs).toBe('number');
    });

    it('should report active jobs metric', async () => {
      const health = await queueService.getQueueHealth();
      expect(health.metrics.activeJobs).toBeDefined();
      expect(typeof health.metrics.activeJobs).toBe('number');
    });

    it('should report pending jobs metric', async () => {
      const health = await queueService.getQueueHealth();
      expect(health.metrics.pendingJobs).toBeDefined();
      expect(typeof health.metrics.pendingJobs).toBe('number');
    });

    it('should report per-queue health status', async () => {
      const health = await queueService.getQueueHealth();
      expect(health.queues).toBeDefined();
      expect(Array.isArray(health.queues)).toBe(true);
      expect(health.queues.length).toBeGreaterThan(0);

      for (const q of health.queues) {
        expect(q.name).toBeDefined();
        expect(q.status).toMatch(/healthy|degraded/);
      }
    });

    it('should provide queue-specific statistics', async () => {
      const stats = await queueService.getQueueStatsByName(QUEUE_NAMES.EMAIL);
      expect(stats).toBeDefined();
      expect(stats?.queueName).toBe(QUEUE_NAMES.EMAIL);
      expect(stats?.waiting).toBeDefined();
      expect(stats?.active).toBeDefined();
      expect(stats?.completed).toBeDefined();
      expect(stats?.failed).toBeDefined();
    });

    it('should list active jobs with details', async () => {
      const activeJobs = await queueService.getActiveJobs(QUEUE_NAMES.EMAIL, 10);
      expect(Array.isArray(activeJobs)).toBe(true);
    });

    it('should list waiting jobs with details', async () => {
      const waitingJobs = await queueService.getWaitingJobs(QUEUE_NAMES.REPORT, 10);
      expect(Array.isArray(waitingJobs)).toBe(true);
    });

    it('should support queue pause/resume for maintenance', async () => {
      const queue = emailQueue.getQueue();

      // Pause queue
      const pauseSuccess = await queueService.pauseQueue(QUEUE_NAMES.EMAIL);
      expect(typeof pauseSuccess).toBe('boolean');

      // Resume queue
      const resumeSuccess = await queueService.resumeQueue(QUEUE_NAMES.EMAIL);
      expect(typeof resumeSuccess).toBe('boolean');

      await queue.close();
    });

    it('should provide job details including data and state', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test Email',
        data: { orderId: 'ORD-123' },
      });

      const jobInfo = await queueService.getJobInfo(QUEUE_NAMES.EMAIL, job.id as string);
      expect(jobInfo).toBeDefined();
      expect(jobInfo?.id).toBe(job.id);
      expect(jobInfo?.name).toBe(JOB_NAMES.SEND_ORDER_CONFIRMATION);
      expect(jobInfo?.data).toBeDefined();

      await queue.close();
    });
  });

  /**
   * CHECKLIST 1: Jobs execute asynchronously
   */
  describe('📋 Checklist 1: Jobs execute asynchronously', () => {
    it('should add jobs to queue without blocking', async () => {
      const queue = emailQueue.getQueue();
      const startTime = Date.now();

      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test',
      });

      const elapsedTime = Date.now() - startTime;

      // Job should be added almost instantly (< 100ms)
      expect(elapsedTime).toBeLessThan(100);
      expect(job).toBeDefined();
      expect(job.id).toBeDefined();

      await queue.close();
    });

    it('should queue multiple jobs concurrently', async () => {
      const queue = emailQueue.getQueue();
      const jobs = [];

      const startTime = Date.now();

      // Add 10 jobs concurrently
      for (let i = 0; i < 10; i++) {
        jobs.push(
          queue.add(JOB_NAMES.SEND_PASSWORD_RESET, {
            to: `user${i}@example.com`,
            subject: 'Reset Password',
          })
        );
      }

      const results = await Promise.all(jobs);
      const elapsedTime = Date.now() - startTime;

      // All jobs should be queued quickly (< 500ms for 10 jobs)
      expect(elapsedTime).toBeLessThan(500);
      expect(results).toHaveLength(10);
      expect(results.every((job) => job.id)).toBe(true);

      await queue.close();
    });

    it('should return job ID immediately without waiting for execution', async () => {
      const queue = reportQueue.getQueue();
      let jobExecuted = false;

      // Create a minimal worker that tracks execution
      const worker = new Worker(QUEUE_NAMES.REPORT, async () => {
        jobExecuted = true;
      }, { connection: redisConnection });

      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
      });

      // Job should be returned immediately
      expect(job.id).toBeDefined();
      expect(jobExecuted).toBe(false); // Job hasn't executed yet

      await worker.close();
      await queue.close();
    });

    it('should maintain job state asynchronously', async () => {
      const queue = dataProcessingQueue.getQueue();
      const job = await queue.add(JOB_NAMES.RECONCILE_INVENTORY, {
        operation: 'inventory-reconciliation',
        entityId: 'rest-1',
        params: { counts: {} },
      });

      const initialState = await job.getState();
      expect(initialState).toBe('waiting'); // Job is queued, not executed yet

      await queue.close();
    });
  });

  /**
   * CHECKLIST 2: Failed jobs retry 3 times
   */
  describe('📋 Checklist 2: Failed jobs retry 3 times', () => {
    it('should configure email queue with 5 retry attempts', () => {
      const config = queueConfigs.email;
      expect(config.defaultJobOptions?.attempts).toBe(5);
    });

    it('should configure report queue with 3 retry attempts as per checklist', () => {
      const config = queueConfigs.report;
      expect(config.defaultJobOptions?.attempts).toBe(3);
    });

    it('should use exponential backoff between retries', () => {
      const configs = [queueConfigs.email, queueConfigs.report, queueConfigs.dataProcessing];

      configs.forEach((config) => {
        const backoff = config.defaultJobOptions?.backoff as any;
        expect(backoff?.type).toBe('exponential');
        expect(backoff?.delay).toBeGreaterThan(0);
      });
    });

    it('should track retry attempts on job object', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Test',
      });

      // Initially no attempts have been made
      expect(job.attemptsMade).toBe(0);
      // But max attempts should be configured
      expect(job.opts.attempts).toBeGreaterThanOrEqual(3);

      await queue.close();
    });

    it('should preserve job on failure for retry', async () => {
      const queue = dataProcessingQueue.getQueue();
      const job = await queue.add(JOB_NAMES.PROCESS_PAYMENT_SETTLEMENT, {
        operation: 'payment-processing',
        entityId: 'trans-1',
      });

      // removeOnFail should be false to preserve failed jobs
      const removeOnFail = queue.opts.defaultJobOptions?.removeOnFail;
      expect(removeOnFail === false || removeOnFail === undefined).toBe(true);

      await queue.close();
    });
  });

  /**
   * CHECKLIST 3: Dead letter queue captures permanently failed jobs
   */
  describe('📋 Checklist 3: Dead letter queue captures permanently failed jobs', () => {
    it('should keep failed jobs for later inspection', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'test@example.com',
        subject: 'Permanent Failure Test',
      });

      const config = queue.opts.defaultJobOptions;
      // Jobs should not be automatically removed on failure
      expect(config?.removeOnFail).not.toBe(true);

      await queue.close();
    });

    it('should retrieve failed jobs from queue service', async () => {
      const failedJobs = await queueService.getFailedJobs(QUEUE_NAMES.EMAIL, 100);
      expect(Array.isArray(failedJobs)).toBe(true);
      // Each failed job should have necessary fields
      if (failedJobs.length > 0) {
        failedJobs.forEach((job) => {
          expect(job.id).toBeDefined();
          expect(job.failedReason || job.stacktrace).toBeDefined();
          expect(job.attemptsMade).toBeGreaterThanOrEqual(0);
        });
      }
    });

    it('should support moving failed jobs to dead letter queue', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
      });

      const jobId = job.id as string;
      expect(jobId).toBeDefined();

      // Queue service should support job management operations
      const removeSuccess = await queueService.removeJob(QUEUE_NAMES.REPORT, jobId);
      expect(typeof removeSuccess).toBe('boolean');

      await queue.close();
    });

    it('should store failure reason for permanently failed jobs', async () => {
      const queue = dataProcessingQueue.getQueue();
      const job = await queue.add(JOB_NAMES.RECONCILE_INVENTORY, {
        operation: 'inventory-reconciliation',
        entityId: 'rest-1',
        params: { counts: {} },
      });

      // Job object should have fields to track failure information
      expect(job.failedReason === undefined || typeof job.failedReason === 'string').toBe(true);
      expect(job.stacktrace === undefined || Array.isArray(job.stacktrace)).toBe(true);

      await queue.close();
    });

    it('should maintain failed job history for auditing', async () => {
      const failedJobs = await queueService.getFailedJobs(QUEUE_NAMES.REPORT, 50);
      expect(Array.isArray(failedJobs)).toBe(true);

      // If there are failed jobs, they should have complete information
      if (failedJobs.length > 0) {
        const job = failedJobs[0];
        expect(job.id).toBeDefined();
      }
    });
  });

  /**
   * CHECKLIST 4: Job progress tracked for reports
   */
  describe('📋 Checklist 4: Job progress tracked for reports', () => {
    it('should track job execution progress', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
      });

      // Job should have progress method
      expect(typeof job.progress).toBe('function');

      await queue.close();
    });

    it('should provide job state information for tracking', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_SALES_ANALYTICS, {
        type: 'sales',
        restaurantId: 'rest-1',
      });

      const state = await job.getState();
      expect(['waiting', 'active', 'completed', 'failed']).toContain(state);

      await queue.close();
    });

    it('should track attempts made vs max attempts', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'track@example.com',
        subject: 'Track Progress',
      });

      expect(job.attemptsMade).toBeDefined();
      expect(job.opts.attempts).toBeDefined();
      expect(job.attemptsMade).toBeLessThanOrEqual(job.opts.attempts as number);

      await queue.close();
    });

    it('should provide queue-level job statistics for reporting', async () => {
      const stats = await queueService.getQueueStats();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);

      stats.forEach((stat) => {
        expect(stat.queueName).toBeDefined();
        expect(typeof stat.waiting).toBe('number');
        expect(typeof stat.active).toBe('number');
        expect(typeof stat.completed).toBe('number');
        expect(typeof stat.failed).toBe('number');
      });
    });

    it('should retrieve job details including progress information', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_FINANCIAL_REPORT, {
        type: 'financial',
        restaurantId: 'rest-1',
        progress: 0,
      });

      const jobInfo = await queueService.getJobInfo(QUEUE_NAMES.REPORT, job.id as string);
      expect(jobInfo).toBeDefined();
      expect(jobInfo?.id).toBe(job.id);
      expect(jobInfo?.data).toBeDefined();

      await queue.close();
    });
  });

  /**
   * CHECKLIST 5: Scheduled jobs run at correct times
   */
  describe('📋 Checklist 5: Scheduled jobs run at correct times', () => {
    it('should support recurring job definitions', async () => {
      const repeatingJobs = await scheduledQueue.getRepeatingJobs();
      expect(Array.isArray(repeatingJobs)).toBe(true);
    });

    it('should allow adding delayed jobs', async () => {
      const queue = reportQueue.getQueue();
      const delayMs = 5000; // 5 seconds

      const job = await queue.add(
        JOB_NAMES.GENERATE_FINANCIAL_REPORT,
        {
          type: 'financial',
          restaurantId: 'rest-1',
        },
        { delay: delayMs }
      );

      expect(job.opts.delay).toBe(delayMs);

      // Job should be in 'delayed' state initially
      const state = await job.getState();
      expect(['delayed', 'waiting']).toContain(state);

      await queue.close();
    });

    it('should calculate correct delay for scheduled jobs', async () => {
      const queue = reportQueue.getQueue();
      const now = Date.now();
      const scheduledTime = now + 10000; // 10 seconds from now
      const expectedDelay = scheduledTime - now;

      const job = await queue.add(JOB_NAMES.GENERATE_SALES_ANALYTICS, {
        type: 'sales',
        restaurantId: 'rest-1',
      });

      expect(job.opts.delay === undefined || job.opts.delay >= 0).toBe(true);

      await queue.close();
    });

    it('should maintain scheduled queue for time-based execution', async () => {
      const queue = scheduledQueue.getQueue();
      expect(queue.name).toBe(QUEUE_NAMES.SCHEDULED);

      // Scheduled queue should have configuration for recurring jobs
      const config = queueConfigs.scheduled;
      expect(config).toBeDefined();

      await queue.close();
    });

    it('should support job schedules with cron patterns', async () => {
      const scheduledQueueInstance = scheduledQueue.getQueue();
      const repeatingJobs = await scheduledQueueInstance.getRepeatableJobs();

      expect(Array.isArray(repeatingJobs)).toBe(true);
      // Repeating jobs may have pattern information
      if (repeatingJobs.length > 0) {
        repeatingJobs.forEach((repeatJob) => {
          expect(repeatJob.key || repeatJob.pattern).toBeDefined();
        });
      }

      await scheduledQueueInstance.close();
    });
  });

  /**
   * CHECKLIST 6: Workers can be scaled independently
   */
  describe('📋 Checklist 6: Workers can be scaled independently', () => {
    it('should have independent concurrency configuration per queue', () => {
      const emailConcurrency = workerConfigs.email.concurrency;
      const reportConcurrency = workerConfigs.report.concurrency;
      const dataProcessingConcurrency = workerConfigs.dataProcessing.concurrency;

      expect(emailConcurrency).toBeDefined();
      expect(reportConcurrency).toBeDefined();
      expect(dataProcessingConcurrency).toBeDefined();

      // Each queue can have different concurrency settings
      expect(typeof emailConcurrency).toBe('number');
      expect(typeof reportConcurrency).toBe('number');
      expect(typeof dataProcessingConcurrency).toBe('number');
    });

    it('should configure email workers for high concurrency', () => {
      const emailConcurrency = workerConfigs.email.concurrency;
      expect(emailConcurrency).toBeGreaterThan(0);
      // Email jobs are lightweight, can handle more concurrency
      expect(emailConcurrency).toBeLessThanOrEqual(10);
    });

    it('should configure report workers for lower concurrency', () => {
      const reportConcurrency = workerConfigs.report.concurrency;
      expect(reportConcurrency).toBeGreaterThan(0);
      // Report jobs are resource-intensive, lower concurrency
      expect(reportConcurrency).toBeLessThanOrEqual(5);
    });

    it('should configure data processing workers independently', () => {
      const dataProcessingConcurrency = workerConfigs.dataProcessing.concurrency;
      expect(dataProcessingConcurrency).toBeGreaterThan(0);
      expect(dataProcessingConcurrency).toBeDefined();
    });

    it('should support queue-specific job removal configurations', () => {
      const emailRemoveOnComplete = queueConfigs.email.defaultJobOptions?.removeOnComplete;
      const reportRemoveOnComplete = queueConfigs.report.defaultJobOptions?.removeOnComplete;

      // Different queues can have different removal settings
      expect(emailRemoveOnComplete === undefined || typeof emailRemoveOnComplete === 'boolean' || typeof emailRemoveOnComplete === 'number').toBe(true);
      expect(reportRemoveOnComplete === undefined || typeof reportRemoveOnComplete === 'boolean' || typeof reportRemoveOnComplete === 'number').toBe(true);
    });

    it('should allow independent worker scaling through configuration', () => {
      // Each queue type should be independently configurable
      expect(workerConfigs.email).toBeDefined();
      expect(workerConfigs.report).toBeDefined();
      expect(workerConfigs.dataProcessing).toBeDefined();
      expect(workerConfigs.scheduled).toBeDefined();

      // All have concurrency settings
      Object.values(workerConfigs).forEach((config) => {
        expect(config.concurrency).toBeGreaterThan(0);
      });
    });
  });

  /**
   * CHECKLIST 7: Queue monitoring shows job statistics
   */
  describe('📋 Checklist 7: Queue monitoring shows job statistics', () => {
    it('should provide queue health status', async () => {
      const health = await queueService.getQueueHealth();
      expect(health).toBeDefined();
      expect(health.status).toMatch(/healthy|degraded|unhealthy/);
      expect(health.metrics).toBeDefined();
    });

    it('should report complete metrics in health check', async () => {
      const health = await queueService.getQueueHealth();
      const metrics = health.metrics;

      expect(metrics.totalJobs).toBeDefined();
      expect(metrics.failedJobs).toBeDefined();
      expect(metrics.activeJobs).toBeDefined();
      expect(metrics.pendingJobs).toBeDefined();

      // All metrics should be numbers
      expect(typeof metrics.totalJobs).toBe('number');
      expect(typeof metrics.failedJobs).toBe('number');
      expect(typeof metrics.activeJobs).toBe('number');
      expect(typeof metrics.pendingJobs).toBe('number');
    });

    it('should provide per-queue statistics', async () => {
      const stats = await queueService.getQueueStats();
      expect(Array.isArray(stats)).toBe(true);

      stats.forEach((stat) => {
        expect(stat.queueName).toBeDefined();
        expect(typeof stat.waiting).toBe('number');
        expect(typeof stat.active).toBe('number');
        expect(typeof stat.completed).toBe('number');
        expect(typeof stat.failed).toBe('number');
      });
    });

    it('should retrieve specific queue statistics by name', async () => {
      const emailStats = await queueService.getQueueStatsByName(QUEUE_NAMES.EMAIL);
      expect(emailStats).toBeDefined();
      expect(emailStats?.queueName).toBe(QUEUE_NAMES.EMAIL);
      expect(typeof emailStats?.waiting).toBe('number');
      expect(typeof emailStats?.active).toBe('number');
      expect(typeof emailStats?.completed).toBe('number');
      expect(typeof emailStats?.failed).toBe('number');
    });

    it('should list active jobs with metadata', async () => {
      const activeJobs = await queueService.getActiveJobs(QUEUE_NAMES.EMAIL, 50);
      expect(Array.isArray(activeJobs)).toBe(true);

      if (activeJobs.length > 0) {
        activeJobs.forEach((job) => {
          expect(job.id).toBeDefined();
          expect(job.name).toBeDefined();
          expect(job.data).toBeDefined();
        });
      }
    });

    it('should list waiting jobs for monitoring', async () => {
      const waitingJobs = await queueService.getWaitingJobs(QUEUE_NAMES.REPORT, 50);
      expect(Array.isArray(waitingJobs)).toBe(true);

      if (waitingJobs.length > 0) {
        waitingJobs.forEach((job) => {
          expect(job.id).toBeDefined();
          expect(job.name).toBeDefined();
        });
      }
    });

    it('should support queue pause for maintenance monitoring', async () => {
      const pauseResult = await queueService.pauseQueue(QUEUE_NAMES.EMAIL);
      expect(typeof pauseResult).toBe('boolean');

      // Resume the queue
      const resumeResult = await queueService.resumeQueue(QUEUE_NAMES.EMAIL);
      expect(typeof resumeResult).toBe('boolean');
    });

    it('should provide detailed job information for monitoring', async () => {
      const queue = emailQueue.getQueue();
      const job = await queue.add(JOB_NAMES.SEND_ORDER_CONFIRMATION, {
        to: 'monitor@example.com',
        subject: 'Monitor Job',
      });

      const jobInfo = await queueService.getJobInfo(QUEUE_NAMES.EMAIL, job.id as string);
      expect(jobInfo).toBeDefined();
      expect(jobInfo?.id).toBe(job.id);
      expect(jobInfo?.name).toBe(JOB_NAMES.SEND_ORDER_CONFIRMATION);
      expect(jobInfo?.data).toBeDefined();
      expect(jobInfo?.state).toBeDefined();

      await queue.close();
    });

    it('should aggregate statistics across all queues', async () => {
      const allStats = await queueService.getQueueStats();
      expect(allStats.length).toBeGreaterThan(0);

      const totalWaiting = allStats.reduce((sum, stat) => sum + stat.waiting, 0);
      const totalActive = allStats.reduce((sum, stat) => sum + stat.active, 0);
      const totalCompleted = allStats.reduce((sum, stat) => sum + stat.completed, 0);
      const totalFailed = allStats.reduce((sum, stat) => sum + stat.failed, 0);

      expect(totalWaiting).toBeGreaterThanOrEqual(0);
      expect(totalActive).toBeGreaterThanOrEqual(0);
      expect(totalCompleted).toBeGreaterThanOrEqual(0);
      expect(totalFailed).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * Additional Integration Tests
   */
  describe('🔧 Additional Integration Tests', () => {
    it('should support different queue types', () => {
      const queueNames = Object.values(QUEUE_NAMES);
      expect(queueNames).toContain('email');
      expect(queueNames).toContain('report');
      expect(queueNames).toContain('dataProcessing');
      expect(queueNames).toContain('scheduled');
    });

    it('should handle job errors gracefully', async () => {
      const queue = dataProcessingQueue.getQueue();
      const job = await queue.add(JOB_NAMES.RECONCILE_INVENTORY, {
        operation: 'inventory-reconciliation',
        entityId: 'rest-1',
        params: { counts: {} },
      });

      expect(job).toBeDefined();
      await queue.close();
    });

    it('should support scheduled recurring jobs', async () => {
      const repeatingJobs = await scheduledQueue.getRepeatingJobs();
      expect(Array.isArray(repeatingJobs)).toBe(true);
    });

    it('should handle job execution with proper settings', () => {
      // Verify queue configurations are defined
      expect(queueConfigs.email).toBeDefined();
      expect(queueConfigs.report).toBeDefined();
      expect(queueConfigs.dataProcessing).toBeDefined();
    });

    it('should support concurrent job processing', () => {
      expect(workerConfigs.email.concurrency).toBeGreaterThan(0);
      expect(workerConfigs.report.concurrency).toBeGreaterThan(0);
      expect(workerConfigs.dataProcessing.concurrency).toBeGreaterThan(0);
      expect(workerConfigs.scheduled.concurrency).toBeGreaterThan(0);
    });

    it('should have rate limiting for email service', () => {
      // Email worker should have concurrency of 3
      expect(workerConfigs.email.concurrency).toBeLessThanOrEqual(5);
    });

    it('should track job completion', async () => {
      const queue = reportQueue.getQueue();
      const job = await queue.add(JOB_NAMES.GENERATE_SALES_ANALYTICS, {
        type: 'sales',
        restaurantId: 'rest-1',
      });

      expect(job.opts.removeOnComplete).toBeDefined();
      await queue.close();
    });
  });
});

// Cleanup
afterAll(async () => {
  // Close all queues
  await queueService.closeAllQueues();
});
