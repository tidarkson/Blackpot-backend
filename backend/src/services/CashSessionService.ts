import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

/**
 * CashSessionService
 * 
 * Manages shift-level cash reconciliation sessions:
 * - Opening cash sessions with staff
 * - Recording closing balances
 * - Calculating expected vs actual discrepancies
 * - Manager review and approval
 */
export class CashSessionService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Open a new cash session for a shift
   * Called when staff member starts their shift and prepares the register
   */
  async openCashSession(
    tenantId: string,
    shiftId: string,
    staffId: string,
    openingCash: Decimal | number,
    userId: string
  ): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Verify shift exists and belongs to this staff
        const shift = await tx.shift.findFirst({
          where: {
            id: shiftId,
            tenantId,
            userId: staffId,
          },
        });

        if (!shift) {
          throw new Error('Shift not found or does not belong to this staff member');
        }

        // Check if session already exists for this shift
        const existingSession = await tx.cashSession.findFirst({
          where: { shiftId, tenantId },
        });

        if (existingSession) {
          throw new Error('A cash session already exists for this shift');
        }

        // Create cash session
        const cashSession = await tx.cashSession.create({
          data: {
            tenantId,
            shiftId,
            staffId,
            openingCash: new Decimal(openingCash),
            status: 'OPEN',
            openedAt: new Date(),
          },
          include: {
            shift: true,
            staff: true,
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            tenantId,
            userId,
            action: 'CASH_SESSION_OPENED',
            entity: 'CashSession',
            entityId: cashSession.id,
            metadata: {
              staffName: cashSession.staff.name,
              openingCash: openingCash.toString(),
              shiftId,
            },
          },
        });

        logger.info(
          `💰 Cash session opened: ${cashSession.staff.name}, Opening: ₦${openingCash}, Session: ${cashSession.id}`
        );

        return {
          id: cashSession.id,
          shiftId: cashSession.shiftId,
          staffId: cashSession.staffId,
          staffName: cashSession.staff.name,
          openingCash: cashSession.openingCash,
          status: cashSession.status,
          openedAt: cashSession.openedAt,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error opening cash session:', error.message);
      throw error;
    }
  }

  /**
   * Close a cash session and record physical cash count
   * Calculates expected cash from orders and compares to actual count
   * Supports card payment tracking and denomination breakdown
   * Flags discrepancies > ₦1000 OR > 5%
   */
  async closeCashSession(
    cashSessionId: string,
    tenantId: string,
    closingCash: Decimal | number,
    userId: string,
    actualCard?: Decimal | number,
    cashDenominations?: Record<string, number>
  ): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Get cash session
        const cashSession = await tx.cashSession.findFirst({
          where: { id: cashSessionId, tenantId },
          include: {
            shift: {
              include: {
                user: true,
              },
            },
            staff: true,
          },
        });

        if (!cashSession) {
          throw new Error('Cash session not found');
        }

        if (cashSession.status === 'CLOSED' || cashSession.status === 'APPROVED') {
          throw new Error('Cash session is already closed or approved');
        }

        // Get all orders for this shift
        const shiftStart = cashSession.shift.scheduledStart;
        const shiftEnd = new Date(); // Current time for when we're closing

        const orders = await tx.order.findMany({
          where: {
            tenantId,
            serverId: cashSession.staffId,
            closedAt: {
              gte: shiftStart,
              lte: shiftEnd,
            },
            status: 'CLOSED',
          },
          include: {
            payments: true,
            tips: true,
          },
        });

        // Calculate expected cash from orders (cash payments + cash tips)
        const expectedCash = orders.reduce((sum, order) => {
          const cashPayments = order.payments
            .filter((p) => p.method === 'CASH')
            .reduce((s, p) => s.plus(p.amount), new Decimal(0));

          const cashTips = order.tips
            .filter((t) => t.method === 'CASH')
            .reduce((s, t) => s.plus(t.amount), new Decimal(0));

          return sum.plus(cashPayments).plus(cashTips);
        }, new Decimal(0));

        // Calculate cash discrepancy
        const closingCashDecimal = new Decimal(closingCash);
        const discrepancy = closingCashDecimal.minus(expectedCash);

        // Determine if cash discrepancy should trigger flagging
        // Flag if: |discrepancy| > ₦1000 OR |discrepancy|/expected > 5%
        const absDiscrepancy = discrepancy.abs();
        const flagThresholdNaira = new Decimal(1000);
        const percentThreshold = new Decimal(0.05); // 5%

        const exceedsAbsoluteThreshold = absDiscrepancy.gt(flagThresholdNaira);
        const exceedsPercentThreshold =
          expectedCash.gt(0) && absDiscrepancy.div(expectedCash).gt(percentThreshold);

        const shouldFlag = exceedsAbsoluteThreshold || exceedsPercentThreshold;

        // Handle card tracking if provided
        let actualCardDecimal = null;
        let cardDiscrepancy = null;
        if (actualCard !== undefined) {
          actualCardDecimal = new Decimal(actualCard);
          // Card discrepancy would be calculated if expected card is available
          // For now, just storing the actual card amount
        }

        const status = shouldFlag ? 'FLAGGED' : 'CLOSED';

        // Update cash session
        const updateData: any = {
          closingCash: closingCashDecimal,
          expectedCash,
          discrepancy,
          status,
          closedAt: new Date(),
        };

        if (actualCardDecimal) {
          updateData.actualCard = actualCardDecimal;
        }

        if (cashDenominations) {
          updateData.cashDenominations = cashDenominations;
        }

        const updatedSession = await tx.cashSession.update({
          where: { id: cashSessionId },
          data: updateData,
          include: {
            shift: true,
            staff: true,
          },
        });

        // Create activity log
        await tx.activityLog.create({
          data: {
            tenantId,
            userId,
            action: 'CASH_SESSION_CLOSED',
            entity: 'CashSession',
            entityId: cashSessionId,
            metadata: {
              staffName: cashSession.staff.name,
              openingCash: cashSession.openingCash.toString(),
              closingCash: closingCash.toString(),
              expectedCash: expectedCash.toString(),
              discrepancy: discrepancy.toString(),
              actualCard: actualCard?.toString() || null,
              cashDenominations: cashDenominations || null,
              status,
              flagged: shouldFlag,
              exceedsAbsoluteThreshold,
              exceedsPercentThreshold,
            },
          },
        });

        logger.info(
          `🏁 Cash session closed: ${cashSession.staff.name}, Status: ${status}, Discrepancy: ₦${discrepancy}${
            actualCard ? `, Card: ₦${actualCard}` : ''
          }`
        );

        return {
          id: updatedSession.id,
          shiftId: updatedSession.shiftId,
          staffId: updatedSession.staffId,
          staffName: updatedSession.staff.name,
          openingCash: updatedSession.openingCash,
          closingCash: updatedSession.closingCash,
          expectedCash: updatedSession.expectedCash,
          discrepancy: updatedSession.discrepancy,
          actualCard: updatedSession.actualCard,
          cashDenominations: updatedSession.cashDenominations,
          status: updatedSession.status,
          isFlagged: shouldFlag,
          thresholdExceeded: {
            absolute: exceedsAbsoluteThreshold,
            percentage: exceedsPercentThreshold,
          },
          closedAt: updatedSession.closedAt,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error closing cash session:', error.message);
      throw error;
    }
  }

  /**
   * Get cash session details
   */
  async getCashSession(cashSessionId: string, tenantId: string): Promise<any> {
    try {
      const cashSession = await this.prisma.cashSession.findFirst({
        where: { id: cashSessionId, tenantId },
        include: {
          shift: {
            include: {
              user: true,
            },
          },
          staff: true,
          reviewer: true,
        },
      });

      if (!cashSession) {
        throw new Error('Cash session not found');
      }

      return {
        id: cashSession.id,
        shiftId: cashSession.shiftId,
        staffId: cashSession.staffId,
        staffName: cashSession.staff.name,
        openingCash: cashSession.openingCash,
        closingCash: cashSession.closingCash,
        expectedCash: cashSession.expectedCash,
        discrepancy: cashSession.discrepancy,
        actualCard: cashSession.actualCard,
        cardDiscrepancy: cashSession.cardDiscrepancy,
        cashDenominations: cashSession.cashDenominations,
        status: cashSession.status,
        openedAt: cashSession.openedAt,
        closedAt: cashSession.closedAt,
        reviewedBy: cashSession.reviewer?.name || null,
        reviewedAt: cashSession.reviewedAt,
        managerNotes: cashSession.managerNotes,
      };
    } catch (error: any) {
      logger.error('Error getting cash session:', error.message);
      throw error;
    }
  }

  /**
   * Get all cash sessions for a date range
   */
  async getCashSessionsByDateRange(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    try {
      const startOfDay = new Date(startDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);

      const sessions = await this.prisma.cashSession.findMany({
        where: {
          tenantId,
          openedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          staff: true,
          reviewer: true,
        },
        orderBy: { openedAt: 'desc' },
      });

      return sessions.map((s) => ({
        id: s.id,
        staffName: s.staff.name,
        openingCash: s.openingCash,
        closingCash: s.closingCash,
        expectedCash: s.expectedCash,
        discrepancy: s.discrepancy,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        reviewedBy: s.reviewer?.name || null,
      }));
    } catch (error: any) {
      logger.error('Error getting cash sessions by date range:', error.message);
      throw error;
    }
  }

  /**
   * Add manager review/comments to a flagged cash session
   */
  async reviewCashSession(
    cashSessionId: string,
    tenantId: string,
    managerId: string,
    managerNotes: string,
    approved: boolean
  ): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const cashSession = await tx.cashSession.findFirst({
          where: { id: cashSessionId, tenantId },
          include: {
            staff: true,
            shift: true,
          },
        });

        if (!cashSession) {
          throw new Error('Cash session not found');
        }

        // Update session with review
        const updatedSession = await tx.cashSession.update({
          where: { id: cashSessionId },
          data: {
            reviewedBy: managerId,
            reviewedAt: new Date(),
            managerNotes,
            status: approved ? 'APPROVED' : 'FLAGGED',
          },
          include: {
            staff: true,
            reviewer: true,
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: managerId,
            action: 'CASH_SESSION_REVIEWED',
            entity: 'CashSession',
            entityId: cashSessionId,
            metadata: {
              staffName: cashSession.staff.name,
              status: updatedSession.status,
              notes: managerNotes,
              approved,
            },
          },
        });

        logger.info(
          `👁️ Cash session reviewed: ${cashSession.staff.name}, Status: ${updatedSession.status}`
        );

        return {
          id: updatedSession.id,
          staffName: updatedSession.staff.name,
          status: updatedSession.status,
          discrepancy: updatedSession.discrepancy,
          reviewedBy: updatedSession.reviewer?.name,
          reviewedAt: updatedSession.reviewedAt,
          managerNotes: updatedSession.managerNotes,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error reviewing cash session:', error.message);
      throw error;
    }
  }

  /**
   * Get flagged cash sessions requiring manager review
   */
  async getFlaggedCashSessions(tenantId: string): Promise<any[]> {
    try {
      const sessions = await this.prisma.cashSession.findMany({
        where: {
          tenantId,
          status: 'FLAGGED',
        },
        include: {
          staff: true,
          shift: true,
        },
        orderBy: { closedAt: 'asc' },
      });

      return sessions.map((s) => ({
        id: s.id,
        staffName: s.staff.name,
        openingCash: s.openingCash,
        closingCash: s.closingCash,
        expectedCash: s.expectedCash,
        discrepancy: s.discrepancy,
        percentageVariance: s.expectedCash && s.discrepancy
          ? s.discrepancy
              .div(s.expectedCash)
              .times(100)
              .toDecimalPlaces(2)
              .toString()
          : '0',
        closedAt: s.closedAt,
        flaggedSince: s.closedAt,
      }));
    } catch (error: any) {
      logger.error('Error getting flagged cash sessions:', error.message);
      throw error;
    }
  }

  /**
   * Get discrepancy report for date range
   * Used for financial analysis and staff performance tracking
   */
  async getDiscrepancyReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any> {
    try {
      const sessions = await this.prisma.cashSession.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startDate,
            lte: endDate,
          },
          status: 'FLAGGED',
        },
        include: {
          staff: true,
          shift: true,
          reviewer: true,
        },
        orderBy: { closedAt: 'desc' },
      });

      const totalDiscrepancy = sessions.reduce(
        (sum, s) => sum.plus(s.discrepancy || 0),
        new Decimal(0)
      );

      const discrepancyByType = {
        shortage: sessions
          .filter((s) => s.discrepancy && s.discrepancy.lt(0))
          .reduce((sum, s) => sum.plus(s.discrepancy!.abs()), new Decimal(0)),
        overage: sessions
          .filter((s) => s.discrepancy && s.discrepancy.gt(0))
          .reduce((sum, s) => sum.plus(s.discrepancy!), new Decimal(0)),
      };

      return {
        period: {
          startDate,
          endDate,
        },
        summary: {
          totalFlaggedSessions: sessions.length,
          totalDiscrepancy: totalDiscrepancy.toString(),
          shortage: discrepancyByType.shortage.toString(),
          overage: discrepancyByType.overage.toString(),
          averageDiscrepancy: sessions.length
            ? totalDiscrepancy
                .div(sessions.length)
                .toDecimalPlaces(2)
                .toString()
            : '0',
        },
        sessions: sessions.map((s) => ({
          id: s.id,
          date: s.closedAt,
          shiftType: s.shift.shiftType || 'unknown',
          staffName: s.staff.name,
          staffId: s.staffId,
          openingCash: s.openingCash.toString(),
          closingCash: s.closingCash?.toString() || null,
          expectedCash: s.expectedCash?.toString() || null,
          discrepancy: s.discrepancy?.toString() || null,
          discrepancyPercentage: s.expectedCash && s.discrepancy
            ? s.discrepancy
                .div(s.expectedCash)
                .times(100)
                .toDecimalPlaces(2)
                .toString()
            : null,
          actualCard: s.actualCard?.toString() || null,
          cashDenominations: s.cashDenominations,
          status: s.status,
          managerReviewed: !!s.reviewedAt,
          reviewedBy: s.reviewer?.name || null,
          reviewedAt: s.reviewedAt,
          managerNotes: s.managerNotes,
        })),
      };
    } catch (error: any) {
      logger.error('Error generating discrepancy report:', error.message);
      throw error;
    }
  }
}

export const cashSessionService = new CashSessionService();
