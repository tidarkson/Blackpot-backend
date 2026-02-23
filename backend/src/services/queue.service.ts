/**
 * Queue Service
 * Centralized service for managing all queues and monitoring
 */

import { Queue } from 'bullmq';
import { emailQueue } from '../queues/definitions/email.queue';
import { reportQueue } from '../queues/definitions/report.queue';
import { dataProcessingQueue } from '../queues/definitions/dataProcessing.queue';
import { scheduledQueue } from '../queues/definitions/scheduled.queue';
import { QUEUE_NAMES, JOB_NAMES } from '../queues/config/queue.config';
import logger from '../config/logger';

export interface QueueStats {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface JobInfo {
  id: string | number;
  name: string;
  data: any;
  progress: number;
  attemptsMade: number;
  maxAttempts: number;
  state: string;
  failedReason?: string;
  stacktrace?: string[];
}

export class QueueService {
  private queues: Map<string, Queue>;

  constructor() {
    this.queues = new Map();
    this.registerQueues();
  }

  /**
   * Register all queues
   */
  private registerQueues(): void {
    this.queues.set(QUEUE_NAMES.EMAIL, emailQueue.getQueue());
    this.queues.set(QUEUE_NAMES.REPORT, reportQueue.getQueue());
    this.queues.set(QUEUE_NAMES.DATA_PROCESSING, dataProcessingQueue.getQueue());
    this.queues.set(QUEUE_NAMES.SCHEDULED, scheduledQueue.getQueue());

    logger.info('✅ Queue Service initialized with 4 queues');
  }

  /**
   * Get all queue statistics
   */
  async getQueueStats(): Promise<QueueStats[]> {
    const stats: QueueStats[] = [];

    for (const [queueName, queue] of this.queues) {
      const counts = await queue.getJobCounts();

      stats.push({
        queueName,
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
        paused: counts.paused || 0,
      });
    }

    return stats;
  }

  /**
   * Get stats for a specific queue
   */
  async getQueueStatsByName(queueName: string): Promise<QueueStats | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const counts = await queue.getJobCounts();

    return {
      queueName,
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
      paused: counts.paused || 0,
    };
  }

  /**
   * Get queue health status
   */
  async getQueueHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    queues: { name: string; status: string }[];
    metrics: {
      totalJobs: number;
      failedJobs: number;
      activeJobs: number;
      pendingJobs: number;
    };
  }> {
    const stats = await this.getQueueStats();

    let totalJobs = 0;
    let failedJobs = 0;
    let activeJobs = 0;
    let pendingJobs = 0;

    const queueHealth: { name: string; status: string }[] = [];

    for (const stat of stats) {
      totalJobs += stat.waiting + stat.active + stat.completed + stat.failed + stat.delayed;
      failedJobs += stat.failed;
      activeJobs += stat.active;
      pendingJobs += stat.waiting + stat.delayed;

      // Determine queue health
      const failureRate = stat.completed > 0 ? stat.failed / (stat.completed + stat.failed) : 0;
      const isHealthy = failureRate < 0.05; // Less than 5% failure rate

      queueHealth.push({
        name: stat.queueName,
        status: isHealthy ? 'healthy' : 'degraded',
      });
    }

    // Overall health status
    const overallFailureRate = totalJobs > 0 ? failedJobs / totalJobs : 0;
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (overallFailureRate > 0.1) {
      status = 'unhealthy';
    } else if (overallFailureRate > 0.05) {
      status = 'degraded';
    }

    return {
      status,
      queues: queueHealth,
      metrics: {
        totalJobs,
        failedJobs,
        activeJobs,
        pendingJobs,
      },
    };
  }

  /**
   * Get job info by ID
   */
  async getJobInfo(queueName: string, jobId: string): Promise<JobInfo | null> {
    const queue = this.queues.get(queueName);
    if (!queue) return null;

    const job = await queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job.progress || 0) as number;

    return {
      id: job.id!,
      name: job.name,
      data: job.data,
      progress,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      state: state || 'unknown',
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
    };
  }

  /**
   * Get failed jobs in a queue
   */
  async getFailedJobs(queueName: string, limit: number = 50): Promise<JobInfo[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    const failedJobs = await queue.getJobs(['failed'], 0, limit - 1);

    return failedJobs.map((job) => ({
      id: job.id!,
      name: job.name,
      data: job.data,
      progress: (job.progress || 0) as number,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      state: 'failed',
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
    }));
  }

  /**
   * Get active jobs in a queue
   */
  async getActiveJobs(queueName: string, limit: number = 50): Promise<JobInfo[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    const activeJobs = await queue.getJobs(['active'], 0, limit - 1);

    return activeJobs.map((job) => ({
      id: job.id!,
      name: job.name,
      data: job.data,
      progress: (job.progress || 0) as number,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      state: 'active',
    }));
  }

  /**
   * Get waiting jobs in a queue
   */
  async getWaitingJobs(queueName: string, limit: number = 50): Promise<JobInfo[]> {
    const queue = this.queues.get(queueName);
    if (!queue) return [];

    const waitingJobs = await queue.getJobs(['waiting'], 0, limit - 1);

    return waitingJobs.map((job) => ({
      id: job.id!,
      name: job.name,
      data: job.data,
      progress: (job.progress || 0) as number,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts || 3,
      state: 'waiting',
    }));
  }

  /**
   * Retry a failed job
   */
  async retryJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;

    const job = await queue.getJob(jobId);
    if (!job) return false;

    try {
      await job.retry();
      logger.info(`🔄 Job ${jobId} retried in queue ${queueName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to retry job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Remove a job
   */
  async removeJob(queueName: string, jobId: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;

    const job = await queue.getJob(jobId);
    if (!job) return false;

    try {
      await job.remove();
      logger.info(`🗑️ Job ${jobId} removed from queue ${queueName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to remove job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Clear all jobs from a queue
   */
  async clearQueue(queueName: string): Promise<number> {
    const queue = this.queues.get(queueName);
    if (!queue) return 0;

    try {
      // Clean jobs older than 1 day (86400000 ms)
      const count = await queue.clean(86400000, 100);
      logger.warn(`⚠️ Cleared ${count.length || count} jobs from queue ${queueName}`);
      return Array.isArray(count) ? count.length : (count || 0);
    } catch (error) {
      logger.error(`Failed to clear queue ${queueName}:`, error);
      return 0;
    }
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;

    try {
      await queue.pause();
      logger.warn(`⏸️ Queue ${queueName} paused`);
      return true;
    } catch (error) {
      logger.error(`Failed to pause queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<boolean> {
    const queue = this.queues.get(queueName);
    if (!queue) return false;

    try {
      await queue.resume();
      logger.info(`▶️ Queue ${queueName} resumed`);
      return true;
    } catch (error) {
      logger.error(`Failed to resume queue ${queueName}:`, error);
      return false;
    }
  }

  /**
   * Get all queues
   */
  getQueues(): Map<string, Queue> {
    return this.queues;
  }

  /**
   * Close all queues gracefully
   */
  async closeAllQueues(): Promise<void> {
    for (const [queueName, queue] of this.queues) {
      try {
        await queue.close();
        logger.info(`✅ Queue ${queueName} closed`);
      } catch (error) {
        logger.error(`Error closing queue ${queueName}:`, error);
      }
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();
