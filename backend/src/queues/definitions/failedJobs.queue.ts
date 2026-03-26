/**
 * Failed Jobs Queue Definition
 * Stores terminally failed jobs for manual review.
 */

import { Queue } from 'bullmq';
import { deadLetterQueueConfig, QUEUE_NAMES } from '../config/queue.config';
import logger from '../../config/logger';

export interface FailedJobData {
  originalQueue: string;
  originalJobId?: string;
  jobName: string;
  payload: Record<string, unknown>;
  failedReason: string;
  attemptsMade: number;
  maxAttempts: number;
  failedAt: string;
  stacktrace?: string[];
  worker: string;
}

class FailedJobsQueue {
  private queue: Queue;

  constructor() {
    this.queue = new Queue(QUEUE_NAMES.DEAD_LETTER, deadLetterQueueConfig);
    this.setupEventHandlers();
  }

  async addJob(jobName: string, data: FailedJobData): Promise<void> {
    await this.queue.add(jobName, data, {
      removeOnComplete: false,
      attempts: 1,
    });
  }

  getQueue(): Queue {
    return this.queue;
  }

  private setupEventHandlers() {
    this.queue.on('error', (error) => {
      logger.error('Failed Jobs Queue Error:', error);
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export const failedJobsQueue = new FailedJobsQueue();
