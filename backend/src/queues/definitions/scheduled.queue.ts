/**
 * Scheduled Queue Definition
 * Handles recurring and scheduled jobs (cron-like)
 */

import { Queue, RepeatableJob } from 'bullmq';
import { queueConfigs, QUEUE_NAMES } from '../config/queue.config';
import logger from '../../config/logger';

export interface ScheduledJobData {
  taskType: 'reconciliation' | 'report' | 'backup' | 'cleanup';
  data?: Record<string, any>;
}

class ScheduledQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.SCHEDULED, queueConfigs.scheduled);
    this.setupEventHandlers();
  }

  /**
   * Add a scheduled job (one-time or recurring)
   */
  async addScheduledJob(
    jobName: string,
    data: ScheduledJobData,
    options?: {
      repeat?: {
        pattern?: string; // Cron pattern
        every?: number; // Milliseconds
      };
      delay?: number;
      priority?: number;
    }
  ) {
    try {
      const job = await this.queue.add(jobName, data, {
        repeat: options?.repeat,
        delay: options?.delay,
        priority: options?.priority,
      });

      logger.info(`⏰ Scheduled job added: ${jobName} (ID: ${job.id})`);
      if (options?.repeat?.pattern) {
        logger.info(`   Pattern: ${options.repeat.pattern}`);
      }
      return job;
    } catch (error) {
      logger.error(`❌ Failed to add scheduled job: ${jobName}`, error);
      throw error;
    }
  }

  /**
   * Get all repeating jobs
   */
  async getRepeatingJobs(): Promise<RepeatableJob[]> {
    return this.queue.getRepeatableJobs();
  }

  /**
   * Remove a repeating job
   */
  async removeRepeatingJob(name: string, pattern: string) {
    try {
      await this.queue.removeRepeatableByKey(`${name}:${pattern}`);
      logger.info(`🗑️ Repeating job removed: ${name}`);
    } catch (error) {
      logger.error(`❌ Failed to remove repeating job: ${name}`, error);
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
      logger.debug(`⏳ Scheduled job waiting: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('active', (job: any) => {
      logger.info(`🚀 Scheduled job started: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('completed', (job: any) => {
      logger.info(`✅ Scheduled job completed: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('failed', (job: any, err: any) => {
      logger.error(
        `❌ Scheduled job failed: ${job?.name} (ID: ${job?.id})`,
        { error: err.message, attempt: job?.attemptsMade }
      );
    });

    (this.queue as any).on('error', (error: any) => {
      logger.error('Scheduled Queue Error:', error);
    });
  }

  /**
   * Close queue connection
   */
  async close() {
    await this.queue.close();
  }
}

export const scheduledQueue = new ScheduledQueue();
