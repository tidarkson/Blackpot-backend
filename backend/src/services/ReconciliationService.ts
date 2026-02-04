import { PrismaClient, PaymentStatus, OrderStatus, PaymentMethod, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class ReconciliationService {
  /**
   * Daily reconciliation - comprehensive check of all orders and payments
   *
   * Flow:
   * 1. Get all orders from previous day
   * 2. Get all payments for those orders
   * 3. Compare totals for each order
   * 4. Identify discrepancies
   * 5. Create reconciliation log entry
   *
   * Returns: Summary with count of matched, over, under, missing
   */
  async dailyReconciliation(tenantId: string, reconciliationDate: Date): Promise<any> {
    try {
      const startOfDay = new Date(reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all closed orders from the day
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
          status: OrderStatus.CLOSED,
        },
        include: {
          payments: true,
          tips: true,
        },
      });

      // Calculate reconciliation for each order
      const reconciliationDetails = await Promise.all(
        orders.map(async (order) => {
          const totalPayments = order.payments.reduce(
            (sum, p) => sum.plus(p.amount),
            new Decimal(0)
          );

          const totalTips = order.tips.reduce((sum, t) => sum.plus(t.amount), new Decimal(0));

          const discrepancy = totalPayments.minus(order.total);

          return {
            orderId: order.id,
            orderTotal: order.total,
            amountPaid: totalPayments,
            tipsAmount: totalTips,
            discrepancy: discrepancy,
            status: this.getDiscrepancyStatus(discrepancy),
            closedAt: order.closedAt,
          };
        })
      );

      // Summarize reconciliation
      const matched = reconciliationDetails.filter((d) => d.discrepancy.equals(new Decimal(0)));
      const overpaid = reconciliationDetails.filter((d) => d.discrepancy.gt(new Decimal(0)));
      const underpaid = reconciliationDetails.filter((d) => d.discrepancy.lt(new Decimal(0)));

      const summary = {
        reconciliationDate,
        totalOrders: orders.length,
        matchedOrders: matched.length,
        overpaidOrders: overpaid.length,
        underpaidOrders: underpaid.length,
        totalExpected: orders.reduce((sum, o) => sum.plus(o.total), new Decimal(0)),
        totalReceived: orders.reduce(
          (sum, o) => sum.plus(o.payments.reduce((s, p) => s.plus(p.amount), new Decimal(0))),
          new Decimal(0)
        ),
        totalDiscrepancy: reconciliationDetails.reduce(
          (sum, d) => sum.plus(d.discrepancy.abs()),
          new Decimal(0)
        ),
        details: reconciliationDetails,
      };

      // Create reconciliation log entry
      await this.createReconciliationLog(tenantId, summary);

      logger.info(`📊 Daily reconciliation complete: ${matched.length}/${orders.length} matched`);

      return summary;
    } catch (error: any) {
      logger.error('Error in daily reconciliation:', error.message);
      throw error;
    }
  }

  /**
   * Verify payments match order total
   */
  async verifyPaymentMatches(orderId: string, tenantId: string): Promise<any> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          payments: true,
          tips: true,
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const totalPayments = order.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));

      const discrepancy = totalPayments.minus(order.total);

      return {
        orderId,
        orderTotal: order.total,
        amountPaid: totalPayments,
        discrepancy,
        isMatched: discrepancy.equals(new Decimal(0)),
        status: this.getDiscrepancyStatus(discrepancy),
      };
    } catch (error: any) {
      logger.error('Error verifying payment matches:', error.message);
      throw error;
    }
  }

  /**
   * Identify all discrepancies for a date range
   */
  async identifyDiscrepancies(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          payments: true,
        },
      });

      const discrepancies = await Promise.all(
        orders
          .map(async (order) => {
            const totalPayments = order.payments.reduce(
              (sum, p) => sum.plus(p.amount),
              new Decimal(0)
            );
            const discrepancy = totalPayments.minus(order.total);

            // Only return orders with discrepancies
            if (!discrepancy.equals(new Decimal(0))) {
              return {
                orderId: order.id,
                orderTotal: order.total,
                amountPaid: totalPayments,
                discrepancy,
                type: discrepancy.gt(new Decimal(0)) ? 'OVERPAYMENT' : 'UNDERPAYMENT',
                closedAt: order.closedAt,
              };
            }
            return null;
          })
          .filter(Boolean)
      );

      logger.info(`⚠️ Found ${discrepancies.length} discrepancies`);

      return discrepancies;
    } catch (error: any) {
      logger.error('Error identifying discrepancies:', error.message);
      throw error;
    }
  }

  /**
   * Generate comprehensive reconciliation report
   */
  async generateReconciliationReport(tenantId: string, reconciliationDate: Date): Promise<any> {
    try {
      const startOfDay = new Date(reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: { gte: startOfDay, lte: endOfDay },
          status: OrderStatus.CLOSED,
        },
        include: {
          payments: true,
          tips: true,
          server: true,
        },
      });

      // Group by payment method
      const paymentMethodBreakdown: Record<string, Decimal> = {};
      orders.forEach((order) => {
        order.payments.forEach((payment) => {
          if (!paymentMethodBreakdown[payment.method]) {
            paymentMethodBreakdown[payment.method] = new Decimal(0);
          }
          paymentMethodBreakdown[payment.method] = paymentMethodBreakdown[payment.method].plus(
            payment.amount
          );
        });
      });

      // Server performance
      const serverPerformance: Record<string, any> = {};
      orders.forEach((order) => {
        if (!serverPerformance[order.serverId]) {
          serverPerformance[order.serverId] = {
            serverId: order.serverId,
            serverName: order.server?.name || 'Unknown',
            orderCount: 0,
            totalRevenue: new Decimal(0),
            totalTips: new Decimal(0),
            averageCheck: new Decimal(0),
          };
        }
        serverPerformance[order.serverId].orderCount += 1;
        serverPerformance[order.serverId].totalRevenue = serverPerformance[
          order.serverId
        ].totalRevenue.plus(order.total);
        order.tips.forEach((tip) => {
          serverPerformance[order.serverId].totalTips = serverPerformance[
            order.serverId
          ].totalTips.plus(tip.amount);
        });
      });

      // Calculate averages
      Object.values(serverPerformance).forEach((perf: any) => {
        perf.averageCheck =
          perf.orderCount > 0 ? perf.totalRevenue.div(perf.orderCount) : new Decimal(0);
      });

      const totalRevenue = orders.reduce((sum, o) => sum.plus(o.total), new Decimal(0));

      const totalPayments = orders.reduce(
        (sum, o) => sum.plus(o.payments.reduce((s, p) => s.plus(p.amount), new Decimal(0))),
        new Decimal(0)
      );

      const totalTips = orders.reduce(
        (sum, o) => sum.plus(o.tips.reduce((s, t) => s.plus(t.amount), new Decimal(0))),
        new Decimal(0)
      );

      return {
        reportDate: reconciliationDate,
        summary: {
          totalOrders: orders.length,
          totalRevenue,
          totalPayments,
          totalTips,
          grossRevenue: totalRevenue.plus(totalTips),
        },
        paymentMethodBreakdown,
        serverPerformance: Object.values(serverPerformance),
      };
    } catch (error: any) {
      logger.error('Error generating reconciliation report:', error.message);
      throw error;
    }
  }

  /**
   * Reconcile payments (mark as reconciled)
   */
  async reconcilePayments(orderId: string, tenantId: string, approvedBy: string): Promise<any> {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Update all payments for order to reconciled
        const payments = await tx.payment.updateMany({
          where: { orderId, tenantId },
          data: {
            processedAt: new Date(),
          },
        });

        // Create audit log
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: approvedBy,
            action: 'RECONCILE_PAYMENTS',
            entity: 'Payment',
            entityId: orderId,
            metadata: {
              paymentsReconciled: payments.count,
              timestamp: new Date(),
            },
          },
        });

        logger.info(`✅ Payments reconciled for order ${orderId} by ${approvedBy}`);

        return payments;
      });

      return result;
    } catch (error: any) {
      logger.error('Error reconciling payments:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Determine discrepancy status
   */
  private getDiscrepancyStatus(discrepancy: Decimal): 'MATCHED' | 'OVERPAID' | 'UNDERPAID' {
    if (discrepancy.equals(new Decimal(0))) return 'MATCHED';
    if (discrepancy.gt(new Decimal(0))) return 'OVERPAID';
    return 'UNDERPAID';
  }

  /**
   * Create immutable reconciliation log entry
   */
  private async createReconciliationLog(tenantId: string, summary: any): Promise<void> {
    await prisma.activityLog.create({
      data: {
        tenantId,
        action: 'DAILY_RECONCILIATION',
        entity: 'Reconciliation',
        metadata: {
          reconciliationDate: summary.reconciliationDate,
          totalOrders: summary.totalOrders,
          matchedOrders: summary.matchedOrders,
          totalDiscrepancy: summary.totalDiscrepancy.toString(),
        },
      },
    });
  }
}
