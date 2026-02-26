/**
 * Email Job Helpers
 * Helper functions to add various email jobs to the queue with template rendering
 */

import { emailQueue, EmailJobData } from '../definitions/email.queue';
import { JOB_NAMES, JobPriority } from '../config/queue.config';
import logger from '../../config/logger';

/**
 * Send order confirmation email (HIGH PRIORITY)
 */
export async function sendOrderConfirmationEmail(
  to: string,
  orderId: string,
  customerName: string,
  items: Array<{ name: string; quantity: number; price: number; total?: number }>,
  total: number,
  estimatedTime: number,
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    // Calculate subtotal and tax if not provided
    const subtotal = items.reduce((sum, item) => sum + (item.total || item.price * item.quantity), 0);
    const tax = total - subtotal;

    await emailQueue.addJob(
      JOB_NAMES.SEND_ORDER_CONFIRMATION,
      {
        to,
        subject: `Order Confirmation - #${orderId}`,
        template: 'orderConfirmation',
        data: {
          tenantId,
          orderId,
          customerName,
          items,
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          total: total.toFixed(2),
          estimatedTime,
          orderDate: new Date().toLocaleDateString(),
          ...additionalData,
        },
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`📧 Order confirmation email queued for ${to} (Order: ${orderId})`);
  } catch (error) {
    logger.error('Failed to queue order confirmation email:', error);
    throw error;
  }
}

/**
 * Send payment receipt email (HIGH PRIORITY)
 */
export async function sendPaymentReceiptEmail(
  to: string,
  customerName: string,
  orderId: string,
  receiptNumber: string,
  transactionId: string,
  items: Array<{ name: string; quantity: number; price: number; total?: number }>,
  subtotal: number,
  tax: number,
  serviceCharge?: number,
  tip?: number,
  discount?: number,
  total?: number,
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    const finalTotal = total || (subtotal + tax + (serviceCharge || 0) + (tip || 0) - (discount || 0));

    await emailQueue.addJob(
      JOB_NAMES.SEND_PAYMENT_RECEIPT,
      {
        to,
        subject: `Payment Receipt - #${receiptNumber}`,
        template: 'paymentReceipt',
        data: {
          tenantId,
          customerName,
          orderId,
          receiptNumber,
          transactionId,
          items,
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          taxRate: ((tax / subtotal) * 100).toFixed(1),
          serviceCharge: serviceCharge?.toFixed(2),
          tip: tip?.toFixed(2),
          discount: discount?.toFixed(2),
          total: finalTotal.toFixed(2),
          paymentDate: new Date().toLocaleDateString(),
          paymentMethod: additionalData?.paymentMethod || 'Credit Card',
          cardLastFour: additionalData?.cardLastFour,
          ...additionalData,
        },
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`📧 Payment receipt email queued for ${to} (Receipt: ${receiptNumber})`);
  } catch (error) {
    logger.error('Failed to queue payment receipt email:', error);
    throw error;
  }
}

/**
 * Send password reset email (CRITICAL PRIORITY)
 */
export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetLink: string,
  tenantId?: string,
  requestId?: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_PASSWORD_RESET,
      {
        to,
        subject: 'Password Reset Request',
        template: 'passwordReset',
        data: {
          tenantId,
          userName,
          resetLink,
          requestId: requestId || generateRequestId(),
          requestTime: new Date().toLocaleString(),
          helpCenter: process.env.HELP_CENTER_URL || 'https://help.blackpot.com',
        },
      },
      {
        priority: JobPriority.CRITICAL,
      }
    );

    logger.info(`📧 Password reset email queued for ${to}`);
  } catch (error) {
    logger.error('Failed to queue password reset email:', error);
    throw error;
  }
}

/**
 * Send account verification email (CRITICAL PRIORITY)
 */
export async function sendAccountVerificationEmail(
  to: string,
  userName: string,
  verificationLink: string,
  verificationCode: string,
  tenantId?: string,
  accountType?: string,
  restaurantName?: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_ACCOUNT_VERIFICATION,
      {
        to,
        subject: 'Verify Your Email Address',
        template: 'accountVerification',
        data: {
          tenantId,
          userName,
          email: to,
          verificationLink,
          verificationCode,
          accountType: accountType || 'User',
          restaurantName,
          expiryTime: getExpiryTime(24), // 24 hours
          requestId: generateRequestId(),
        },
      },
      {
        priority: JobPriority.CRITICAL,
      }
    );

    logger.info(`📧 Account verification email queued for ${to}`);
  } catch (error) {
    logger.error('Failed to queue account verification email:', error);
    throw error;
  }
}

/**
 * Send low stock alert email (MEDIUM PRIORITY)
 */
