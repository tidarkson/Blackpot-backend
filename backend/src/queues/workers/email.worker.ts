/**
 * Email Worker
 * Processes email jobs from the email queue
 */

import { Worker, Job } from 'bullmq';
import { workerConfigs, QUEUE_NAMES, JOB_NAMES } from '../config/queue.config';
import { EmailService } from '../../services/EmailService';
import logger from '../../config/logger';
import { emailQueue } from '../definitions/email.queue';
import { EmailJobData } from '../definitions/email.queue';

// Rate limiter for email service (3 emails per second)
const emailRateLimiter = {
  lastCall: 0,
  delayMs: 333, // 1000ms / 3 = 333ms per email

  async wait() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.delayMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.delayMs - timeSinceLastCall)
      );
    }
    this.lastCall = Date.now();
  },
};

const emailService = new EmailService();

export class EmailWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      QUEUE_NAMES.EMAIL,
      async (job: Job<EmailJobData>) => {
        return this.processEmailJob(job);
      },
      workerConfigs.email
    );

    this.setupEventHandlers();
  }

  /**
   * Main job processing function
   */
  private async processEmailJob(job: Job<EmailJobData>): Promise<void> {
    try {
      logger.info(`📧 Processing email job: ${job.name} (ID: ${job.id})`);

      // Apply rate limiting
      await emailRateLimiter.wait();

      const { to, subject, template, data } = job.data;

      // Validate email data
      if (!to || !subject) {
        throw new Error('Missing required email fields: to, subject');
      }

      // Process based on job type
      switch (job.name) {
        case JOB_NAMES.SEND_PASSWORD_RESET:
          await this.sendPasswordReset(to as string, data || {});
          break;

        default:
          // Generic email via sendBulkEmails
          const recipients = Array.isArray(to) ? to : [to];
          await emailService.sendBulkEmails(
            recipients.map((email) => ({
              to: email,
              subject,
              html: `<p>Email from ${job.name}</p>`,
            }))
          );
          break;
      }

      logger.info(`✅ Email job completed: ${job.name} (ID: ${job.id})`);
      return;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Email job failed: ${job.name} (ID: ${job.id})`, {
        error: err.message,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      });

      // Re-throw to let BullMQ handle retry logic
      throw err;
    }
  }

  /**
   * Send password reset email
   */
  private async sendPasswordReset(to: string, data: any): Promise<void> {
    const { resetLink, userName } = data;

    const resetUrl = resetLink || '#';
    await emailService.sendPasswordResetEmail(
      to,
      'temp-token',
      userName || 'User',
      new Date(Date.now() + 3600000)
    );
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    (this.worker as any).on('ready', () => {
      logger.info('📧 Email Worker is ready and listening for jobs');
    });

    (this.worker as any).on('error', (error: any) => {
      logger.error('📧 Email Worker error:', error);
    });

    // Log stalled jobs
    (this.worker as any).on('stalled', (jobId: any) => {
      logger.warn(`⚠️ Email job stalled: ${jobId}`);
    });
  }

  /**
   * Gracefully close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info('📧 Email Worker closed');
  }
}

// Export singleton instance
export const emailWorker = new EmailWorker();

logger.info('📧 Email Worker initialized');
