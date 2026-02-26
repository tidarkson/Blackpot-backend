/**
 * Bounce Handling Service
 * Handles email bounces and unsubscribe management
 */

import { PrismaClient, BounceType } from '@prisma/client';
import logger from '../../config/logger';

const prisma = new PrismaClient();

export interface BounceInfo {
  email: string;
  bounceType: BounceType;
  reason?: string;
}

export interface UnsubscribeRecord {
  email: string;
  emailType?: string;
  reason?: string;
  timestamp: Date;
}

export class BounceHandlingService {
  // In-memory cache of bounced emails (can be moved to Redis for distributed systems)
  private hardBouncedEmails = new Set<string>();
  private softBouncedEmails = new Map<string, { count: number; lastBounce: Date }>();

  /**
   * Initialize bounce cache from database on startup
   */
  async initializeBounceCache(tenantId: string): Promise<void> {
    try {
      logger.info('Initializing bounce cache...');

      const bouncedEmails = await prisma.emailLog.findMany({
        where: {
          tenantId,
          status: 'BOUNCED',
        },
        select: {
          to: true,
          bounceType: true,
        },
        distinct: ['to'],
      });

      for (const record of bouncedEmails) {
        for (const email of record.to) {
          if (record.bounceType === 'HARD') {
            this.hardBouncedEmails.add(email);
          } else if (record.bounceType === 'SOFT') {
            this.softBouncedEmails.set(email, {
              count: 1,
              lastBounce: new Date(),
            });
          }
        }
      }

      logger.info(`Bounce cache initialized with ${this.hardBouncedEmails.size} hard bounces and ${this.softBouncedEmails.size} soft bounces`);
    } catch (error) {
      logger.error('Failed to initialize bounce cache', error);
    }
  }