export async function sendLowStockAlertEmail(
  to: string[],
  restaurantName: string,
  items: Array<{
    name: string;
    currentStock: number;
    minimumLevel: number;
    unit: string;
    supplier?: string;
    recommendedOrder?: number;
    isCritical?: boolean;
  }>,
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    const criticalItems = items.filter((item) => item.isCritical);

    await emailQueue.addJob(
      JOB_NAMES.SEND_LOW_STOCK_ALERT,
      {
        to,
        subject: `Low Stock Alert - ${restaurantName}`,
        template: 'lowStockAlert',
        data: {
          tenantId,
          restaurantName,
          managerName: additionalData?.managerName || 'Manager',
          items,
          itemCount: items.length,
          criticalItems: criticalItems.length > 0 ? criticalItems : undefined,
          alertDate: new Date().toLocaleString(),
          inventoryLink: `${process.env.FRONTEND_URL}/inventory`,
          suppliersLink: `${process.env.FRONTEND_URL}/suppliers`,
          ...additionalData,
        },
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
 * Send daily report email (LOW PRIORITY)
 */
export async function sendDailyReportEmail(
  to: string[],
  reportDate: string,
  reportData: {
    totalOrders?: number;
    totalRevenue?: number;
    averageOrderValue?: number;
    totalCustomers?: number;
    paymentMethods?: Array<any>;
    topItems?: Array<any>;
    staffPerformance?: Array<any>;
    busyHours?: string;
    notes?: string;
    previousDayCompare?: any;
  },
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_DAILY_REPORT,
      {
        to,
        subject: `Daily Sales Report - ${reportDate}`,
        template: 'dailyReport',
        data: {
          tenantId,
          reportDate,
          managerName: additionalData?.managerName || 'Manager',
          restaurantName: additionalData?.restaurantName || 'Restaurant',
          ...reportData,
          dashboardLink: `${process.env.FRONTEND_URL}/dashboard`,
          reportLink: `${process.env.FRONTEND_URL}/reports/daily?date=${reportDate}`,
          generatedAt: new Date().toLocaleString(),
        },
      },
      {
        priority: JobPriority.LOW,
      }
    );

    logger.info(`📧 Daily report email queued for ${to.length} recipients`);
  } catch (error) {
    logger.error('Failed to queue daily report email:', error);
    throw error;
  }
}

/**
 * Send weekly report email (LOW PRIORITY)
 */
export async function sendWeeklyReportEmail(
  to: string[],
  weekOf: string,
  reportData: Record<string, any>,
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_WEEKLY_REPORT,
      {
        to,
        subject: `Weekly Report - Week of ${weekOf}`,
        template: 'weeklyNewsletter',
        data: {
          tenantId,
          weekStartDate: weekOf,
          managerName: additionalData?.managerName || 'Manager',
          restaurantName: additionalData?.restaurantName || 'Restaurant',
          ...reportData,
          dashboardLink: `${process.env.FRONTEND_URL}/dashboard`,
          reportLink: `${process.env.FRONTEND_URL}/reports/weekly?week=${weekOf}`,
        },
      },
      {
        priority: JobPriority.LOW,
      }
    );

    logger.info(`📧 Weekly report email queued for ${to.length} recipients`);
  } catch (error) {
    logger.error('Failed to queue weekly report email:', error);
    throw error;
  }
}

/**
 * Send staff shift reminder email (MEDIUM PRIORITY)
 */
