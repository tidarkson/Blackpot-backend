import { PrismaClient, PaymentStatus, OrderStatus, PaymentMethod, TipMethod, ReconciliationStatus, DiscrepancyType, DiscrepancySeverity, DiscrepancyStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

export class ReconciliationService {
  private prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || new PrismaClient();
  }

  /**
   * Start a new reconciliation session
   * Locks orders from being modified for the business day
   */
  async startReconciliation(tenantId: string, businessDayId: string, reconciliationDate: Date, userId: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Get all orders from the day
        const startOfDay = new Date(reconciliationDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(reconciliationDate);
        endOfDay.setHours(23, 59, 59, 999);

        const orders = await tx.order.findMany({
          where: {
            tenantId,
            closedAt: { gte: startOfDay, lte: endOfDay },
            status: OrderStatus.CLOSED,
          },
          include: {
            payments: true,
            tips: true,
          },
        });

        // Calculate expected cash
        const expectedCash = orders.reduce(
          (sum, o) => {
            const cashPayments = o.payments.filter(p => p.method === PaymentMethod.CASH);
            const cashAmount = cashPayments.reduce((s, p) => s.plus(p.amount), new Decimal(0));
            const cashTips = o.tips.filter(t => t.method === TipMethod.CASH).reduce((s, t) => s.plus(t.amount), new Decimal(0));
            return sum.plus(cashAmount).plus(cashTips);
          },
          new Decimal(0)
        );

        const cardExpected = orders.reduce(
          (sum, o) => {
            const cardPayments = o.payments.filter(p => p.method === PaymentMethod.CARD);
            return sum.plus(cardPayments.reduce((s, p) => s.plus(p.amount), new Decimal(0)));
          },
          new Decimal(0)
        );

        // Create reconciliation record
        const reconciliation = await tx.reconciliation.create({
          data: {
            tenantId,
            businessDayId,
            reconciliationDate,
            status: ReconciliationStatus.PENDING,
            expectedCash,
            cardExpected,
            isLocked: true,
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            tenantId,
            userId,
            action: 'START_RECONCILIATION',
            entity: 'Reconciliation',
            entityId: reconciliation.id,
            metadata: {
              ordersCount: orders.length,
              expectedCash: expectedCash.toString(),
              expectedCard: cardExpected.toString(),
            },
          },
        });

        logger.info(`🔒 Reconciliation started for tenant ${tenantId}, ${orders.length} orders locked`);

        return {
          reconciliationId: reconciliation.id,
          isLocked: true,
          ordersCount: orders.length,
          expectedCash,
          cardExpected,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error starting reconciliation:', error.message);
      throw error;
    }
  }

  /**
   * Record physical cash count
   */
  async recordCashCount(reconciliationId: string, tenantId: string, denominationBreakdown: Array<{ denomination: Decimal, quantity: number }>, recordedBy: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reconciliation = await tx.reconciliation.findFirst({
          where: { id: reconciliationId, tenantId },
        });

        if (!reconciliation) {
          throw new Error('Reconciliation not found');
        }

        // Record each denomination
        const cashCounts = await Promise.all(
          denominationBreakdown.map(item =>
            tx.cashCount.create({
              data: {
                tenantId,
                reconciliationId,
                denomination: item.denomination,
                quantity: item.quantity,
                totalAmount: item.denomination.times(item.quantity),
                recordedBy,
              },
            })
          )
        );

        // Calculate total actual cash
        const actualCash = cashCounts.reduce((sum, cc) => sum.plus(cc.totalAmount), new Decimal(0));

        // Calculate discrepancy
        const cashDiscrepancy = actualCash.minus(reconciliation.expectedCash);

        // Update reconciliation
        const updated = await tx.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            actualCash,
            cashDiscrepancy: cashDiscrepancy.abs(),
            status: cashDiscrepancy.equals(new Decimal(0)) ? ReconciliationStatus.IN_PROGRESS : ReconciliationStatus.IN_PROGRESS,
          },
        });

        // Flag discrepancies if they exist
        if (!cashDiscrepancy.equals(new Decimal(0))) {
          const severity = cashDiscrepancy.abs().gte(reconciliation.expectedCash.times(new Decimal(0.05)))
            ? DiscrepancySeverity.HIGH
            : cashDiscrepancy.abs().gte(reconciliation.expectedCash.times(new Decimal(0.02)))
            ? DiscrepancySeverity.MEDIUM
            : DiscrepancySeverity.LOW;

          await tx.discrepancy.create({
            data: {
              tenantId,
              reconciliationId,
              type: cashDiscrepancy.lt(new Decimal(0)) ? DiscrepancyType.CASH_SHORTAGE : DiscrepancyType.CASH_OVERAGE,
              amount: cashDiscrepancy.abs(),
              severity,
              status: DiscrepancyStatus.OPEN,
            },
          });
        }

        logger.info(`💰 Cash count recorded: Expected ${reconciliation.expectedCash}, Actual ${actualCash}`);

        return {
          reconciliationId,
          actualCash,
          expectedCash: reconciliation.expectedCash,
          discrepancy: cashDiscrepancy,
          hasDiscrepancy: !cashDiscrepancy.equals(new Decimal(0)),
          totalDenominations: cashCounts.length,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error recording cash count:', error.message);
      throw error;
    }
  }

  /**
   * Record card settlement
   */
  async recordCardSettlement(reconciliationId: string, tenantId: string, settlementData: { transactionCount: number, settlementAmount: Decimal, processorFees: Decimal, cardBrand?: string, settlementDate: Date }, verifiedBy: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reconciliation = await tx.reconciliation.findFirst({
          where: { id: reconciliationId, tenantId },
        });

        if (!reconciliation) {
          throw new Error('Reconciliation not found');
        }

        // Create card settlement record
        const settlement = await tx.cardSettlement.create({
          data: {
            tenantId,
            reconciliationId,
            transactionCount: settlementData.transactionCount,
            settlementAmount: settlementData.settlementAmount,
            processorFees: settlementData.processorFees,
            netAmount: settlementData.settlementAmount.minus(settlementData.processorFees),
            settlementDate: settlementData.settlementDate,
            cardBrand: settlementData.cardBrand,
            status: 'VERIFIED',
            verifiedBy,
            verifiedAt: new Date(),
          },
        });

        // Calculate discrepancy
        const cardActual = settlement.netAmount;
        const cardDiscrepancy = cardActual.minus(reconciliation.cardExpected);

        // Update reconciliation
        await tx.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            cardActual,
            cardDiscrepancy: cardDiscrepancy.abs(),
          },
        });

        // Flag discrepancies if they exist
        if (!cardDiscrepancy.equals(new Decimal(0))) {
          const severity = cardDiscrepancy.abs().gte(reconciliation.cardExpected.times(new Decimal(0.05)))
            ? DiscrepancySeverity.HIGH
            : cardDiscrepancy.abs().gte(reconciliation.cardExpected.times(new Decimal(0.02)))
            ? DiscrepancySeverity.MEDIUM
            : DiscrepancySeverity.LOW;

          await tx.discrepancy.create({
            data: {
              tenantId,
              reconciliationId,
              type: DiscrepancyType.UNMATCHED_TRANSACTION,
              amount: cardDiscrepancy.abs(),
              severity,
              status: DiscrepancyStatus.OPEN,
              reason: `Card settlement amount mismatch. Expected: ${reconciliation.cardExpected}, Actual: ${cardActual}`,
            },
          });
        }

        logger.info(`💳 Card settlement recorded for ${settlement.transactionCount} transactions: ${cardActual}`);

        return {
          settlementId: settlement.id,
          transactionCount: settlement.transactionCount,
          netAmount: settlement.netAmount,
          expectedAmount: reconciliation.cardExpected,
          discrepancy: cardDiscrepancy,
          hasDiscrepancy: !cardDiscrepancy.equals(new Decimal(0)),
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error recording card settlement:', error.message);
      throw error;
    }
  }

  /**
   * Detect all discrepancies in reconciliation
   */
  async detectDiscrepancies(reconciliationId: string, tenantId: string): Promise<any> {
    try {
      const reconciliation = await this.prisma.reconciliation.findFirst({
        where: { id: reconciliationId, tenantId },
        include: {
          discrepancies: true,
        },
      });

      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      // Get all orders for the reconciliation date
      const startOfDay = new Date(reconciliation.reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(reconciliation.reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await this.prisma.order.findMany({
        where: {
          tenantId,
          closedAt: { gte: startOfDay, lte: endOfDay },
          status: OrderStatus.CLOSED,
        },
        include: {
          payments: true,
        },
      });

      // Find unmatched transactions
      const unmatchedTransactions = orders
        .map(order => {
          const totalPayments = order.payments.reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
          const discrepancy = totalPayments.minus(order.total);
          if (!discrepancy.equals(new Decimal(0))) {
            return {
              orderId: order.id,
              type: DiscrepancyType.UNMATCHED_TRANSACTION,
              discrepancy,
            };
          }
          return null;
        })
        .filter(Boolean);

      const summary = {
        reconciliationId,
        totalDiscrepancies: reconciliation.discrepancies.length + unmatchedTransactions.length,
        byType: {
          cashShortages: reconciliation.discrepancies.filter(d => d.type === DiscrepancyType.CASH_SHORTAGE).length,
          cashOverages: reconciliation.discrepancies.filter(d => d.type === DiscrepancyType.CASH_OVERAGE).length,
          unmatchedTransactions: unmatchedTransactions.length,
          reversedTransactions: reconciliation.discrepancies.filter(d => d.type === DiscrepancyType.REVERSED_TRANSACTION).length,
        },
        bySeverity: {
          low: reconciliation.discrepancies.filter(d => d.severity === DiscrepancySeverity.LOW).length,
          medium: reconciliation.discrepancies.filter(d => d.severity === DiscrepancySeverity.MEDIUM).length,
          high: reconciliation.discrepancies.filter(d => d.severity === DiscrepancySeverity.HIGH).length,
        },
        discrepancies: reconciliation.discrepancies,
        suggestions: this.generateSuggestions(reconciliation.discrepancies),
      };

      logger.info(`⚠️ Detected ${summary.totalDiscrepancies} discrepancies`);

      return summary;
    } catch (error: any) {
      logger.error('Error detecting discrepancies:', error.message);
      throw error;
    }
  }

  /**
   * Complete reconciliation - approve and close
   */
  async completeReconciliation(reconciliationId: string, tenantId: string, approvedBy: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const reconciliation = await tx.reconciliation.findFirst({
          where: { id: reconciliationId, tenantId },
        });

        if (!reconciliation) {
          throw new Error('Reconciliation not found');
        }

        if (!reconciliation.isLocked) {
          throw new Error('Reconciliation is not locked');
        }

        // Mark as completed
        const completed = await tx.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: ReconciliationStatus.COMPLETED,
            approvedBy,
            approvedAt: new Date(),
            closedAt: new Date(),
            isLocked: false,
          },
        });

        // Mark business day as closed
        await tx.businessDay.update({
          where: { id: reconciliation.businessDayId },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
          },
        });

        // Archive reconciliation
        await tx.reconciliation.update({
          where: { id: reconciliationId },
          data: {
            status: ReconciliationStatus.ARCHIVED,
          },
        });

        // Create audit log
        await tx.activityLog.create({
          data: {
            tenantId,
            userId: approvedBy,
            action: 'COMPLETE_RECONCILIATION',
            entity: 'Reconciliation',
            entityId: reconciliationId,
            metadata: {
              completedAt: new Date(),
              status: 'ARCHIVED',
            },
          },
        });

        logger.info(`✅ Reconciliation completed and archived for tenant ${tenantId}`);

        return {
          reconciliationId,
          status: ReconciliationStatus.ARCHIVED,
          approvedBy,
          approvedAt: completed.approvedAt,
          businessDayClosed: true,
          nextDayOpenable: true,
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error completing reconciliation:', error.message);
      throw error;
    }
  }

  /**
   * Get reconciliation report
   */
  async getReconciliationReport(reconciliationId: string, tenantId: string): Promise<any> {
    try {
      const reconciliation = await this.prisma.reconciliation.findFirst({
        where: { id: reconciliationId, tenantId },
        include: {
          cashCounts: true,
          cardSettlements: true,
          discrepancies: true,
        },
      });

      if (!reconciliation) {
        throw new Error('Reconciliation not found');
      }

      // Get all transactions for the date
      const startOfDay = new Date(reconciliation.reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(reconciliation.reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await this.prisma.order.findMany({
        where: {
          tenantId,
          closedAt: { gte: startOfDay, lte: endOfDay },
          status: OrderStatus.CLOSED,
        },
        include: {
          payments: true,
          tips: true,
        },
      });

      // Calculate summary
      const totalCash = reconciliation.cashCounts.reduce((sum, cc) => sum.plus(cc.totalAmount), new Decimal(0));
      const totalCard = reconciliation.cardSettlements.reduce((sum, cs) => sum.plus(cs.netAmount), new Decimal(0));
      const totalRevenue = orders.reduce((sum, o) => sum.plus(o.total), new Decimal(0));

      return {
        reconciliationId,
        reconciliationDate: reconciliation.reconciliationDate,
        status: reconciliation.status,
        approver: reconciliation.approvedBy,
        approvedAt: reconciliation.approvedAt,
        transactions: {
          totalOrders: orders.length,
          totalRevenue,
        },
        cashCount: {
          expected: reconciliation.expectedCash,
          actual: totalCash,
          discrepancy: reconciliation.cashDiscrepancy,
          denominations: reconciliation.cashCounts.length,
        },
        cardSettlement: {
          expected: reconciliation.cardExpected,
          actual: totalCard,
          discrepancy: reconciliation.cardDiscrepancy,
          transactionCount: reconciliation.cardSettlements.reduce((sum, cs) => sum + cs.transactionCount, 0),
        },
        discrepancies: {
          total: reconciliation.discrepancies.length,
          byType: reconciliation.discrepancies.reduce((acc, d) => {
            acc[d.type] = (acc[d.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          bySeverity: reconciliation.discrepancies.reduce((acc, d) => {
            acc[d.severity] = (acc[d.severity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          details: reconciliation.discrepancies,
        },
      };
    } catch (error: any) {
      logger.error('Error getting reconciliation report:', error.message);
      throw error;
    }
  }

  /**
   * Daily reconciliation - comprehensive check of all orders and payments (legacy method)
   */
  async dailyReconciliation(tenantId: string, reconciliationDate: Date): Promise<any> {
    try {
      const startOfDay = new Date(reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get all closed orders from the day
      const orders = await this.prisma.order.findMany({
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
   * Verify payments match order total (legacy method)
   */
  async verifyPaymentMatches(orderId: string, tenantId: string): Promise<any> {
    try {
      const order = await this.prisma.order.findFirst({
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
   * Identify all discrepancies for a date range (legacy method)
   */
  async identifyDiscrepancies(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const orders = await this.prisma.order.findMany({
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
   * Generate comprehensive reconciliation report (legacy method)
   */
  async generateReconciliationReport(tenantId: string, reconciliationDate: Date): Promise<any> {
    try {
      const startOfDay = new Date(reconciliationDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(reconciliationDate);
      endOfDay.setHours(23, 59, 59, 999);

      const orders = await this.prisma.order.findMany({
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
   * Reconcile payments (mark as reconciled) (legacy method)
   */
  async reconcilePayments(orderId: string, tenantId: string, approvedBy: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
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
   * Helper: Generate suggestions for resolving discrepancies
   */
  private generateSuggestions(discrepancies: any[]): string[] {
    const suggestions: string[] = [];

    const hasShortages = discrepancies.some(d => d.type === DiscrepancyType.CASH_SHORTAGE);
    const hasOverages = discrepancies.some(d => d.type === DiscrepancyType.CASH_OVERAGE);
    const hasUnmatched = discrepancies.some(d => d.type === DiscrepancyType.UNMATCHED_TRANSACTION);

    if (hasShortages) {
      suggestions.push('Review cash handling procedures and identify potential loss areas');
      suggestions.push('Check for incomplete transactions or incorrect register programming');
    }

    if (hasOverages) {
      suggestions.push('Verify card settlements and processor fees');
      suggestions.push('Check for duplicate entries or unprocessed refunds');
    }

    if (hasUnmatched) {
      suggestions.push('Investigate order-to-payment matching issues');
      suggestions.push('Review void/adjustment transactions');
    }

    if (discrepancies.length === 0) {
      suggestions.push('All systems reconciled perfectly!');
    }

    return suggestions;
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
   * Helper: Create immutable reconciliation log entry
   */
  private async createReconciliationLog(tenantId: string, summary: any): Promise<void> {
    await this.prisma.activityLog.create({
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

  /**
   * Run daily reconciliation - aggregates all cash sessions for a date
   * Called at end of business day to reconcile all shifts
   */
  async runDailyReconciliation(tenantId: string, reconciliationDate: Date, userId: string): Promise<any> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const startOfDay = new Date(reconciliationDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(reconciliationDate);
        endOfDay.setHours(23, 59, 59, 999);

        // Get all cash sessions for the day
        const cashSessions = await tx.cashSession.findMany({
          where: {
            tenantId,
            closedAt: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
          include: {
            staff: true,
          },
        });

        // Aggregate cash totals
        const totalExpectedCash = cashSessions.reduce((sum, s) => {
          return sum.plus(s.expectedCash || 0);
        }, new Decimal(0));

        const totalActualCash = cashSessions.reduce((sum, s) => {
          return sum.plus(s.closingCash || 0);
        }, new Decimal(0));

        const totalDiscrepancy = totalActualCash.minus(totalExpectedCash);

        // Find flagged sessions
        const flaggedCount = cashSessions.filter((s) => s.status === 'FLAGGED').length;

        // Get business day
        const businessDay = await tx.businessDay.findFirst({
          where: {
            tenantId,
            date: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        });

        // Get or create reconciliation record
        let reconciliation = await tx.reconciliation.findFirst({
          where: {
            tenantId,
            reconciliationDate,
          },
        });

        if (!reconciliation) {
          reconciliation = await tx.reconciliation.create({
            data: {
              tenantId,
              businessDayId: businessDay?.id || 'unknown',
              reconciliationDate,
              status: ReconciliationStatus.IN_PROGRESS,
              expectedCash: totalExpectedCash,
              actualCash: totalActualCash,
              cardExpected: new Decimal(0),
              cashDiscrepancy: totalDiscrepancy,
            },
          });
        } else {
          reconciliation = await tx.reconciliation.update({
            where: { id: reconciliation.id },
            data: {
              expectedCash: totalExpectedCash,
              actualCash: totalActualCash,
              cashDiscrepancy: totalDiscrepancy,
              status: flaggedCount > 0 ? ReconciliationStatus.IN_PROGRESS : ReconciliationStatus.LOCKED,
            },
          });
        }

        // Log activity
        await tx.activityLog.create({
          data: {
            tenantId,
            userId,
            action: 'DAILY_RECONCILIATION_RUN',
            entity: 'Reconciliation',
            entityId: reconciliation.id,
            metadata: {
              date: reconciliationDate,
              cashSessionsCount: cashSessions.length,
              flaggedCount,
              totalExpectedCash: totalExpectedCash.toString(),
              totalActualCash: totalActualCash.toString(),
              totalDiscrepancy: totalDiscrepancy.toString(),
            },
          },
        });

        logger.info(`📊 Daily reconciliation run: ${cashSessions.length} sessions, ${flaggedCount} flagged`);

        return {
          reconciliationId: reconciliation.id,
          date: reconciliationDate,
          cashSessionsCount: cashSessions.length,
          flaggedCount,
          totalExpectedCash,
          totalActualCash,
          totalDiscrepancy,
          status: reconciliation.status,
          sessions: cashSessions.map((s) => ({
            staffName: s.staff.name,
            expectedCash: s.expectedCash,
            actualCash: s.closingCash,
            discrepancy: s.discrepancy,
            status: s.status,
          })),
        };
      });

      return result;
    } catch (error: any) {
      logger.error('Error running daily reconciliation:', error.message);
      throw error;
    }
  }

  /**
   * Get reconciliation summary for a specific date
   */
  async getReconciliationByDate(tenantId: string, reconciliationDate: Date): Promise<any> {
    try {
      const reconciliation = await this.prisma.reconciliation.findFirst({
        where: {
          tenantId,
          reconciliationDate,
        },
        include: {
          cashCounts: true,
          cardSettlements: true,
          discrepancies: true,
        },
      });

      if (!reconciliation) {
        throw new Error('Reconciliation not found for this date');
      }

      return {
        id: reconciliation.id,
        date: reconciliation.reconciliationDate,
        status: reconciliation.status,
        expectedCash: reconciliation.expectedCash,
        actualCash: reconciliation.actualCash,
        cashDiscrepancy: reconciliation.cashDiscrepancy,
        cardExpected: reconciliation.cardExpected,
        cardActual: reconciliation.cardActual,
        cardDiscrepancy: reconciliation.cardDiscrepancy,
        isLocked: reconciliation.isLocked,
        discrepancyCount: reconciliation.discrepancies.length,
        approvedBy: reconciliation.approvedBy,
        approvedAt: reconciliation.approvedAt,
      };
    } catch (error: any) {
      logger.error('Error getting reconciliation by date:', error.message);
      throw error;
    }
  }
}

export const reconciliationService = new ReconciliationService();