  /**
   * Check if email should be skipped due to bounce history
   */
  async shouldSkipEmail(email: string, tenantId: string): Promise<boolean> {
    try {
      // Check hard bounces
      if (this.hardBouncedEmails.has(email)) {
        logger.warn(`Skipping hard-bounced email: ${email}`);
        return true;
      }

      // Check soft bounces (max 3 soft bounces per email)
      const softBounce = this.softBouncedEmails.get(email);
      if (softBounce && softBounce.count >= 3) {
        logger.warn(`Skipping email with multiple soft bounces: ${email}`);

        // Move to hard bounce if too many soft bounces
        await this.registerHardBounce(email, tenantId, 'Too many soft bounces');
        return true;
      }

      // Check unsubscribe list
      const unsubscribed = await prisma.emailLog.findFirst({
        where: {
          tenantId,
          to: { has: email },
          status: 'UNSUBSCRIBED',
        },
      });

      if (unsubscribed) {
        logger.warn(`Skipping unsubscribed email: ${email}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`Error checking if email should be skipped: ${email}`, error);
      return false;
    }
  }

  /**
   * Register a hard bounce
   */
  async registerHardBounce(
    email: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    try {
      this.hardBouncedEmails.add(email);
      this.softBouncedEmails.delete(email);

      // Log the bounce
      const bouncedEmail = await prisma.emailLog.findFirst({
        where: {
          tenantId,
          to: { has: email },
          status: 'BOUNCED',
          bounceType: 'HARD',
        },
      });

      if (!bouncedEmail) {
        await prisma.emailLog.create({
          data: {
            tenantId,
            to: [email],
            subject: `Bounce: ${email}`,
            emailType: 'CUSTOM',
            status: 'BOUNCED',
            bounceType: 'HARD',
            bounceReason: reason,
          },
        });
      }

      logger.warn(`Registered hard bounce for: ${email} - Reason: ${reason}`);
    } catch (error) {
      logger.error(`Failed to register hard bounce for ${email}`, error);
    }
  }

  /**
   * Register a soft bounce
   */
  async registerSoftBounce(
    email: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    try {
      const current = this.softBouncedEmails.get(email) || { count: 0, lastBounce: new Date() };
      this.softBouncedEmails.set(email, {
        count: current.count + 1,
        lastBounce: new Date(),
      });

      // Log the bounce
      await prisma.emailLog.create({
        data: {
          tenantId,
          to: [email],
          subject: `Bounce: ${email}`,
          emailType: 'CUSTOM',
          status: 'BOUNCED',
          bounceType: 'SOFT',
          bounceReason: reason,
        },
      });

      logger.warn(`Registered soft bounce for: ${email} (Count: ${current.count + 1}) - Reason: ${reason}`);

      // If soft bounces exceed threshold, convert to hard bounce
      if (current.count + 1 >= 3) {
        await this.registerHardBounce(email, tenantId, 'Soft bounce threshold exceeded');
      }
    } catch (error) {
      logger.error(`Failed to register soft bounce for ${email}`, error);
    }
  }

  /**
   * Register a complaint
   */
  async registerComplaint(
    email: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    try {
      this.hardBouncedEmails.add(email);
      this.softBouncedEmails.delete(email);

      await prisma.emailLog.create({
        data: {
          tenantId,
          to: [email],
          subject: `Complaint: ${email}`,
          emailType: 'CUSTOM',
          status: 'BOUNCED',
          bounceType: 'COMPLAINT',
          bounceReason: reason || 'User complained',
        },
      });

      logger.warn(`Registered complaint for: ${email} - Reason: ${reason}`);
    } catch (error) {
      logger.error(`Failed to register complaint for ${email}`, error);
    }
  }

  /**
   * Handle bounce webhook from email service
   */
  async handleBounceWebhook(
    tenantId: string,
    bounceData: {
      email: string;
      bounceType: 'hard' | 'soft';
      reason?: string;
      timestamp?: Date;
    }
  ): Promise<void> {
    try {
      logger.info(
        `Processing bounce webhook for ${bounceData.email} (${bounceData.bounceType})`
      );

      if (bounceData.bounceType === 'hard') {
        await this.registerHardBounce(
          bounceData.email,
          tenantId,
          bounceData.reason
        );
      } else {
        await this.registerSoftBounce(
          bounceData.email,
          tenantId,
          bounceData.reason
        );
      }
    } catch (error) {
      logger.error('Failed to handle bounce webhook', error);
    }
  }

  /**
   * Handle complaint webhook from email service
   */
  async handleComplaintWebhook(
    tenantId: string,
    email: string,
    reason?: string
  ): Promise<void> {
    try {
      logger.info(`Processing complaint webhook for ${email}`);
      await this.registerComplaint(email, tenantId, reason);
    } catch (error) {
      logger.error('Failed to handle complaint webhook', error);
    }
  }

  /**
   * Get bounce statistics
   */
  async getBounceStats(tenantId: string): Promise<{
    hardBounces: number;
    softBounces: number;
    complaints: number;
    total: number;
  }> {
    try {
      const hardBounces = await prisma.emailLog.count({
        where: {
          tenantId,
          bounceType: 'HARD',
        },
      });

      const softBounces = await prisma.emailLog.count({
        where: {
          tenantId,
          bounceType: 'SOFT',
        },
      });

      const complaints = await prisma.emailLog.count({
        where: {
          tenantId,
          bounceType: 'COMPLAINT',
        },
      });

      return {
        hardBounces,
        softBounces,
        complaints,
        total: hardBounces + softBounces + complaints,
      };
    } catch (error) {
      logger.error('Failed to get bounce statistics', error);
      throw error;
    }
  }

  /**
   * Get list of hard-bounced emails
   */
  getHardBouncedEmails(): string[] {
    return Array.from(this.hardBouncedEmails);
  }

  /**
   * Register unsubscribe
   */
  async registerUnsubscribe(
    email: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    return this.unsubscribeEmail(email, tenantId, reason);
  }

  /**
   * Parse bounce event from email service webhook
   */
  parseBounceEvent(bounceEvent: any): BounceInfo {
    try {
      const bounceType = bounceEvent.bounceType === 'Permanent' ? BounceType.HARD : BounceType.SOFT;
      const reason = bounceEvent.bounceSubType || bounceEvent.diagnosticCode || 'Unknown bounce reason';

      return {
        email: bounceEvent.email,
        bounceType,
        reason,
      };
    } catch (error) {
      logger.error('Failed to parse bounce event', error);
      throw error;
    }
  }

  /**
   * Unsubscribe email from all marketing emails
   */
  async unsubscribeEmail(
    email: string,
    tenantId: string,
    reason?: string
  ): Promise<void> {
    try {
      logger.info(`Unsubscribing email: ${email}`);

      // Mark all future emails as unsubscribed
      const emailLog = await prisma.emailLog.findFirst({
        where: {
          tenantId,
          to: { has: email },
        },
      });

      if (emailLog) {
        await prisma.emailLog.update({
          where: { id: emailLog.id },
          data: {
            status: 'UNSUBSCRIBED',
          },
        });
      }

      // Add to hard bounce list to prevent sends
      this.hardBouncedEmails.add(email);
    } catch (error) {
      logger.error(`Failed to unsubscribe email: ${email}`, error);
    }
  }

  /**
   * Resubscribe email
   */
  async resubscribeEmail(
    email: string,
    tenantId: string
  ): Promise<void> {
    try {
      logger.info(`Resubscribing email: ${email}`);

      this.hardBouncedEmails.delete(email);
      this.softBouncedEmails.delete(email);

      logger.info(`Email resubscribed: ${email}`);
    } catch (error) {
      logger.error(`Failed to resubscribe email: ${email}`, error);
    }
  }

  /**
   * Clear bounce history for an email (use with caution)
   */
  async clearBounceHistory(email: string): Promise<void> {
    try {
      logger.info(`Clearing bounce history for: ${email}`);

      this.hardBouncedEmails.delete(email);
      this.softBouncedEmails.delete(email);

      logger.info(`Bounce history cleared: ${email}`);
    } catch (error) {
      logger.error(`Failed to clear bounce history for ${email}`, error);
    }
  }
}

export const bounceHandlingService = new BounceHandlingService();
