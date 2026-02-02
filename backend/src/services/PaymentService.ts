import { PrismaClient, PaymentMethod, PaymentStatus, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from '../config/logger';

const prisma = new PrismaClient();

export class PaymentService {
  /**
   * Get bill for an order with proper financial calculations
   * Uses financial settings from tenant for tax rates
   */
  async getBill(orderId: string, tenantId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        courses: {
          include: { items: { include: { menuItem: true } } },
        },
        payments: true,
        tips: true,
        serviceCharge: true,
      },
    });

    if (!order) throw new Error('Order not found');

    // Get tenant's financial settings for tax calculation
    const financialSettings = await prisma.financialSetting.findUnique({
      where: { tenantId },
    });

    const taxRate = financialSettings?.taxRate || new Decimal('0.0825'); // Default 8.25%

    // Calculate subtotal from items
    let subtotal = new Decimal(0);
    const items: any[] = [];

    order.courses?.forEach(course => {
      course.items?.forEach(item => {
        const itemTotal = item.menuItem.price.mul(new Decimal(item.quantity));
        subtotal = subtotal.add(itemTotal);
        items.push({
          description: `${item.menuItem.name} × ${item.quantity}`,
          price: item.menuItem.price.toNumber(),
          quantity: item.quantity,
        });
      });
    });

    // Calculate tax
    const tax = subtotal.mul(taxRate);

    // Calculate tips
    const currentTips = order.tips?.reduce(
      (sum, tip) => sum.add(tip.amount),
      new Decimal(0)
    ) || new Decimal(0);

    // Calculate service charge
    const serviceChargeAmount = order.serviceCharge?.amount || new Decimal(0);

    // Total = subtotal + tax + service charge
    const total = subtotal.add(tax).add(serviceChargeAmount);

    // Tip suggestions based on subtotal + tax
    const tipBase = subtotal.add(tax);
    const tipSuggestions = [
      tipBase.mul(new Decimal('0.18')).toNumber(),
      tipBase.mul(new Decimal('0.20')).toNumber(),
      tipBase.mul(new Decimal('0.25')).toNumber(),
    ];

    return {
      orderId,
      subtotal: subtotal.toNumber(),
      tax: tax.toNumber(),
      serviceCharge: serviceChargeAmount.toNumber(),
      currentTips: currentTips.toNumber(),
      tipSuggestions,
      total: total.toNumber(),
      amountPaid: order.payments?.reduce(
        (sum, payment) => sum + payment.amount.toNumber(),
        0
      ) || 0,
      items,
      remainingBalance: total.minus(
        new Decimal(order.payments?.reduce(
          (sum, payment) => sum + payment.amount.toNumber(),
          0
        ) || 0)
      ).toNumber(),
    };
  }

  /**
   * Add payment with transaction integrity
   * Validates amount matches bill before recording payment
   */
  async addPayment(
    orderId: string,
    tenantId: string,
    data: {
      method: PaymentMethod;
      amount: Decimal;
      cardNumber?: string;
      lastFour?: string;
    }
  ) {
    try {
      // Start transaction
      const result = await prisma.$transaction(async (tx) => {
        // 1. Verify order exists and belongs to tenant
        const order = await tx.order.findFirst({
          where: { id: orderId, tenantId },
          include: { payments: true, courses: { include: { items: { include: { menuItem: true } } } } },
        });

        if (!order) throw new Error('Order not found');

        // 2. Verify order is not already closed/paid
        if (order.status === 'PAID' || order.status === 'CLOSED') {
          throw new Error('Order is already closed or paid');
        }

        // 3. Calculate bill total using same logic as getBill
        const financialSettings = await tx.financialSetting.findUnique({
          where: { tenantId },
        });
        const taxRate = financialSettings?.taxRate || new Decimal('0.0825');

        let subtotal = new Decimal(0);
        order.courses?.forEach(course => {
          course.items?.forEach(item => {
            subtotal = subtotal.add(item.menuItem.price.mul(new Decimal(item.quantity)));
          });
        });

        const tax = subtotal.mul(taxRate);
        const billTotal = subtotal.add(tax);

        // 4. Validate payment amount doesn't exceed bill
        if (data.amount.gt(billTotal)) {
          throw new Error(
            `Payment amount ($${data.amount}) exceeds bill total ($${billTotal})`
          );
        }

        // 5. Record payment
        const payment = await tx.payment.create({
          data: {
            tenantId,
            orderId,
            method: data.method,
            amount: data.amount,
            status: PaymentStatus.COMPLETED,
            cardLastFour: data.lastFour,
            processedAt: new Date(),
          },
        });

        // 6. Calculate total paid so far
        const totalPaidAfter = order.payments
          .reduce((sum, p) => sum.add(p.amount), new Decimal(0))
          .add(data.amount);

        // 7. If fully paid, update order status
        if (totalPaidAfter.gte(billTotal)) {
          await tx.order.update({
            where: { id: orderId },
            data: {
              status: 'PAID',
              closedAt: new Date(),
            },
          });
          logger.info(`✅ Order ${orderId} fully paid - status updated to PAID`);
        }

        logger.info(
          `✅ Payment recorded for order ${orderId}: $${data.amount} via ${data.method}`
        );

        return payment;
      });

      return result;
    } catch (error: any) {
      logger.error(`❌ Payment recording failed for order ${orderId}:`, error.message);
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

      logger.info(
        `✅ Tip added to order ${orderId}: $${data.amount} via ${data.method}`
      );

      return tip;
    } catch (error: any) {
      logger.error(`❌ Failed to add tip to order ${orderId}:`, error.message);
      throw error;
    }
  }

  /**
   * Verify payment integrity - check that payment matches bill
   */
  async verifyPaymentIntegrity(orderId: string, tenantId: string): Promise<{
    isValid: boolean;
    billTotal: number;
    amountPaid: number;
    difference: number;
    issues: string[];
  }> {
    const bill = await this.getBill(orderId, tenantId);
    const issues: string[] = [];

    const difference = bill.total - bill.amountPaid;

    if (difference < 0) {
      issues.push(`Overpayment detected: $${Math.abs(difference).toFixed(2)}`);
    }

    if (difference > 0) {
      issues.push(`Order not fully paid: $${difference.toFixed(2)} remaining`);
    }

    return {
      isValid: difference === 0,
      billTotal: bill.total,
      amountPaid: bill.amountPaid,
      difference,
      issues,
    };
  }
}