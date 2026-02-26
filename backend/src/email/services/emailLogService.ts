/**
 * Email Log Service
 * Handles tracking and logging of email sending, delivery, and failures
 */

import { PrismaClient, EmailStatus, BounceType, EmailType } from '@prisma/client';
import logger from '../../config/logger';

const prisma = new PrismaClient();

export interface EmailLogCreateInput {
  tenantId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  templateName?: string;
  htmlContent?: string;
  emailType: EmailType;
  status?: EmailStatus;
  relatedEntityId?: string;
  relatedEntityType?: string;
  metadata?: Record<string, any>;
  externalId?: string;
}

export interface EmailLogUpdateInput {
  status?: EmailStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  bounceType?: BounceType;
  bounceReason?: string;
  failureReason?: string;
  attempts?: number;
  nextRetryAt?: Date;
  metadata?: Record<string, any>;
  externalId?: string;
}

export class EmailLogService {
  /**
   * Create a new email log entry
   */
  async createEmailLog(data: EmailLogCreateInput) {
    try {
      const emailLog = await prisma.emailLog.create({
        data: {
          tenantId: data.tenantId,
          to: data.to,
          cc: data.cc || [],
          bcc: data.bcc || [],
          subject: data.subject,
          templateName: data.templateName,
          htmlContent: data.htmlContent,
          emailType: data.emailType,
          status: data.status || EmailStatus.PENDING,
          relatedEntityId: data.relatedEntityId,
          relatedEntityType: data.relatedEntityType,
          metadata: data.metadata,
          externalId: data.externalId,
        },
      });

      logger.debug(`📧 Email log created: ${emailLog.id}`);
      return emailLog;
    } catch (error) {
      logger.error('Failed to create email log', error);
      throw error;
    }
  }

