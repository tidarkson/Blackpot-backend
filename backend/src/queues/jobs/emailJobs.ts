/**
 * Email Job Helpers
 * Helper functions to add various email jobs to the queue
 */

import { emailQueue, EmailJobData } from '../definitions/email.queue';
import { JOB_NAMES, JobPriority } from '../config/queue.config';
import logger from '../../config/logger';

/**
 * Send order confirmation email
 */
export async function sendOrderConfirmationEmail(
  to: string,
  orderId: string,
  customerName: string,
  items: Array<{ name: string; quantity: number; price: number }>,
  total: number,
  estimatedTime: number
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_ORDER_CONFIRMATION,
      {
        to,
        subject: `Order Confirmation - #${orderId}`,
        data: {
          orderId,
          customerName,
          items,
          total,
          estimatedTime,
        },
        priority: JobPriority.HIGH,
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`📧 Order confirmation email queued for ${to}`);
  } catch (error) {
    logger.error('Failed to queue order confirmation email:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetLink: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_PASSWORD_RESET,
      {
        to,
        subject: 'Password Reset Request',
        data: {
          resetLink,
          userName,
        },
        priority: JobPriority.HIGH,
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`📧 Password reset email queued for ${to}`);
  } catch (error) {
    logger.error('Failed to queue password reset email:', error);
    throw error;
  }
}

/**
 * Send low stock alert email to managers
 */
export async function sendLowStockAlertEmail(
  to: string[],
  restaurantName: string,
  items: Array<{ name: string; currentStock: number }>
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_LOW_STOCK_ALERT,
      {
        to,
        subject: `Low Stock Alert - ${restaurantName}`,
        data: {
          items,
          restaurantName,
        },
        priority: JobPriority.NORMAL,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📧 Low stock alert email queued for ${to.length} managers`);
  } catch (error) {
    logger.error('Failed to queue low stock alert email:', error);
    throw error;
  }
}

/**
 * Send daily report email
 */
export async function sendDailyReportEmail(
  to: string[],
  restaurantName: string,
  reportData: any,
  date: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_DAILY_REPORT,
      {
        to,
        subject: `Daily Report - ${restaurantName}`,
        data: {
          reportData,
          date,
          restaurantName,
        },
        priority: JobPriority.NORMAL,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📧 Daily report email queued for ${to.length} recipients`);
  } catch (error) {
    logger.error('Failed to queue daily report email:', error);
    throw error;
  }
}

/**
 * Send weekly report email
 */
export async function sendWeeklyReportEmail(
  to: string[],
  restaurantName: string,
  reportData: any,
  weekOf: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_WEEKLY_REPORT,
      {
        to,
        subject: `Weekly Report - ${restaurantName}`,
        data: {
          reportData,
          date: weekOf,
          restaurantName,
        },
        priority: JobPriority.NORMAL,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📧 Weekly report email queued for ${to.length} recipients`);
  } catch (error) {
    logger.error('Failed to queue weekly report email:', error);
    throw error;
  }
}

/**
 * Send custom email
 */
export async function sendCustomEmail(
  to: string | string[],
  subject: string,
  template: string,
  data?: Record<string, any>,
  priority?: number
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_CUSTOM_EMAIL,
      {
        to,
        subject,
        template,
        data,
        priority,
      },
      {
        priority: priority || JobPriority.NORMAL,
      }
    );

    logger.info(`📧 Custom email queued: ${subject}`);
  } catch (error) {
    logger.error('Failed to queue custom email:', error);
    throw error;
  }
}
