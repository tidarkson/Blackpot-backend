import { Job } from 'bullmq';
import logger from '../../config/logger';
import { failedJobsQueue } from '../definitions/failedJobs.queue';

function getMaxAttempts(job: Job): number {
  return typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
}

export async function moveToDeadLetterQueue(job: Job, error: Error, workerName: string): Promise<void> {
  const maxAttempts = getMaxAttempts(job);
  const attemptsMade = job.attemptsMade ?? 0;

  if (attemptsMade < maxAttempts) {
    return;
  }

  await failedJobsQueue.addJob(`failed:${job.name}`, {
    originalQueue: job.queueName,
    originalJobId: job.id?.toString(),
    jobName: job.name,
    payload: (job.data ?? {}) as Record<string, unknown>,
    failedReason: error.message,
    attemptsMade,
    maxAttempts,
    failedAt: new Date().toISOString(),
    stacktrace: job.stacktrace,
    worker: workerName,
  });

  logger.error('Job moved to failed-jobs queue after max retries', {
    worker: workerName,
    queue: job.queueName,
    jobId: job.id,
    jobName: job.name,
    attemptsMade,
    maxAttempts,
    failedReason: error.message,
  });
}