  /**
   * Update an email log entry
   */
  async updateEmailLog(emailLogId: string, data: EmailLogUpdateInput) {
    try {
      const emailLog = await prisma.emailLog.update({
        where: { id: emailLogId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.debug(`📧 Email log updated: ${emailLogId} - Status: ${data.status}`);
      return emailLog;
    } catch (error) {
      logger.error(`Failed to update email log: ${emailLogId}`, error);
      throw error;
    }
  }

  /**
   * Mark email as sent
   */
  async markAsSent(emailLogId: string, externalId?: string) {
    return this.updateEmailLog(emailLogId, {
      status: EmailStatus.SENT,
      sentAt: new Date(),
      externalId: externalId,
    });
  }

  /**
   * Mark email as delivered
   */
  async markAsDelivered(emailLogId: string) {
    return this.updateEmailLog(emailLogId, {
      status: EmailStatus.DELIVERED,
      deliveredAt: new Date(),
    });
  }

  /**
   * Mark email as failed
   */
  async markAsFailed(emailLogId: string, reason: string, nextRetryAt?: Date) {
    const emailLog = await prisma.emailLog.findUnique({
      where: { id: emailLogId },
    });

    if (!emailLog) {
      throw new Error(`Email log not found: ${emailLogId}`);
    }

    const attempts = (emailLog.attempts || 0) + 1;
    const maxAttempts = emailLog.maxAttempts || 5;

    // If max attempts reached, mark as failed permanently
    const status = attempts >= maxAttempts ? EmailStatus.FAILED : EmailStatus.QUEUED;

    return this.updateEmailLog(emailLogId, {
      status,
      failureReason: reason,
      attempts,
      nextRetryAt: nextRetryAt,
    });
  }

  /**
   * Mark email as bounced
   */
  async markAsBounced(
    emailLogId: string,
    bounceType: BounceType,
    reason: string
  ) {
    return this.updateEmailLog(emailLogId, {
      status: EmailStatus.BOUNCED,
      bounceType,
      bounceReason: reason,
    });
  }

  /**
   * Mark email as opened
   */
  async markAsOpened(emailLogId: string) {
    return this.updateEmailLog(emailLogId, {
      openedAt: new Date(),
    });
  }

  /**
   * Mark email as clicked
   */
  async markAsClicked(emailLogId: string) {
    return this.updateEmailLog(emailLogId, {
      clickedAt: new Date(),
    });
  }

  /**
   * Get email log by ID
   */
  async getEmailLog(emailLogId: string) {
    try {
      return await prisma.emailLog.findUnique({
        where: { id: emailLogId },
      });
    } catch (error) {
      logger.error(`Failed to fetch email log: ${emailLogId}`, error);
      throw error;
    }
  }

  /**
   * Get email log by ID (alias for getEmailLog)
   */
  async getEmailLogById(emailLogId: string) {
    return this.getEmailLog(emailLogId);
  }

  /**
   * Mark email as unsubscribed
   */
  async markAsUnsubscribed(emailLogId: string, reason: string) {
    return this.updateEmailLog(emailLogId, {
      status: EmailStatus.UNSUBSCRIBED,
      metadata: { unsubscribeReason: reason, unsubscribedAt: new Date() },
    });
  }

  /**
   * Generate unsubscribe token
   */
  async generateUnsubscribeToken(emailLogId: string): Promise<string> {
    try {
      const emailLog = await prisma.emailLog.findUnique({
        where: { id: emailLogId },
      });

      if (!emailLog) {
        throw new Error(`Email log not found: ${emailLogId}`);
      }

      // Generate a token from email log ID and tenant ID
      const token = Buffer.from(
        `${emailLogId}:${emailLog.tenantId}:${Date.now()}`
      ).toString('base64');

      logger.debug(`Generated unsubscribe token for email log: ${emailLogId}`);
      return token;
    } catch (error) {
      logger.error(`Failed to generate unsubscribe token`, error);
      throw error;
    }
  }

  /**
   * Validate unsubscribe token
   */
  async validateUnsubscribeToken(token: string): Promise<boolean> {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      if (parts.length !== 3) {
        logger.warn(`Invalid unsubscribe token format`);
        return false;
      }

      const emailLogId = parts[0];
      const emailLog = await prisma.emailLog.findUnique({
        where: { id: emailLogId },
      });

      if (!emailLog) {
        logger.warn(`Email log not found for token: ${emailLogId}`);
        return false;
      }

      logger.debug(`Unsubscribe token validated for email log: ${emailLogId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to validate unsubscribe token`, error);
      return false;
    }
  }

  /**
   * Get email logs by filters (accepts tenantId and filters object)
   */
  async getEmailLogs(tenantIdOrFilters: string | {
    tenantId?: string;
    status?: EmailStatus;
    emailType?: EmailType;
    from?: Date;
    to?: Date;
    relatedEntityId?: string;
    skip?: number;
    take?: number;
  }, optionalFilters?: {
    status?: EmailStatus;
    emailType?: EmailType;
    from?: Date;
    to?: Date;
    relatedEntityId?: string;
    skip?: number;
    take?: number;
  }) {
    try {
      // Handle both call signatures for backward compatibility
      let filters: any = {};

      if (typeof tenantIdOrFilters === 'string') {
        filters.tenantId = tenantIdOrFilters;
        if (optionalFilters) {
          filters = { ...filters, ...optionalFilters };
        }
      } else {
        filters = tenantIdOrFilters;
      }

      const { tenantId, status, emailType, from, to, relatedEntityId, skip = 0, take = 50 } = filters;

      const where: any = {};

      if (tenantId) where.tenantId = tenantId;
      if (status) where.status = status;
      if (emailType) where.emailType = emailType;
      if (relatedEntityId) where.relatedEntityId = relatedEntityId;

      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      return await prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });
    } catch (error) {
      logger.error('Failed to fetch email logs', error);
      throw error;
    }
  }

