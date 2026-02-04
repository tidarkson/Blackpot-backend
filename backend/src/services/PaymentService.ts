import { PrismaClient, PaymentMethod, PaymentStatus, OrderStatus, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class PaymentService {
  /**
   * Get bill for an order with proper financial calculations
   * Uses financial settings from tenant for tax rates
   */
  async getBill(
    orderId: string,
    tenantId: string
  ): Promise<{
    subtotal: Decimal;
    tax: Decimal;
    total: Decimal;
    paid: Decimal;
    remaining: Decimal;
  }> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Get order items with menu item details
      // First get all courses for this order
      const courses = await prisma.orderCourse.findMany({
        where: { orderId },
      });

      // Then get all items across all courses
      const courseIds = courses.map(c => c.id);
      const items = await prisma.orderItem.findMany({
        where: { orderCourseId: { in: courseIds } },
      });

      // Get payment
      const payments = await prisma.payment.findMany({
        where: { orderId, tenantId },
      });

      // Get menu items for pricing
      const menuItemIds = items.map(item => item.menuItemId).filter(Boolean);
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
      });

      // Create a map for quick lookup
      const menuItemMap = new Map(menuItems.map(item => [item.id, item]));

      // Calculate subtotal from items
      const subtotal = items.reduce((sum, item) => {
        const menuItem = menuItemMap.get(item.menuItemId);
        if (!menuItem) return sum;
        return sum.plus(menuItem.price.mul(item.quantity));
      }, new Decimal(0));

      // Get tax rate from financial settings
      const taxSetting = await prisma.financialSetting.findFirst({
        where: { tenantId },
      });
      const taxRate = taxSetting?.taxRate || new Decimal('0.0825');

      // Calculate tax
      const tax = subtotal.mul(taxRate);

      // Calculate total
      const total = subtotal.plus(tax);

      // Calculate paid amount
      const paid = payments.reduce((sum, payment) => {
        if (payment.status === PaymentStatus.COMPLETED) {
          return sum.plus(payment.amount);
        }
        return sum;
      }, new Decimal(0));

      const remaining = total.minus(paid);

      return {
        subtotal,
        tax,
        total,
        paid,
        remaining,
      };
    } catch (error: any) {
      logger.error('Error calculating bill:', error.message);
      throw error;
    }
  }

  /**
   * Add payment with transaction integrity
   * Validates amount matches bill before recording payment
   */
  async addPayment(
    orderId: string,
    tenantId: string,
    amount: Decimal | number,
    paymentMethod: PaymentMethod,
    referenceNumber?: string
  ): Promise<any> {
    const amountDecimal = new Decimal(amount);

    try {
      // Get current bill
      const bill = await this.getBill(orderId, tenantId);

      // Validate payment amount
      if (amountDecimal.lte(0)) {
        throw new Error('Payment amount must be greater than 0');
      }

      if (amountDecimal.gt(bill.remaining)) {
        throw new Error(
          `Payment amount exceeds remaining balance. Remaining: $${bill.remaining.toFixed(2)}, Payment: $${amountDecimal.toFixed(2)}`
        );
      }

      // Use transaction to ensure atomic operation
      const result = await prisma.$transaction(async (tx) => {
        // Create payment record
        const payment = await tx.payment.create({
          data: {
            orderId,
            tenantId,
            amount: amountDecimal,
            method: paymentMethod,
            reference: referenceNumber || '',
            status: PaymentStatus.COMPLETED,
          },
        });

        // Check if order is now fully paid
        const updatedBill = await this.getBill(orderId, tenantId);
        const newPaid = updatedBill.paid.plus(amountDecimal);

        if (newPaid.gte(updatedBill.total)) {
          // Update order status to PAID if fully paid
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.PAID,
              closedAt: new Date(),
            },
          });

          logger.info(`✅ Order ${orderId} fully paid (status updated to PAID)`);
        }

        logger.info(
          `💳 Payment added: ${amountDecimal} (Method: ${paymentMethod}, OrderID: ${orderId})`
        );

        return payment;
      });

      return result;
    } catch (error: any) {
      logger.error(`Payment error for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Add tip to order
   */
  async addTip(
    orderId: string,
    tenantId: string,
    data: {
      amount: Decimal;
      method: TipMethod;
    }
  ) {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) throw new Error('Order not found');

      const tip = await prisma.tip.create({
        data: {
          tenantId,
          orderId,
          serverId: order.serverId,
          amount: data.amount,
          method: data.method,
        },
      });

      logger.info(`✅ Tip added to order ${orderId}: $${data.amount} via ${data.method}`);

      return tip;
    } catch (error: any) {
      logger.error(`❌ Failed to add tip to order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Verify payment integrity - check that payment matches bill
   */
  async verifyPaymentIntegrity(
    orderId: string,
    tenantId: string
  ): Promise<{
    isValid: boolean;
    billTotal: number;
    amountPaid: number;
    difference: number;
    issues: string[];
  }> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Get order items
      // First get all courses for this order
      const courses = await prisma.orderCourse.findMany({
        where: { orderId },
      });

      // Then get all items across all courses
      const courseIds = courses.map(c => c.id);
      const items = await prisma.orderItem.findMany({
        where: { orderCourseId: { in: courseIds } },
      });

      // Get payments separately to avoid type issues
      const payments = await prisma.payment.findMany({
        where: { orderId, tenantId },
      });

      // Get menu items for pricing
      const menuItemIds = items.map(item => item.menuItemId).filter(Boolean);
      const menuItems = await prisma.menuItem.findMany({
        where: { id: { in: menuItemIds } },
      });

      // Create a map for quick lookup
      const menuItemMap = new Map(menuItems.map(item => [item.id, item]));

      // Calculate subtotal
      const subtotal = items.reduce((sum, item) => {
        const menuItem = menuItemMap.get(item.menuItemId);
        if (!menuItem) return sum;
        return sum.plus(menuItem.price.mul(item.quantity));
      }, new Decimal(0));

      // Get tax setting
      const taxSetting = await prisma.financialSetting.findFirst({
        where: { tenantId },
      });
      const taxRate = taxSetting?.taxRate || new Decimal('0.0825');
      const tax = subtotal.mul(taxRate);
      const expectedTotal = subtotal.plus(tax);

      // Calculate actual paid
      const actualPaid = payments.reduce((sum, payment) => {
        if (payment.status === PaymentStatus.COMPLETED) {
          return sum.plus(payment.amount);
        }
        return sum;
      }, new Decimal(0));

      // Verify
      const isValid =
        order.subtotal?.equals(subtotal) &&
        order.tax?.equals(tax) &&
        order.total?.equals(expectedTotal);

      const issues: string[] = [];

      if (!isValid) {
        logger.error(
          `❌ Payment integrity check failed for order ${orderId}. Expected: $${expectedTotal}, Stored: $${order.total}`
        );
        issues.push(`Expected total: $${expectedTotal}, but stored: $${order.total}`);
      }

      logger.info(`✅ Payment integrity verified for order ${orderId}`);
      return {
        isValid,
        billTotal: expectedTotal.toNumber(),
        amountPaid: actualPaid.toNumber(),
        difference: expectedTotal.minus(actualPaid).toNumber(),
        issues,
      };
    } catch (error: any) {
      logger.error(`Integrity verification error:`, error.message);
      throw error;
    }

    // const bill = await this.getBill(orderId, tenantId);
    // const issues: string[] = [];

    // const difference = bill.total - bill.amountPaid;

    // if (difference < 0) {
    //   issues.push(`Overpayment detected: $${Math.abs(difference).toFixed(2)}`);
    // }

    // if (difference > 0) {
    //   issues.push(`Order not fully paid: $${difference.toFixed(2)} remaining`);
    // }

    // return {
    //   isValid: difference === 0,
    //   billTotal: bill.total,
    //   amountPaid: bill.amountPaid,
    //   difference,
    //   issues,
    // };
  }
}
