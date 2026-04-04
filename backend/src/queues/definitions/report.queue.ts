/**
 * Report Queue Definition
 * Handles all report generation jobs
 */

import { Queue } from 'bullmq';
import { queueConfigs, QUEUE_NAMES } from '../config/queue.config';
import logger from '../../config/logger';
import { config } from '../../config/environment';
import { createDisabledQueue } from '../utils/disabledQueue';

export interface ReportJobData {
  type: 'financial' | 'sales' | 'inventory' | 'staffPerformance' | 'export';
  dateRange?: {
    startDate: Date | string;
    endDate: Date | string;
  };
  restaurantId?: string;
  userId?: string;
  format?: 'pdf' | 'csv' | 'xlsx' | 'json';
  filters?: Record<string, any>;
  includeCharts?: boolean;
  emailTo?: string;
}

class ReportQueue {
  private queue: Queue;

  constructor() {
    if (config.REDIS_ENABLED) {
      this.queue = new Queue(QUEUE_NAMES.REPORT, queueConfigs.report);
      this.setupEventHandlers();
      return;
    }

    this.queue = createDisabledQueue(QUEUE_NAMES.REPORT) as unknown as Queue;
  }

  /**
   * Add a report job to the queue
   */
  async addJob(
    jobName: string,
    data: ReportJobData,
    options?: {
      priority?: number;
      delay?: number;
      attempts?: number;
    }
  ) {
    try {
      const job = await this.queue.add(jobName, data, {
        priority: options?.priority,
        delay: options?.delay,
        attempts: options?.attempts,
      });

      logger.debug(`📊 Report job added: ${jobName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      logger.error(`❌ Failed to add report job: ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Get queue instance
   */
  getQueue(): Queue {
    return this.queue;
  }

  /**
   * Setup event handlers for the queue
   */
  private setupEventHandlers() {
    (this.queue as any).on('waiting', (job: any) => {
      logger.debug(`⏳ Report job waiting: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('active', (job: any) => {
      logger.info(`🚀 Report job started: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('completed', (job: any) => {
      logger.info(`✅ Report job completed: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('failed', (job: any, err: any) => {
      logger.error(
        `❌ Report job failed: ${job?.name} (ID: ${job?.id})`,
        { error: err.message, attempt: job?.attemptsMade }
      );
    });

    (this.queue as any).on('error', (error: any) => {
      logger.error('Report Queue Error:', error);
    });

    // Track progress for long-running jobs
    this.queue.on('progress', (job: any, progress: any) => {
      logger.debug(`📈 Report job progress: ${job.name} (ID: ${job.id}) - ${progress}%`);
    });
  }

  /**
   * Close queue connection
   */
  async close() {
    await this.queue.close();
  }
}

export const reportQueue = new ReportQueue();
