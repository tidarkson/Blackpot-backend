import { PrismaClient, PaymentStatus, OrderStatus, PaymentMethod, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class ShiftService {
  /**
   * Start a shift for a server
   */
  async startShift(
    userId: string,
    tenantId: string,
    role: string
  ): Promise<any> {
    try {
      const shift = await prisma.shift.create({
        data: {
          userId,
          tenantId,
          roleAssigned: role,
          scheduledDate: new Date(),
          scheduledStart: new Date(),
          scheduledEnd: new Date(),
          clockInTime: new Date(),
        },
      });

      logger.info(`🕐 Shift started for ${userId}`);

      return shift;
    } catch (error: any) {
      logger.error('Error starting shift:', error.message);
      throw error;
    }
  }

  /**
   * End shift and perform end-of-day operations
   */
  async endShift(userId: string, tenantId: string): Promise<any> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Get current shift
        const shift = await tx.shift.findFirst({
          where: {
            userId,
            tenantId,
            clockOutTime: null,
          },
          orderBy: { scheduledStart: 'desc' },
        });

        if (!shift) {
          throw new Error('No active shift found');
        }

        // End the shift
        const endedShift = await tx.shift.update({
          where: { id: shift.id },
          data: {
            clockOutTime: new Date(),
          },
        });

        // Calculate shift revenue
        const shiftRevenue = await this.calculateShiftRevenue(
          tx,
          userId,
          shift.scheduledStart,
          new Date(),
          tenantId
        );

        // Calculate server settlement
        const settlement = await this.settleServerPayments(
          tx,
          userId,
          tenantId
        );

        logger.info(
          `🕑 Shift ended for ${userId}. Revenue: ${shiftRevenue}`
        );

        return {
          shift: endedShift,
          revenue: shiftRevenue,
          settlement,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error ending shift:', error.message);
      throw error;
    }
  }

  /**
   * Calculate daily revenue
   */
  async calculateDailyRevenue(tenantId: string, date: Date): Promise<Decimal> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
        },
      });

      const revenue = orders.reduce((sum: Decimal, order: any) => {
        const orderPayments = order.payments.reduce(
          (s: Decimal, p: any) => s.plus(p.amount),
          new Decimal(0)
        );
        return sum.plus(orderPayments);
      }, new Decimal(0));

      logger.info(`💰 Daily revenue calculated: ${revenue}`);

      return revenue;
    } catch (error: any) {
      logger.error('Error calculating daily revenue:', error.message);
      throw error;
    }
  }

  /**
   * Close all open orders (used at end of business day)
   */
  async closeOpenOrders(tenantId: string): Promise<number> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const openOrders = await tx.order.findMany({
          where: {
            tenantId,
            status: { not: OrderStatus.CLOSED },
          },
        });

        const closedCount = await tx.order.updateMany({
          where: {
            tenantId,
            status: { not: OrderStatus.CLOSED },
          },
          data: {
            status: OrderStatus.CLOSED,
            closedAt: new Date(),
          },
        });

        logger.info(`✅ Closed ${closedCount.count} open orders`);

        return closedCount.count;
      });

      return result;
    } catch (error: any) {
      logger.error('Error closing open orders:', error.message);
      throw error;
    }
  }

  /**
   * Generate daily report
   */
  async generateDailyReport(tenantId: string, date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        include: {
          payments: true,
          tips: true,
        },
      });

      const totalRevenue = orders.reduce(
        (sum: Decimal, o: any) => sum.plus(o.total),
        new Decimal(0)
      );

      const totalTips = orders.reduce(
        (sum: Decimal, o: any) =>
          sum.plus(
            o.tips.reduce((s: Decimal, t: any) => s.plus(t.amount), new Decimal(0))
          ),
        new Decimal(0)
      );

      return {
        reportDate: date,
        totalOrders: orders.length,
        totalRevenue,
        totalTips,
        grossRevenue: totalRevenue.plus(totalTips),
        averageCheck: orders.length > 0 ? totalRevenue.div(orders.length) : new Decimal(0),
      };
    } catch (error: any) {
      logger.error('Error generating daily report:', error.message);
      throw error;
    }
  }

  /**
   * Lockdown previous day (prevent modifications)
   */
  async lockdownDay(tenantId: string, date: Date): Promise<void> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Create audit trail entry
      await prisma.activityLog.create({
        data: {
          tenantId,
          action: 'LOCKDOWN_DAY',
          entity: 'Order',
          metadata: {
            lockedDate: date,
            timestamp: new Date(),
            action: 'PREVENT_MODIFICATIONS',
          },
        },
      });

      logger.info(`🔒 Business day locked: ${date.toDateString()}`);
    } catch (error: any) {
      logger.error('Error locking down day:', error.message);
      throw error;
    }
  }

  /**
   * Calculate server settlement (tips + payments)
   */
  private async settleServerPayments(
    tx: any,
    userId: string,
    tenantId: string
  ): Promise<any> {
    try {
      // Get server's orders from last shift
      const shift = await tx.shift.findFirst({
        where: { userId, tenantId },
        orderBy: { scheduledStart: 'desc' },
      });

      if (!shift) {
        return { userId, tips: new Decimal(0), settlement: new Decimal(0) };
      }

      const serverOrders = await tx.order.findMany({
        where: {
          serverId: userId,
          tenantId,
          closedAt: {
            gte: shift.scheduledStart,
            lte: shift.scheduledEnd || new Date(),
          },
        },
        include: {
          tips: true,
        },
      });

      const totalTips = serverOrders.reduce(
        (sum: Decimal, order: any) =>
          sum.plus(
            order.tips.reduce((s: Decimal, t: any) => s.plus(t.amount), new Decimal(0))
          ),
        new Decimal(0)
      );

      return {
        userId,
        ordersServed: serverOrders.length,
        totalTips,
        settlement: totalTips, // In this system, server gets tips
      };
    } catch (error: any) {
      logger.error('Error calculating server settlement:', error.message);
      throw error;
    }
  }

  /**
   * Calculate shift revenue for a server
   */
  private async calculateShiftRevenue(
    tx: any,
    userId: string,
    startTime: Date,
    endTime: Date,
    tenantId: string
  ): Promise<Decimal> {
    const orders = await tx.order.findMany({
      where: {
        serverId: userId,
        tenantId,
        closedAt: {
          gte: startTime,
          lte: endTime,
        },
      },
      include: {
        payments: true,
      },
    });

    return orders.reduce((sum: Decimal, order: any) => {
      const orderRevenue = order.payments.reduce(
        (s: Decimal, p: any) => s.plus(p.amount),
        new Decimal(0)
      );
      return sum.plus(orderRevenue);
    }, new Decimal(0));
  }
}
