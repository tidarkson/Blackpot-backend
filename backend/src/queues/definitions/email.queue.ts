/**
 * Email Queue Definition
 * Handles all email-related jobs
 */

import { Queue } from 'bullmq';
import { queueConfigs, QUEUE_NAMES } from '../config/queue.config';
import logger from '../../config/logger';

export interface EmailJobData {
  to: string | string[];
  subject: string;
  template?: string;
  data?: Record<string, any>;
  priority?: number;
  cc?: string[];
  bcc?: string[];
  attachments?: Array<{ filename: string; path: string }>;
}

class EmailQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.EMAIL, queueConfigs.email);
    this.setupEventHandlers();
  }

  /**
   * Add an email job to the queue
   */
  async addJob(
    jobName: string,
    data: EmailJobData,
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

      logger.debug(`📧 Email job added: ${jobName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      logger.error(`❌ Failed to add email job: ${jobName}`, error);
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
      logger.debug(`⏳ Email job waiting: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('active', (job: any) => {
      logger.info(`🚀 Email job started: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('completed', (job: any) => {
      logger.info(`✅ Email job completed: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('failed', (job: any, err: any) => {
      logger.error(
        `❌ Email job failed: ${job?.name} (ID: ${job?.id})`,
        { error: err.message, attempt: job?.attemptsMade }
      );
    });

    (this.queue as any).on('error', (error: any) => {
      logger.error('Email Queue Error:', error);
    });
  }

  /**
   * Close queue connection
   */
  async close() {
    await this.queue.close();
  }
}

export const emailQueue = new EmailQueue();
