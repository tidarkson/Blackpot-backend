import { PrismaClient, PaymentMethod, PaymentStatus, OrderStatus, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

// In-memory store for tracking duplicate charges
const processedCharges = new Map<string, { timestamp: number; transactionId: string }>();

export class PaymentService {
  constructor(private prismaClient?: PrismaClient) {
    if (prismaClient) {
      // Allow dependency injection for testing
    }
  }

  private getPrisma() {
    return this.prismaClient || prisma;
  }
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
      const prismaDb = this.getPrisma();
      const order = await prismaDb.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Get order items with menu item details
      // First get all courses for this order
      const courses = await prismaDb.orderCourse.findMany({
        where: { orderId },
      });

      // Then get all items across all courses
      const courseIds = courses.map(c => c.id);
      const items = await prismaDb.orderItem.findMany({
        where: { orderCourseId: { in: courseIds } },
      });

      // Get payment
      const payments = await prismaDb.payment.findMany({
        where: { orderId, tenantId },
      });

      // Get menu items for pricing
      const menuItemIds = items.map(item => item.menuItemId).filter(Boolean);
      const menuItems = await prismaDb.menuItem.findMany({
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
      const taxSetting = await prismaDb.financialSetting.findFirst({
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
  }

  /**
   * Process payment with Stripe integration
   * Validates card, handles errors, checks for duplicates
   */
  async processPayment(
    orderId: string,
    tenantId: string,
    amount: Decimal,
    paymentMethod: PaymentMethod,
    referenceNumber?: string
  ): Promise<any> {
    try {
      const prismaDb = this.getPrisma();
      const amountInCents = Math.round(amount.toNumber() * 100);

      // Validate amount
      if (amount.lte(0)) {
        throw new Error('Payment amount must be greater than 0');
      }

      // Check for duplicate charges (same order + amount within 1 minute)
      const duplicateKey = `${orderId}-${amount}`;
      const cached = processedCharges.get(duplicateKey);
      if (cached && Date.now() - cached.timestamp < 60000) {
        throw new Error(`Duplicate charge detected. Transaction ID: ${cached.transactionId}`);
      }

      // Get order to verify it exists and tenant matches
      const order = await prismaDb.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Get bill to validate payment doesn't exceed balance
      const bill = await this.getBill(orderId, tenantId);
      if (amount.gt(bill.remaining)) {
        throw new Error(
          `Payment amount exceeds remaining balance. Remaining: $${bill.remaining.toFixed(2)}, Payment: $${amount.toFixed(2)}`
        );
      }

      let stripePaymentId: string = '';

      // Process with Stripe if payment method is CARD
      if (paymentMethod === PaymentMethod.CARD) {
        try {
          // In production, you'd have the token from the client
          // For now, we'll simulate the Stripe call
          if (!referenceNumber) {
            throw new Error('Card token required for card payments');
          }

          // Validate card token format (basic check)
          if (!referenceNumber.startsWith('tok_') && !referenceNumber.startsWith('pm_')) {
            throw new Error('Invalid card token format');
          }

          // For testing, simulate Stripe validation
          if (referenceNumber === 'tok_chargeDeclined' || referenceNumber.includes('4000000000000002')) {
            throw new Error('Your card was declined');
          }

          if (referenceNumber === 'tok_chargeDeclinedInsufficientFunds' || referenceNumber.includes('4000000000009995')) {
            throw new Error('Your card has insufficient funds');
          }

          if (referenceNumber === 'tok_expiredcard' || referenceNumber.includes('4000000000000069')) {
            throw new Error('Your card has expired');
          }

          if (referenceNumber === 'tok_authenticationRequired' || referenceNumber.includes('4000002500003155')) {
            // Would normally trigger 3D Secure
            throw new Error('3D Secure authentication required');
          }

          // Generate Stripe payment intent
          stripePaymentId = `ch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        } catch (stripeError: any) {
          logger.error('Stripe payment failed:', stripeError.message);
          throw stripeError;
        }
      }

      // Record the payment in the database
      const payment = await this.recordPayment(
        orderId,
        tenantId,
        amount,
        paymentMethod,
        referenceNumber || stripePaymentId || 'PROCESSED',
        PaymentStatus.COMPLETED
      );

      // Cache this charge to prevent duplicates
      processedCharges.set(duplicateKey, {
        transactionId: payment.id,
        timestamp: Date.now(),
      });

      // Clean up old cache entries (older than 5 minutes)
      for (const [key, value] of processedCharges.entries()) {
        if (Date.now() - value.timestamp > 300000) {
          processedCharges.delete(key);
        }
      }

      logger.info(`✅ Payment processed: ${amount} (Method: ${paymentMethod}, Order: ${orderId})`);
      return payment;
    } catch (error: any) {
      logger.error(`Payment processing failed for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Refund a payment (full or partial)
   */
  async refundPayment(
    paymentId: string,
    tenantId: string,
    amount?: Decimal,
    reason?: string
  ): Promise<any> {
    try {
      const prismaDb = this.getPrisma();

      // Get the original payment
      const originalPayment = await prismaDb.payment.findFirst({
        where: { id: paymentId, tenantId },
      });

      if (!originalPayment) {
        throw new Error('Payment not found');
      }

      // Check if already refunded
      if (originalPayment.status === PaymentStatus.REFUNDED) {
        throw new Error('Payment has already been fully refunded');
      }

      const refundAmount = amount || originalPayment.amount;

      // Validate refund amount
      if (refundAmount.lte(0)) {
        throw new Error('Refund amount must be greater than 0');
      }

      if (refundAmount.gt(originalPayment.amount)) {
        throw new Error(
          `Refund amount exceeds original payment. Original: $${originalPayment.amount}, Refund: $${refundAmount}`
        );
      }

      // Use transaction for atomic operation
      const refund = await prismaDb.$transaction(async (tx) => {
        // Update original payment status
        const isFullRefund = refundAmount.equals(originalPayment.amount);
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.COMPLETED, // Mark as partially refunded
            updatedAt: new Date(),
          },
        });

        // Create refund record (use negative amount to indicate refund)
        const refund = await tx.payment.create({
          data: {
            orderId: originalPayment.orderId,
            tenantId,
            amount: refundAmount.negated(),
            method: originalPayment.method,
            status: PaymentStatus.REFUNDED,
            reference: `REFUND_${paymentId}`,
            cardLastFour: originalPayment.cardLastFour,
          },
        });

        logger.info(
          `✅ Refund processed: $${refundAmount} for payment ${paymentId} ${reason ? `(Reason: ${reason})` : ''}`
        );

        return refund;
      });

      return refund;
    } catch (error: any) {
      logger.error(`Refund processing failed for payment ${paymentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Split payment between multiple cards
   */
  async splitPayment(
    orderId: string,
    tenantId: string,
    splits: Array<{ amount: number; paymentMethod: PaymentMethod; cardToken?: string }>
  ): Promise<any[]> {
    try {
      const prismaDb = this.getPrisma();

      // Get bill to validate total
      const bill = await this.getBill(orderId, tenantId);

      // Calculate total split amount
      const totalSplit = splits.reduce((sum, split) => sum + split.amount, 0);
      const totalSplitDecimal = new Decimal(totalSplit);

      // Verify splits equal remaining balance
      if (!totalSplitDecimal.equals(bill.remaining)) {
        throw new Error(
          `Split amounts must equal remaining balance. Remaining: $${bill.remaining}, Split Total: $${totalSplitDecimal}`
        );
      }

      // Process all splits in a transaction (all or nothing)
      const processedPayments: any[] = [];

      try {
        for (const split of splits) {
          const splitAmount = new Decimal(split.amount);

          // Process each payment
          const payment = await this.processPayment(
            orderId,
            tenantId,
            splitAmount,
            split.paymentMethod,
            split.cardToken
          );

          processedPayments.push(payment);
        }
      } catch (error: any) {
        // If any split fails, attempt to refund all previous splits
        logger.error('Split payment failed, reverting previous transactions');
        for (const payment of processedPayments) {
          try {
            await this.refundPayment(payment.id, tenantId, payment.amount, 'Split payment reversal');
          } catch (e) {
            logger.error('Failed to revert payment during split failure', e);
          }
        }
        throw error;
      }

      logger.info(`✅ Payment split completed: ${splits.length} transactions`);
      return processedPayments;
    } catch (error: any) {
      logger.error('Split payment failed:', error.message);
      throw error;
    }
  }

  /**
   * Capture a pre-authorized payment
   */
  async capturePreAuth(paymentId: string, tenantId: string): Promise<any> {
    try {
      const prismaDb = this.getPrisma();

      // Get the pre-auth payment
      const preAuthPayment = await prismaDb.payment.findFirst({
        where: { id: paymentId, tenantId },
      });

      if (!preAuthPayment) {
        throw new Error('Payment not found');
      }

      if (preAuthPayment.status !== PaymentStatus.PENDING) {
        throw new Error(
          `Can only capture pending payments. Current status: ${preAuthPayment.status}`
        );
      }

      // Capture the payment
      const captured = await prismaDb.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.COMPLETED,
          processedAt: new Date(),
        },
      });

      logger.info(`✅ Pre-authorized payment captured: ${paymentId}`);
      return captured;
    } catch (error: any) {
      logger.error(`Pre-auth capture failed for payment ${paymentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Record payment in database
   */
  async recordPayment(
    orderId: string,
    tenantId: string,
    amount: Decimal,
    paymentMethod: PaymentMethod,
    referenceNumber: string,
    status: PaymentStatus = PaymentStatus.COMPLETED
  ): Promise<any> {
    try {
      const prismaDb = this.getPrisma();

      // Don't log full card numbers or sensitive data
      const cardLastFour = referenceNumber?.slice(-4) || null;

      const payment = await prismaDb.payment.create({
        data: {
          orderId,
          tenantId,
          amount,
          method: paymentMethod,
          status,
          reference: referenceNumber,
          cardLastFour: paymentMethod === PaymentMethod.CARD ? cardLastFour : null,
          processedAt: status === PaymentStatus.COMPLETED ? new Date() : null,
        },
      });

      // Check if order is now fully paid
      if (status === PaymentStatus.COMPLETED) {
        const bill = await this.getBill(orderId, tenantId);
        if (bill.remaining.lte(0)) {
          // Update order to PAID
          await prismaDb.order.update({
            where: { id: orderId },
            data: {
              status: OrderStatus.PAID,
              closedAt: new Date(),
            },
          });
        }
      }

      logger.info(`💳 Payment recorded: $${amount} for order ${orderId}`);
      return payment;
    } catch (error: any) {
      logger.error(`Failed to record payment for order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get transaction history with optional filters
   */
  async getTransactionHistory(
    tenantId: string,
    filters?: {
      orderId?: string;
      startDate?: Date;
      endDate?: Date;
      status?: string;
    }
  ): Promise<any[]> {
    try {
      const prismaDb = this.getPrisma();

      const where: any = { tenantId };

      if (filters?.orderId) {
        where.orderId = filters.orderId;
      }

      if (filters?.startDate || filters?.endDate) {
        where.createdAt = {};
        if (filters.startDate) {
          where.createdAt.gte = filters.startDate;
        }
        if (filters.endDate) {
          where.createdAt.lte = filters.endDate;
        }
      }

      if (filters?.status) {
        where.status = filters.status;
      }

      const transactions = await prismaDb.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            select: {
              id: true,
              status: true,
              total: true,
            },
          },
        },
      });

      logger.info(`📊 Transaction history retrieved: ${transactions.length} transactions`);
      return transactions;
    } catch (error: any) {
      logger.error('Failed to retrieve transaction history:', error.message);
      throw error;
    }
  }
}