export async function sendStaffShiftReminderEmail(
  to: string,
  staffName: string,
  shiftDate: string,
  shiftStartTime: string,
  shiftEndTime: string,
  position: string,
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    const [startHour, startMin] = shiftStartTime.split(':');
    const [endHour, endMin] = shiftEndTime.split(':');
    const startDate = new Date(`${shiftDate}T${shiftStartTime}`);
    const endDate = new Date(`${shiftDate}T${shiftEndTime}`);
    const durationMs = endDate.getTime() - startDate.getTime();
    const duration = (durationMs / (1000 * 60 * 60)).toFixed(1);

    await emailQueue.addJob(
      JOB_NAMES.SEND_STAFF_SHIFT_REMINDER,
      {
        to,
        subject: `Shift Reminder - ${shiftDate}`,
        template: 'staffShiftReminder',
        data: {
          tenantId,
          staffName,
          shiftDate,
          shiftStartTime,
          shiftEndTime,
          shiftDuration: duration,
          position,
          managerName: additionalData?.managerName,
          managerPhone: additionalData?.managerPhone,
          managerEmail: additionalData?.managerEmail,
          restaurantName: additionalData?.restaurantName || 'Restaurant',
          location: additionalData?.location,
          specialInstructions: additionalData?.specialInstructions,
          weeklyHours: additionalData?.weeklyHours,
          omaCall24HoursBefore: additionalData?.omaCall24HoursBefore,
          timeOffLink: `${process.env.FRONTEND_URL}/staff/time-off`,
          scheduleLink: `${process.env.FRONTEND_URL}/staff/schedule`,
          sentAt: new Date().toLocaleString(),
        },
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📧 Shift reminder email queued for ${to} (${shiftDate})`);
  } catch (error) {
    logger.error('Failed to queue shift reminder email:', error);
    throw error;
  }
}

/**
 * Send marketing newsletter email (LOW PRIORITY, BATCHED)
 */
export async function sendWeeklyNewsletterEmail(
  to: string[],
  newsletterData: {
    featuredDish?: { name: string; description: string; price: number; isNew?: boolean };
    events?: Array<{ name: string; date: string; time: string; description: string; reservationLink?: string }>;
    promos?: Array<{ title: string; description: string; code: string; expiryDate?: string; reservationLink?: string }>;
    recentReviews?: Array<{ review: string; customerName: string }>;
    tips?: string[];
    news?: string;
    partners?: Array<{ name: string; description: string }>;
  },
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    const weekStartDate = getWeekStartDate();
    const editionNumber = getWeekNumber();

    await emailQueue.addJob(
      JOB_NAMES.SEND_WEEKLY_NEWSLETTER,
      {
        to,
        subject: 'Weekly Newsletter - What\'s New This Week',
        template: 'weeklyNewsletter',
        data: {
          tenantId,
          customerName: 'Valued Customer',
          restaurantName: additionalData?.restaurantName || 'Restaurant',
          weekStartDate,
          editionNumber,
          ...newsletterData,
          reservationLink: `${process.env.FRONTEND_URL}/reservations`,
          facebookLink: additionalData?.facebookLink || 'https://facebook.com',
          instagramLink: additionalData?.instagramLink || 'https://instagram.com',
          twitterLink: additionalData?.twitterLink || 'https://twitter.com',
          restaurantDomain: additionalData?.restaurantDomain || 'blackpot.com',
        },
      },
      {
        priority: JobPriority.LOW,
        delay: additionalData?.delay, // Can batch sends with delay
      }
    );

    logger.info(`📧 Weekly newsletter email queued for ${to.length} subscribers`);
  } catch (error) {
    logger.error('Failed to queue weekly newsletter email:', error);
    throw error;
  }
}

/**
 * Send feature announcement email (LOW PRIORITY)
 */
export async function sendFeatureAnnouncementEmail(
  to: string[],
  title: string,
  description: string,
  features: string[],
  tenantId?: string,
  additionalData?: Record<string, any>
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_FEATURE_ANNOUNCEMENT,
      {
        to,
        subject: `New Feature: ${title}`,
        template: 'featureAnnouncement',
        data: {
          tenantId,
          title,
          description,
          features,
          restaurantName: additionalData?.restaurantName || 'BlackPot',
          learnMoreLink: additionalData?.learnMoreLink || `${process.env.FRONTEND_URL}/features`,
        },
      },
      {
        priority: JobPriority.LOW,
      }
    );

    logger.info(`📧 Feature announcement email queued for ${to.length} recipients`);
  } catch (error) {
    logger.error('Failed to queue feature announcement email:', error);
    throw error;
  }
}

/**
 * Send custom email with template
 */
export async function sendCustomEmail(
  to: string | string[],
  subject: string,
  template: string,
  data?: Record<string, any>,
  priority?: number,
  tenantId?: string
): Promise<void> {
  try {
    await emailQueue.addJob(
      JOB_NAMES.SEND_CUSTOM_EMAIL,
      {
        to,
        subject,
        template,
        data: {
          tenantId,
          ...data,
        },
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

/**
 * Send bulk emails
 */
export async function sendBulkEmails(
  recipients: Array<{ email: string; name?: string; customData?: Record<string, any> }>,
  subject: string,
  template: string,
  baseData?: Record<string, any>,
  tenantId?: string,
  batchSize: number = 10,
  delayBetweenBatches?: number
): Promise<void> {
  try {
    const batches = chunkArray(recipients, batchSize);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const delay = delayBetweenBatches ? delayBetweenBatches * i : undefined;

      await emailQueue.addJob(
        JOB_NAMES.SEND_BULK_EMAIL,
        {
          to: batch.map((r) => r.email),
          subject,
          template,
          data: {
            tenantId,
            recipients: batch,
            ...baseData,
          },
        },
        {
          priority: JobPriority.LOW,
          delay,
        }
      );
    }

    logger.info(`📧 Bulk emails queued: ${recipients.length} recipients in ${batches.length} batches`);
  } catch (error) {
    logger.error('Failed to queue bulk emails:', error);
    throw error;
  }
}

// Helper functions

function generateRequestId(): string {
  return `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function getExpiryTime(hours: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hours);
  return date.toLocaleString();
}

function getWeekStartDate(): string {
  const date = new Date();
  const day = date.getDay();
  const diff = date.getDate() - day;
  const startDate = new Date(date.setDate(diff));
  return startDate.toLocaleDateString();
}

function getWeekNumber(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNumber;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
