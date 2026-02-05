import { PrismaClient, PaymentStatus, PaymentMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

export interface SplitBill {
  billNumber: number;
  personNumber: number;
  items: {
    orderItemId: string;
    itemName: string;
    quantity: number;
    price: Decimal;
  }[];
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
  tipSuggestions: {
    percent: number;
    amount: Decimal;
  }[];
}

export interface SplitPaymentWithItems {
  id: string;
  billNumber: number;
  personNumber: number;
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
  paid: Decimal;
  remaining: Decimal;
  status: PaymentStatus;
  splitType: string;
  items: {
    orderItemId: string;
    itemName: string;
    quantity: number;
    price: Decimal;
  }[];
}

export class SplitCheckService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }
  /**
   * Calculate equal split: Divides order total equally among N people
   */
  async calculateEqualSplit(
    orderId: string,
    numPeople: number,
    tenantId: string
  ): Promise<SplitBill[]> {
    try {
      if (numPeople < 2 || numPeople > 10) {
        throw new Error('Number of people must be between 2 and 10');
      }

      // Get order with all items
      const order = await this.getOrderWithItems(orderId, tenantId);
      if (!order) throw new Error('Order not found');

      // Get bill information
      const bill = await this.getBillInfo(orderId, tenantId);

      // Divide equally
      const perPersonTotal = bill.total.div(numPeople);
      const perPersonSubtotal = bill.subtotal.div(numPeople);
      const perPersonTax = bill.tax.div(numPeople);

      // Create split bills
      const splits: SplitBill[] = [];

      for (let i = 1; i <= numPeople; i++) {
        let personSubtotal = perPersonSubtotal;
        let personTax = perPersonTax;
        let personTotal = perPersonTotal;

        // Last person absorbs rounding difference
        if (i === numPeople) {
          personSubtotal = bill.subtotal.minus(
            perPersonSubtotal.mul(numPeople - 1)
          );
          personTax = bill.tax.minus(perPersonTax.mul(numPeople - 1));
          personTotal = personSubtotal.plus(personTax);
        }

        splits.push({
          billNumber: i,
          personNumber: i,
          items: order.items, // All items for equal split
          subtotal: personSubtotal,
          tax: personTax,
          total: personTotal,
          tipSuggestions: this.calculateTipSuggestions(personTotal),
        });
      }

      return splits;
    } catch (error: any) {
      logger.error(`Error calculating equal split for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate item-based split: Assign specific items to each person
   */
  async calculateItemSplit(
    orderId: string,
    itemAssignments: { personNumber: number; itemIds: string[] }[],
    tenantId: string
  ): Promise<SplitBill[]> {
    try {
      const order = await this.getOrderWithItems(orderId, tenantId);
      if (!order) throw new Error('Order not found');

      const bill = await this.getBillInfo(orderId, tenantId);

      // Map items by ID for quick lookup with pricing
      const itemMap = new Map(order.itemsWithPrice.map(item => [item.orderItemId, item]));

      const splits: SplitBill[] = [];
      let totalAssignedSubtotal = new Decimal(0);

      // Build split bills from assignments
      for (const assignment of itemAssignments) {
        const personItems = [];
        let personSubtotal = new Decimal(0);

        for (const itemId of assignment.itemIds) {
          const item = itemMap.get(itemId);
          if (!item) {
            throw new Error(`Item ${itemId} not found in order`);
          }

          personItems.push({
            orderItemId: item.orderItemId,
            itemName: item.itemName,
            quantity: item.quantity,
            price: item.price,
          });

          personSubtotal = personSubtotal.plus(item.price);
        }

        totalAssignedSubtotal = totalAssignedSubtotal.plus(personSubtotal);

        // Calculate tax proportionally
        const personTax = personSubtotal.mul(bill.tax).div(bill.subtotal);
        const personTotal = personSubtotal.plus(personTax);

        splits.push({
          billNumber: assignment.personNumber,
          personNumber: assignment.personNumber,
          items: personItems,
          subtotal: personSubtotal,
          tax: personTax,
          total: personTotal,
          tipSuggestions: this.calculateTipSuggestions(personTotal),
        });
      }

      // Validate all items were assigned
      if (totalAssignedSubtotal.toFixed(2) !== bill.subtotal.toFixed(2)) {
        throw new Error(
          `Item assignments do not match order subtotal. Expected: $${bill.subtotal.toFixed(
            2
          )}, Got: $${totalAssignedSubtotal.toFixed(2)}`
        );
      }

      // Handle rounding: last person absorbs difference in total
      if (splits.length > 0) {
        let totalCalculated = splits.reduce((sum, s) => sum.plus(s.total), new Decimal(0));
        const difference = bill.total.minus(totalCalculated);

        if (!difference.equals(new Decimal(0))) {
          const lastSplit = splits[splits.length - 1];
          lastSplit.total = lastSplit.total.plus(difference);
          lastSplit.tax = lastSplit.tax.plus(difference);
        }
      }

      return splits;
    } catch (error: any) {
      logger.error(`Error calculating item split for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Calculate custom split: Validate custom amounts sum to total
   */
  async calculateCustomSplit(
    orderId: string,
    amounts: { personNumber: number; amount: Decimal | number }[],
    tenantId: string
  ): Promise<SplitBill[]> {
    try {
      const order = await this.getOrderWithItems(orderId, tenantId);
      if (!order) throw new Error('Order not found');

      const bill = await this.getBillInfo(orderId, tenantId);

      // Convert amounts to Decimal
      const decimalAmounts = amounts.map(a => ({
        personNumber: a.personNumber,
        amount: new Decimal(a.amount),
      }));

      // Sum amounts
      const totalAmount = decimalAmounts.reduce((sum, a) => sum.plus(a.amount), new Decimal(0));

      // Validate sum matches total (within $0.01 for rounding)
      const difference = bill.total.minus(totalAmount).abs();
      if (difference.gt(new Decimal('0.01'))) {
        throw new Error(
          `Custom split amounts do not match order total. Expected: $${bill.total.toFixed(
            2
          )}, Got: $${totalAmount.toFixed(2)} (Difference: $${difference.toFixed(2)})`
        );
      }

      // Create split bills
      const splits: SplitBill[] = [];

      for (const assignment of decimalAmounts) {
        // Calculate tax proportionally based on custom amount
        const taxProportion = assignment.amount.div(bill.total);
        const personTax = bill.tax.mul(taxProportion);
        const personSubtotal = assignment.amount.minus(personTax);

        splits.push({
          billNumber: assignment.personNumber,
          personNumber: assignment.personNumber,
          items: order.items, // Show all items for reference
          subtotal: personSubtotal,
          tax: personTax,
          total: assignment.amount,
          tipSuggestions: this.calculateTipSuggestions(assignment.amount),
        });
      }

      // Handle rounding: adjust last person's total
      if (splits.length > 0) {
        let totalCalculated = splits.reduce((sum, s) => sum.plus(s.total), new Decimal(0));
        const rounding = bill.total.minus(totalCalculated);

        if (!rounding.equals(new Decimal(0))) {
          const lastSplit = splits[splits.length - 1];
          lastSplit.total = lastSplit.total.plus(rounding);
          lastSplit.subtotal = lastSplit.subtotal.plus(rounding);
        }
      }

      return splits;
    } catch (error: any) {
      logger.error(`Error calculating custom split for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Create split payment records in database
   */
  async createSplits(
    orderId: string,
    splits: SplitBill[],
    splitType: string,
    tenantId: string
  ): Promise<any> {
    try {
      // Verify order isn't already split
      const existingSplits = await this.prisma.splitPayment.count({
        where: { orderId, tenantId },
      });

      if (existingSplits > 0) {
        throw new Error('Order is already split. Undo existing split before creating new one.');
      }

      // Create split payments using transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const createdSplits = [];

        for (const split of splits) {
          // Create split payment record
          const splitPayment = await tx.splitPayment.create({
            data: {
              tenantId,
              orderId,
              billNumber: split.billNumber,
              personNumber: split.personNumber,
              subtotal: split.subtotal,
              tax: split.tax,
              total: split.total,
              remaining: split.total,
              status: PaymentStatus.PENDING,
              splitType,
            },
          });

          // Create split items
          const splitItems = await Promise.all(
            split.items.map((item) =>
              tx.splitPaymentItem.create({
                data: {
                  tenantId,
                  splitPaymentId: splitPayment.id,
                  orderItemId: item.orderItemId,
                  quantity: item.quantity,
                  price: item.price,
                },
              })
            )
          );

          createdSplits.push({
            ...splitPayment,
            items: splitItems,
          });
        }

        // Update order status to reflect it's split (optional - for tracking)
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'OPEN' }, // Keep order open until all splits paid
        });

        return createdSplits;
      });

      logger.info(`✅ Split check created for order ${orderId}: ${splits.length} bills`);
      return result;
    } catch (error: any) {
      logger.error(`Error creating splits for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Record payment against a split
   */
  async recordSplitPayment(
    splitPaymentId: string,
    amount: Decimal | number,
    method: PaymentMethod,
    tenantId: string,
    reference?: string,
    cardLastFour?: string
  ): Promise<any> {
    try {
      const amountDecimal = new Decimal(amount);

      // Get split payment
      const split = await this.prisma.splitPayment.findUnique({
        where: { id: splitPaymentId },
      });

      if (!split) throw new Error('Split payment not found');

      if (split.tenantId !== tenantId) {
        throw new Error('Unauthorized');
      }

      // Validate amount
      if (amountDecimal.lte(0)) {
        throw new Error('Payment amount must be greater than 0');
      }

      if (amountDecimal.gt(split.remaining)) {
        throw new Error(
          `Payment exceeds remaining balance. Remaining: $${split.remaining.toFixed(
            2
          )}, Payment: $${amountDecimal.toFixed(2)}`
        );
      }

      // Use transaction for atomic operation
      const result = await this.prisma.$transaction(async (tx) => {
        // Create payment record
        const paymentRecord = await tx.splitPaymentRecord.create({
          data: {
            tenantId,
            splitPaymentId,
            amount: amountDecimal,
            method,
            status: PaymentStatus.COMPLETED,
            reference: reference || '',
            cardLastFour: cardLastFour || undefined,
            processedAt: new Date(),
          },
        });

        // Update split payment totals
        const newPaid = split.paid.plus(amountDecimal);
        const newRemaining = split.total.minus(newPaid);
        const newStatus =
          newRemaining.equals(new Decimal(0)) || newRemaining.lt(new Decimal(0))
            ? PaymentStatus.COMPLETED
            : PaymentStatus.PROCESSING;

        const updatedSplit = await tx.splitPayment.update({
          where: { id: splitPaymentId },
          data: {
            paid: newPaid,
            remaining: newRemaining.lt(new Decimal(0)) ? new Decimal(0) : newRemaining,
            status: newStatus,
          },
        });

        // Check if all splits for order are paid
        const allSplits = await tx.splitPayment.findMany({
          where: { orderId: split.orderId, tenantId },
        });

        const allPaid = allSplits.every((s) =>
          s.status === PaymentStatus.COMPLETED ||
          (s.id === splitPaymentId && newStatus === PaymentStatus.COMPLETED)
        );

        if (allPaid) {
          await tx.order.update({
            where: { id: split.orderId },
            data: { status: 'PAID' },
          });
        }

        return { paymentRecord, updatedSplit };
      });

      logger.info(
        `✅ Payment recorded for split ${splitPaymentId}: $${amountDecimal.toFixed(2)} via ${method}`
      );
      return result;
    } catch (error: any) {
      logger.error(`Error recording split payment for ${splitPaymentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if all splits for an order are paid
   */
  async checkAllSplitsPaid(orderId: string, tenantId: string): Promise<boolean> {
    try {
      const splits = await this.prisma.splitPayment.findMany({
        where: { orderId, tenantId },
      });

      if (splits.length === 0) {
        throw new Error('No splits found for this order');
      }

      const allPaid = splits.every((s) => s.status === PaymentStatus.COMPLETED);
      return allPaid;
    } catch (error: any) {
      logger.error(`Error checking if splits are paid for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Undo split (only if no payments made)
   */
  async undoSplit(orderId: string, tenantId: string): Promise<void> {
    try {
      const splits = await this.prisma.splitPayment.findMany({
        where: { orderId, tenantId },
      });

      if (splits.length === 0) {
        throw new Error('No split found for this order');
      }

      // Check if any payment has been made
      const paymentsCount = await this.prisma.splitPaymentRecord.count({
        where: {
          splitPaymentId: { in: splits.map((s) => s.id) },
        },
      });

      if (paymentsCount > 0) {
        throw new Error('Cannot undo split after payments have been made');
      }

      // Delete all split data
      await this.prisma.$transaction(async (tx) => {
        // Delete split items
        await tx.splitPaymentItem.deleteMany({
          where: { splitPaymentId: { in: splits.map((s) => s.id) } },
        });

        // Delete split payment records
        await tx.splitPaymentRecord.deleteMany({
          where: { splitPaymentId: { in: splits.map((s) => s.id) } },
        });

        // Delete split payments
        await tx.splitPayment.deleteMany({
          where: { id: { in: splits.map((s) => s.id) } },
        });

        // Reset order status
        await tx.order.update({
          where: { id: orderId },
          data: { status: 'OPEN' },
        });
      });

      logger.info(`✅ Split check undone for order ${orderId}`);
    } catch (error: any) {
      logger.error(`Error undoing split for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all splits for an order
   */
  async getSplitsForOrder(orderId: string, tenantId: string): Promise<SplitPaymentWithItems[]> {
    try {
      const splits = await this.prisma.splitPayment.findMany({
        where: { orderId, tenantId },
        include: {
          items: {
            include: {
              orderItem: {
                include: { menuItem: true },
              },
            },
          },
        },
        orderBy: { billNumber: 'asc' },
      });

      return splits.map((split) => ({
        id: split.id,
        billNumber: split.billNumber,
        personNumber: split.personNumber,
        subtotal: split.subtotal,
        tax: split.tax,
        total: split.total,
        paid: split.paid,
        remaining: split.remaining,
        status: split.status,
        splitType: split.splitType,
        items: split.items.map((item) => ({
          orderItemId: item.orderItemId,
          itemName: item.orderItem.menuItem.name,
          quantity: item.quantity,
          price: item.price,
        })),
      }));
    } catch (error: any) {
      logger.error(`Error getting splits for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get single split with details
   */
  async getSplitById(splitId: string, tenantId: string): Promise<SplitPaymentWithItems | null> {
    try {
      const split = await this.prisma.splitPayment.findUnique({
        where: { id: splitId },
        include: {
          items: {
            include: {
              orderItem: {
                include: { menuItem: true },
              },
            },
          },
        },
      });

      if (!split || split.tenantId !== tenantId) {
        return null;
      }

      return {
        id: split.id,
        billNumber: split.billNumber,
        personNumber: split.personNumber,
        subtotal: split.subtotal,
        tax: split.tax,
        total: split.total,
        paid: split.paid,
        remaining: split.remaining,
        status: split.status,
        splitType: split.splitType,
        items: split.items.map((item) => ({
          orderItemId: item.orderItemId,
          itemName: item.orderItem.menuItem.name,
          quantity: item.quantity,
          price: item.price,
        })),
      };
    } catch (error: any) {
      logger.error(`Error getting split ${splitId}:`, error.message);
      throw error;
    }
  }

  // ========== PRIVATE HELPER METHODS ==========

  /**
   * Calculate tip suggestions
   */
  private calculateTipSuggestions(
    total: Decimal
  ): { percent: number; amount: Decimal }[] {
    return [15, 18, 20].map((percent) => ({
      percent,
      amount: total.mul(percent).div(100),
    }));
  }

  /**
   * Get order with all items and pricing
   */
  private async getOrderWithItems(
    orderId: string,
    tenantId: string
  ): Promise<{
    items: { orderItemId: string; itemName: string; quantity: number; price: Decimal }[];
    itemsWithPrice: {
      orderItemId: string;
      itemName: string;
      quantity: number;
      price: Decimal;
    }[];
  } | null> {
    const courses = await this.prisma.orderCourse.findMany({
      where: { orderId },
    });

    const courseIds = courses.map((c) => c.id);
    const items = await this.prisma.orderItem.findMany({
      where: { orderCourseId: { in: courseIds } },
      include: { menuItem: true },
    });

    if (items.length === 0) {
      return null;
    }

    const processedItems = items.map((item) => ({
      orderItemId: item.id,
      itemName: item.menuItem.name,
      quantity: item.quantity,
      price: item.menuItem.price.mul(item.quantity),
    }));

    return {
      items: processedItems,
      itemsWithPrice: processedItems,
    };
  }

  /**
   * Get bill information for order
   */
  private async getBillInfo(
    orderId: string,
    tenantId: string
  ): Promise<{ subtotal: Decimal; tax: Decimal; total: Decimal }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Get courses and items
    const courses = await this.prisma.orderCourse.findMany({
      where: { orderId },
    });

    const courseIds = courses.map((c) => c.id);
    const items = await this.prisma.orderItem.findMany({
      where: { orderCourseId: { in: courseIds } },
      include: { menuItem: true },
    });

    // Calculate subtotal
    const subtotal = items.reduce((sum, item) => {
      return sum.plus(item.menuItem.price.mul(item.quantity));
    }, new Decimal(0));

    // Get tax rate
    const taxSetting = await this.prisma.financialSetting.findFirst({
      where: { tenantId },
    });
    const taxRate = taxSetting?.taxRate || new Decimal('0.0825');

    const tax = subtotal.mul(taxRate);
    const total = subtotal.plus(tax);

    return { subtotal, tax, total };
  }
}


