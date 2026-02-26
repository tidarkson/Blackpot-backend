/**
 * Email Module
 * Central export for all email-related functionality
 */

export { templateService, EmailTemplateType, TemplateService } from './services/templateService';
export { emailLogService, EmailLogService, type EmailLogCreateInput, type EmailLogUpdateInput } from './services/emailLogService';
export { bounceHandlingService, BounceHandlingService, type BounceInfo, type UnsubscribeRecord } from './services/bounceHandlingService';

// Email templates
export { sendOrderConfirmationEmail, sendPaymentReceiptEmail, sendPasswordResetEmail, sendAccountVerificationEmail, sendLowStockAlertEmail, sendDailyReportEmail, sendWeeklyReportEmail, sendStaffShiftReminderEmail, sendWeeklyNewsletterEmail, sendFeatureAnnouncementEmail, sendCustomEmail, sendBulkEmails } from '../queues/jobs/emailJobs';

// Email queue and worker
export { emailQueue, type EmailJobData } from '../queues/definitions/email.queue';
export { emailWorker } from '../queues/workers/email.worker';

// Email controller
export { default as emailController } from '../controllers/email.controller';
