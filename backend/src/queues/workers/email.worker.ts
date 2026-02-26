/**
 * Email Worker
 * Processes email jobs from the email queue with template rendering and delivery tracking
 */

import { Worker, Job } from 'bullmq';
import { workerConfigs, QUEUE_NAMES, JOB_NAMES } from '../config/queue.config';
import { EmailService } from '../../services/EmailService';
import { templateService } from '../../email/services/templateService';
import { emailLogService } from '../../email/services/emailLogService';
import { bounceHandlingService } from '../../email/services/bounceHandlingService';
import logger from '../../config/logger';
import { emailQueue } from '../definitions/email.queue';
import { EmailJobData } from '../definitions/email.queue';
import { EmailType, EmailStatus } from '@prisma/client';

// Rate limiter for email service (respect SendGrid rate limits: 100 emails/min = ~6 per second)
const emailRateLimiter = {
  lastCall: 0,
  delayMs: 600, // 1000ms / 100 * 60 = 600ms per email for 100/min limit

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
    let emailLogId: string | undefined;

    try {
      logger.info(`📧 Processing email job: ${job.name} (ID: ${job.id})`);

      const { to, subject, template, data = {}, cc, bcc } = job.data;
      const tenantId = data.tenantId;

      // Validate required fields
      if (!to || !subject) {
        throw new Error('Missing required email fields: to, subject');
      }

      if (!tenantId) {
        throw new Error('Missing tenantId for email tracking');
      }

      const recipients = Array.isArray(to) ? to : [to];

      // Check bounce list before sending
      for (const email of recipients) {
        const shouldSkip = await bounceHandlingService.shouldSkipEmail(email, tenantId);
        if (shouldSkip) {
          logger.warn(`Skipping bounced/unsubscribed email: ${email}`);
          recipients.splice(recipients.indexOf(email), 1);
        }
      }

      if (recipients.length === 0) {
        logger.warn(`All recipients for ${job.name} are bounced/unsubscribed`);
        return;
      }

      // Create email log entry
      const emailLog = await emailLogService.createEmailLog({
        tenantId,
        to: recipients,
        cc: cc || [],
        bcc: bcc || [],
        subject,
        templateName: template,
        emailType: this.getEmailType(job.name),
        relatedEntityId: data.orderId || data.userId,
        relatedEntityType: data.entityType,
        status: EmailStatus.QUEUED,
        metadata: data,
      });

      emailLogId = emailLog.id;

      // Apply rate limiting
      await emailRateLimiter.wait();

      // Render template if specified
      let htmlContent: string;
      if (template) {
        try {
          htmlContent = await templateService.renderTemplate(template, {
            ...data,
            unsubscribeLink: `${process.env.FRONTEND_URL}/unsubscribe?token=${emailLogId}`,
            preferencesLink: `${process.env.FRONTEND_URL}/preferences`,
          });
        } catch (error) {
          logger.warn(`Failed to render template ${template}, using plain text`, error);
          htmlContent = `<p>${subject}</p><p>${JSON.stringify(data)}</p>`;
        }
      } else {
        htmlContent = data.htmlContent || `<p>${subject}</p>`;
      }

      // Update log with rendered content
      await emailLogService.updateEmailLog(emailLogId, {
        status: EmailStatus.SENDING,
        metadata: { ...data, htmlContent },
      });

      // Send through email service
      try {
        const sendResult = await emailService.sendBulkEmails(
          recipients.map((email) => ({
            to: email,
            subject,
            html: htmlContent,
          }))
        );

        // Mark as sent in email log
        await emailLogService.markAsSent(emailLogId);

        logger.info(`✅ Email job completed: ${job.name} (ID: ${job.id}) - Recipients: ${recipients.length}`);
      } catch (sendError) {
        // Email service failed - will retry
        const errorMsg = sendError instanceof Error ? sendError.message : String(sendError);
        throw new Error(`Failed to send email: ${errorMsg}`);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Email job failed: ${job.name} (ID: ${job.id})`, {
        error: err.message,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      });

      // Update email log with failure
      if (emailLogId) {
        const nextRetryAt = new Date();
        nextRetryAt.setSeconds(nextRetryAt.getSeconds() + Math.pow(2, job.attemptsMade || 0) * 60);

        await emailLogService.markAsFailed(
          emailLogId,
          err.message,
          nextRetryAt
        );
      }

      // Re-throw to let BullMQ handle retry logic
      throw err;
    }
  }

  /**
   * Map job name to email type
   */
  private getEmailType(jobName: string): EmailType {
    const typeMap: Record<string, EmailType> = {
      [JOB_NAMES.SEND_ORDER_CONFIRMATION]: EmailType.ORDER_CONFIRMATION,
      [JOB_NAMES.SEND_PASSWORD_RESET]: EmailType.PASSWORD_RESET,
      [JOB_NAMES.SEND_LOW_STOCK_ALERT]: EmailType.LOW_STOCK_ALERT,
      [JOB_NAMES.SEND_DAILY_REPORT]: EmailType.DAILY_REPORT,
      [JOB_NAMES.SEND_WEEKLY_REPORT]: EmailType.WEEKLY_REPORT,
      [JOB_NAMES.SEND_CUSTOM_EMAIL]: EmailType.CUSTOM,
    };

    return typeMap[jobName] || EmailType.CUSTOM;
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

    // Log completed jobs
    (this.worker as any).on('completed', (job: Job) => {
      logger.debug(`✅ Email job completed successfully: ${job.name}`);
    });

    // Log failed jobs
    (this.worker as any).on('failed', (job: Job, err: Error) => {
      logger.debug(`❌ Email job failed: ${job.name} - ${err.message}`);
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

logger.info('📧 Email Worker initialized with template rendering and delivery tracking');
