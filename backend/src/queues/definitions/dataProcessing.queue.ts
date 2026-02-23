/**
 * Data Processing Queue Definition
 * Handles batch processing, reconciliation, and data operations
 */

import { Queue } from 'bullmq';
import { queueConfigs, QUEUE_NAMES } from '../config/queue.config';
import logger from '../../config/logger';

export interface DataProcessingJobData {
  operation: 'inventory-reconciliation' | 'payment-settlement' | 'database-cleanup' | 'export-data' | 'sync-service';
  entityId?: string;
  params?: Record<string, any>;
  batchSize?: number;
  startDate?: Date | string;
  endDate?: Date | string;
  filters?: Record<string, any>;
}

class DataProcessingQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.DATA_PROCESSING, queueConfigs.dataProcessing);
    this.setupEventHandlers();
  }

  /**
   * Add a data processing job to the queue
   */
  async addJob(
    jobName: string,
    data: DataProcessingJobData,
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

      logger.debug(`⚙️ Data processing job added: ${jobName} (ID: ${job.id})`);
      return job;
    } catch (error) {
      logger.error(`❌ Failed to add data processing job: ${jobName}`, error);
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
      logger.debug(`⏳ Data processing job waiting: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('active', (job: any) => {
      logger.info(`🚀 Data processing job started: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('completed', (job: any) => {
      logger.info(`✅ Data processing job completed: ${job.name} (ID: ${job.id})`);
    });

    (this.queue as any).on('failed', (job: any, err: any) => {
      logger.error(
        `❌ Data processing job failed: ${job?.name} (ID: ${job?.id})`,
        { error: err.message, attempt: job?.attemptsMade }
      );
    });

    (this.queue as any).on('error', (error: any) => {
      logger.error('Data Processing Queue Error:', error);
    });

    // Track progress
    this.queue.on('progress', (job: any, progress: any) => {
      logger.debug(`📈 Data processing job progress: ${job.name} (ID: ${job.id}) - ${progress}%`);
    });
  }

  /**
   * Close queue connection
   */
  async close() {
    await this.queue.close();
  }
}

export const dataProcessingQueue = new DataProcessingQueue();