  /**
   * Get email statistics
   */
  async getEmailStats(
    tenantId: string,
    from?: Date,
    to?: Date
  ) {
    try {
      const where: any = { tenantId };

      if (from || to) {
        where.createdAt = {};
        if (from) where.createdAt.gte = from;
        if (to) where.createdAt.lte = to;
      }

      const stats = await prisma.emailLog.aggregate({
        where,
        _count: true,
      });

      // Get count by status
      const statuses = await Promise.all(
        Object.values(EmailStatus).map(async (status) => ({
          [status]: (
            await prisma.emailLog.count({
              where: { ...where, status },
            })
          ),
        }))
      );

      const statusCounts = Object.assign({}, ...statuses);

      // Get count by email type
      const types = await Promise.all(
        Object.values(EmailType).map(async (type) => ({
          [type]: (
            await prisma.emailLog.count({
              where: { ...where, emailType: type },
            })
          ),
        }))
      );

      const typeCounts = Object.assign({}, ...types);

      // Calculate open rate
      const sent = statusCounts[EmailStatus.SENT] || 0;
      const delivered = statusCounts[EmailStatus.DELIVERED] || 0;
      const opened = (await prisma.emailLog.count({
        where: { ...where, openedAt: { not: null } },
      })) || 0;

      const openRate = delivered > 0 ? (opened / delivered) * 100 : 0;
      const deliveryRate = sent > 0 ? (delivered / sent) * 100 : 0;

      return {
        total: stats._count,
        statuses: statusCounts,
        types: typeCounts,
        openRate: parseFloat(openRate.toFixed(2)),
        deliveryRate: parseFloat(deliveryRate.toFixed(2)),
        sent,
        delivered,
        opened,
        failed: statusCounts[EmailStatus.FAILED] || 0,
        bounced: statusCounts[EmailStatus.BOUNCED] || 0,
      };
    } catch (error) {
      logger.error('Failed to get email statistics', error);
      throw error;
    }
  }

  /**
   * Get pending emails for retry
   */
  async getPendingRetries(limit: number = 50) {
    try {
      return await prisma.emailLog.findMany({
        where: {
          status: EmailStatus.QUEUED,
          nextRetryAt: {
            lte: new Date(),
          },
          attempts: {
            lt: 5,
          },
        },
        orderBy: { nextRetryAt: 'asc' },
        take: limit,
      });
    } catch (error) {
      logger.error('Failed to get pending retries', error);
      throw error;
    }
  }

  /**
   * Get bounced email addresses
   */
  async getBouncedEmails(tenantId: string) {
    try {
      const bounced = await prisma.emailLog.findMany({
        where: {
          tenantId,
          status: EmailStatus.BOUNCED,
        },
        distinct: ['to'],
        select: {
          to: true,
          bounceType: true,
          bounceReason: true,
          createdAt: true,
        },
      });

      return bounced;
    } catch (error) {
      logger.error('Failed to get bounced emails', error);
      throw error;
    }
  }

  /**
   * Cleanup old email logs (archive older than X days)
   */
  async cleanupOldLogs(daysToKeep: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await prisma.emailLog.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          status: {
            in: [EmailStatus.SENT, EmailStatus.DELIVERED],
          },
        },
      });

      logger.info(`🗑️ Cleaned up ${result.count} email logs older than ${daysToKeep} days`);
      return result;
    } catch (error) {
      logger.error('Failed to cleanup old email logs', error);
      throw error;
    }
  }

  /**
   * Get email delivery rate for the last 7 days
   */
  async getDeliveryRateLast7Days(tenantId: string) {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const where = {
        tenantId,
        createdAt: { gte: sevenDaysAgo },
      };

      const total = await prisma.emailLog.count({ where });
      const delivered = await prisma.emailLog.count({
        where: { ...where, status: EmailStatus.DELIVERED },
      });

      const rate = total > 0 ? (delivered / total) * 100 : 0;

      return {
        total,
        delivered,
        failed: total - delivered,
        rate: parseFloat(rate.toFixed(2)),
      };
    } catch (error) {
      logger.error('Failed to get delivery rate for last 7 days', error);
      throw error;
    }
  }
}

export const emailLogService = new EmailLogService();
