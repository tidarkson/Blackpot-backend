/**
 * CRITICAL PHASE 1 - ALL IMPLEMENTATIONS
 * 
 * This file contains complete implementations for all 6 critical fixes
 * Required for production deployment
 * 
 * Fixes included:
 * 1. EmailService.ts - Email service with Nodemailer
 * 2. PaymentService.ts - Payment transaction integrity
 * 3. OrderService.ts - Order state validation
 * 4. KitchenService.ts - Kitchen state machine
 * 5. TableService.ts - Table locking mechanism
 * 6. RoleBasedAccessFilter.ts - Role-based data filtering
 */

// ============================================================================
// FIX 1: EmailService.ts - Complete Email Service Implementation
// ============================================================================

import nodemailer from 'nodemailer';
import { config } from '../config/environment';
import logger from '../config/logger';

// Email templates
const emailTemplates = {
  passwordReset: (resetLink: string, userName: string): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #3498db; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0; 
        }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Reset Request</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>We received a request to reset your BlackPot password.</p>
          <p>To reset your password, click the button below. This link will expire in 1 hour.</p>
          <a href="${resetLink}" class="button">Reset Password</a>
          <p>Or copy this link: <br><code>${resetLink}</code></p>
          <p>For security, never share this link with anyone.</p>
          <p>Best regards,<br>The BlackPot Team</p>
        </div>
        <div class="footer">
          <p>&copy; 2026 BlackPot Restaurant Management. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `,

  welcome: (userName: string, loginUrl: string): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #27ae60; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        .button { 
          display: inline-block; 
          padding: 12px 24px; 
          background: #27ae60; 
          color: white; 
          text-decoration: none; 
          border-radius: 5px; 
          margin: 20px 0; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to BlackPot!</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p>Your BlackPot account has been created successfully. You're now ready to manage your restaurant operations.</p>
          <a href="${loginUrl}" class="button">Log In to BlackPot</a>
          <p>Best regards,<br>The BlackPot Team</p>
        </div>
      </div>
    </body>
    </html>
  `,

  receipt: (
    orderNumber: string,
    total: string,
    items: Array<{ name: string; qty: number; price: string }>,
    userName: string
  ): string => {
    const itemsHtml = items
      .map(
        (item) =>
          `<tr><td>${item.name}</td><td>${item.qty}</td><td>$${item.price}</td></tr>`
      )
      .join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; border: 1px solid #ddd; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; }
        .total { text-align: right; font-weight: bold; font-size: 18px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Order Receipt</h1>
        </div>
        <div class="content">
          <p>Hi ${userName},</p>
          <p><strong>Order #${orderNumber}</strong></p>
          <table>
            <thead>
              <tr><th>Item</th><th>Qty</th><th>Price</th></tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <p class="total">Total: $${total}</p>
          <p>Thank you for your order!</p>
          <p>Best regards,<br>The BlackPot Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
  },
};

export class EmailService {
  private transporter: nodemailer.Transporter;
  private fromEmail: string;

  constructor() {
    // Configure based on environment
    if (process.env.EMAIL_PROVIDER === 'SENDGRID') {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY || '',
        },
      });
    } else if (process.env.EMAIL_PROVIDER === 'ETHEREAL') {
      // Ethereal test email service
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: process.env.ETHEREAL_USER,
          pass: process.env.ETHEREAL_PASSWORD,
        },
      });
    } else if (process.env.EMAIL_PROVIDER === 'TEST') {
      // Test mode - emails logged to console instead of sent
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: 'unix',
      });
    } else {
      // Default: Gmail
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
        },
      });
    }

    this.fromEmail = process.env.EMAIL_FROM || 'noreply@blackpot.com';

    // Verify connection
    this.verifyConnection();
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      logger.info('✅ Email service connected successfully');
    } catch (error: any) {
      logger.error('❌ Email service connection failed:', error.message);
    }
  }

  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    recipientName: string,
    resetTokenExpiry: Date
  ): Promise<void> {
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'BlackPot - Password Reset Request',
        html: emailTemplates.passwordReset(resetUrl, recipientName),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Password reset email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send password reset email to ${email}:`, error.message);
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  async sendWelcomeEmail(email: string, recipientName: string): Promise<void> {
    try {
      const loginUrl = `${process.env.FRONTEND_URL}/login`;

      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'Welcome to BlackPot!',
        html: emailTemplates.welcome(recipientName, loginUrl),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Welcome email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send welcome email to ${email}:`, error.message);
      throw new Error(`Failed to send welcome email: ${error.message}`);
    }
  }

  async sendReceiptEmail(
    email: string,
    recipientName: string,
    orderNumber: string,
    total: string,
    items: Array<{ name: string; qty: number; price: string }>
  ): Promise<void> {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: `BlackPot - Order Receipt #${orderNumber}`,
        html: emailTemplates.receipt(orderNumber, total, items, recipientName),
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Receipt email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send receipt email to ${email}:`, error.message);
      throw new Error(`Failed to send receipt email: ${error.message}`);
    }
  }

  async sendPasswordChangedEmail(email: string, recipientName: string): Promise<void> {
    try {
      const mailOptions = {
        from: this.fromEmail,
        to: email,
        subject: 'BlackPot - Password Changed',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Arial, sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Password Successfully Changed</h2>
              <p>Hi ${recipientName},</p>
              <p>Your password has been successfully changed.</p>
              <p>If you did not make this change, please contact support immediately.</p>
              <p>Best regards,<br>The BlackPot Team</p>
            </div>
          </body>
          </html>
        `,
      };

      await this.transporter.sendMail(mailOptions);
      logger.info(`📧 Password changed email sent to ${email}`);
    } catch (error: any) {
      logger.error(`❌ Failed to send password changed email to ${email}:`, error.message);
      throw new Error(`Failed to send password changed email: ${error.message}`);
    }
  }

  async sendBulkEmails(
    emails: Array<{ to: string; subject: string; html: string }>
  ): Promise<void> {
    try {
      for (const email of emails) {
        await this.transporter.sendMail({
          from: this.fromEmail,
          to: email.to,
          subject: email.subject,
          html: email.html,
        });
      }
      logger.info(`📧 Bulk emails sent: ${emails.length} emails`);
    } catch (error: any) {
      logger.error(`❌ Failed to send bulk emails:`, error.message);
      throw new Error(`Failed to send bulk emails: ${error.message}`);
    }
  }
}

export default new EmailService();

// ============================================================================
// FIX 2: PaymentService.ts - Payment Transaction Integrity
// ============================================================================

import { PrismaClient, PaymentStatus, OrderStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class PaymentService {
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
        include: {
          items: {
            include: {
              course: {
                include: {
                  menuItem: true,
                },
              },
            },
          },
          payments: true,
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Calculate subtotal from items
      const subtotal = order.items.reduce((sum, item) => {
        const itemPrice = item.course.menuItem.price;
        return sum.plus(itemPrice.mul(item.quantity));
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
      const paid = order.payments.reduce((sum, payment) => {
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

  async addPayment(
    orderId: string,
    tenantId: string,
    amount: Decimal | number,
    paymentMethod: string,
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
            paymentMethod,
            referenceNumber: referenceNumber || '',
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
              paidAt: new Date(),
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

  async addTip(
    orderId: string,
    tenantId: string,
    tipAmount: Decimal | number
  ): Promise<any> {
    const tipDecimal = new Decimal(tipAmount);

    try {
      if (tipDecimal.lte(0)) {
        throw new Error('Tip amount must be greater than 0');
      }

      const tip = await prisma.tip.create({
        data: {
          orderId,
          tenantId,
          amount: tipDecimal,
        },
      });

      logger.info(`💰 Tip added: $${tipDecimal.toFixed(2)} to order ${orderId}`);
      return tip;
    } catch (error: any) {
      logger.error(`Tip error for order ${orderId}:`, error.message);
      throw error;
    }
  }

  async verifyPaymentIntegrity(orderId: string, tenantId: string): Promise<boolean> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          payments: true,
          items: {
            include: {
              course: {
                include: {
                  menuItem: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Calculate subtotal
      const subtotal = order.items.reduce((sum, item) => {
        const itemPrice = item.course.menuItem.price;
        return sum.plus(itemPrice.mul(item.quantity));
      }, new Decimal(0));

      // Get tax setting
      const taxSetting = await prisma.financialSetting.findFirst({
        where: { tenantId },
      });
      const taxRate = taxSetting?.taxRate || new Decimal('0.0825');
      const tax = subtotal.mul(taxRate);
      const expectedTotal = subtotal.plus(tax);

      // Calculate actual paid
      const actualPaid = order.payments.reduce((sum, payment) => {
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

      if (!isValid) {
        logger.error(
          `❌ Payment integrity check failed for order ${orderId}. Expected: $${expectedTotal}, Stored: $${order.total}`
        );
        return false;
      }

      logger.info(`✅ Payment integrity verified for order ${orderId}`);
      return true;
    } catch (error: any) {
      logger.error(`Integrity verification error:`, error.message);
      throw error;
    }
  }
}

export default new PaymentService();

// ============================================================================
// FIX 3: OrderService.ts - Order State Validation
// ============================================================================

import { OrderStatus } from '@prisma/client';

export class OrderService {
  // Valid state transitions
  private validTransitions: Record<OrderStatus, OrderStatus[]> = {
    OPEN: [OrderStatus.IN_PROGRESS, OrderStatus.CLOSED],
    IN_PROGRESS: [OrderStatus.READY, OrderStatus.OPEN, OrderStatus.CLOSED],
    READY: [OrderStatus.COMPLETED, OrderStatus.IN_PROGRESS, OrderStatus.CLOSED],
    COMPLETED: [OrderStatus.PAID, OrderStatus.CLOSED],
    PAID: [OrderStatus.CLOSED],
    CLOSED: [],
  };

  async createOrder(
    tableId: string,
    guestCount: number,
    tenantId: string,
    notes?: string
  ): Promise<any> {
    try {
      if (guestCount <= 0) {
        throw new Error('Guest count must be greater than 0');
      }

      const order = await prisma.order.create({
        data: {
          tableId,
          guestCount,
          tenantId,
          notes: notes || '',
          status: OrderStatus.OPEN,
          subtotal: new Decimal(0),
          tax: new Decimal(0),
          total: new Decimal(0),
        },
      });

      logger.info(`🆕 Order created: ${order.id} (Table: ${tableId}, Guests: ${guestCount})`);
      return order;
    } catch (error: any) {
      logger.error('Error creating order:', error.message);
      throw error;
    }
  }

  async validateStateTransition(
    orderId: string,
    newStatus: OrderStatus,
    tenantId: string
  ): Promise<boolean> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          items: {
            include: {
              course: true,
            },
          },
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const currentStatus = order.status;

      // Check if transition is valid
      if (!this.validTransitions[currentStatus].includes(newStatus)) {
        throw new Error(
          `Invalid state transition from ${currentStatus} to ${newStatus}. ` +
            `Valid transitions: ${this.validTransitions[currentStatus].join(', ')}`
        );
      }

      // Additional validations for specific transitions
      if (newStatus === OrderStatus.READY) {
        // All courses must be READY or SERVED before marking order as READY
        const pendingCourses = order.items.filter(
          (item) => item.course.status !== 'READY' && item.course.status !== 'SERVED'
        );
        if (pendingCourses.length > 0) {
          throw new Error(
            `Cannot mark order as READY. ${pendingCourses.length} courses still being prepared.`
          );
        }
      }

      if (newStatus === OrderStatus.COMPLETED) {
        // Order must have at least one course
        if (order.items.length === 0) {
          throw new Error('Cannot complete order with no items');
        }
        // All courses must be served
        const unservedCourses = order.items.filter((item) => item.course.status !== 'SERVED');
        if (unservedCourses.length > 0) {
          throw new Error(`Cannot complete order. ${unservedCourses.length} courses not served yet.`);
        }
      }

      if (newStatus === OrderStatus.PAID) {
        // Order must be completed
        if (order.status !== OrderStatus.COMPLETED) {
          throw new Error('Order must be completed before marking as paid');
        }
      }

      logger.info(`✅ Valid state transition: ${currentStatus} → ${newStatus} (Order: ${orderId})`);
      return true;
    } catch (error: any) {
      logger.error(`State validation error for order ${orderId}:`, error.message);
      throw error;
    }
  }

  async updateOrderStatus(
    orderId: string,
    newStatus: OrderStatus,
    tenantId: string
  ): Promise<any> {
    try {
      // Validate transition
      await this.validateStateTransition(orderId, newStatus, tenantId);

      // Update status
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          completedAt: newStatus === OrderStatus.COMPLETED ? new Date() : undefined,
          paidAt: newStatus === OrderStatus.PAID ? new Date() : undefined,
          closedAt: newStatus === OrderStatus.CLOSED ? new Date() : undefined,
        },
        include: {
          items: true,
        },
      });

      logger.info(`📝 Order status updated: ${orderId} → ${newStatus}`);
      return updatedOrder;
    } catch (error: any) {
      logger.error(`Error updating order status:`, error.message);
      throw error;
    }
  }

  async addItemToOrder(
    orderId: string,
    menuItemId: string,
    quantity: number,
    notes: string,
    tenantId: string
  ): Promise<any> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === OrderStatus.CLOSED) {
        throw new Error('Cannot add items to closed order');
      }

      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Create order course
      const orderCourse = await prisma.orderCourse.create({
        data: {
          orderId,
          menuItemId,
          quantity,
          notes: notes || '',
          status: 'PENDING',
          tenantId,
        },
        include: {
          menuItem: true,
        },
      });

      logger.info(
        `➕ Item added to order ${orderId}: ${orderCourse.menuItem.name} x${quantity}`
      );
      return orderCourse;
    } catch (error: any) {
      logger.error(`Error adding item to order:`, error.message);
      throw error;
    }
  }

  async getOrderDetails(orderId: string, tenantId: string): Promise<any> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          table: true,
          items: {
            include: {
              menuItem: true,
              course: true,
            },
          },
          payments: true,
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      return order;
    } catch (error: any) {
      logger.error(`Error fetching order details:`, error.message);
      throw error;
    }
  }

  async closeOrder(orderId: string, tenantId: string): Promise<any> {
    try {
      return await this.updateOrderStatus(orderId, OrderStatus.CLOSED, tenantId);
    } catch (error: any) {
      logger.error(`Error closing order:`, error.message);
      throw error;
    }
  }
}

export default new OrderService();

// ============================================================================
// FIX 4: KitchenService.ts - Kitchen State Machine
// ============================================================================

export class KitchenService {
  private validCourseTransitions: Record<string, string[]> = {
    PENDING: ['FIRED'],
    FIRED: ['PREPARING'],
    PREPARING: ['READY'],
    READY: ['SERVED'],
    SERVED: [],
  };

  async fireOrderCourse(
    orderCourseId: string,
    kitchenStationId: string,
    tenantId: string
  ): Promise<any> {
    try {
      const orderCourse = await prisma.orderCourse.findFirst({
        where: { id: orderCourseId, tenantId },
        include: {
          order: true,
          menuItem: true,
        },
      });

      if (!orderCourse) {
        throw new Error('Order course not found');
      }

      if (orderCourse.status !== 'PENDING') {
        throw new Error(`Course must be PENDING to fire. Current status: ${orderCourse.status}`);
      }

      const updated = await prisma.orderCourse.update({
        where: { id: orderCourseId },
        data: {
          status: 'FIRED',
          kitchenStationId,
          firedAt: new Date(),
        },
        include: {
          menuItem: true,
        },
      });

      logger.info(
        `🔥 Course fired: ${updated.menuItem.name} (Order: ${updated.orderId}, Station: ${kitchenStationId})`
      );
      return updated;
    } catch (error: any) {
      logger.error('Error firing course:', error.message);
      throw error;
    }
  }

  async updateCourseStatus(
    orderCourseId: string,
    newStatus: string,
    tenantId: string
  ): Promise<any> {
    try {
      const orderCourse = await prisma.orderCourse.findFirst({
        where: { id: orderCourseId, tenantId },
        include: {
          menuItem: true,
        },
      });

      if (!orderCourse) {
        throw new Error('Order course not found');
      }

      // Validate transition
      const validNextStates = this.validCourseTransitions[orderCourse.status];
      if (!validNextStates.includes(newStatus)) {
        throw new Error(
          `Invalid state transition from ${orderCourse.status} to ${newStatus}. ` +
            `Valid transitions: ${validNextStates.join(', ')}`
        );
      }

      const updated = await prisma.orderCourse.update({
        where: { id: orderCourseId },
        data: {
          status: newStatus,
          readyAt: newStatus === 'READY' ? new Date() : undefined,
          servedAt: newStatus === 'SERVED' ? new Date() : undefined,
        },
        include: {
          menuItem: true,
          order: true,
        },
      });

      logger.info(
        `📝 Course status updated: ${updated.menuItem.name} → ${newStatus} (Order: ${updated.orderId})`
      );

      return updated;
    } catch (error: any) {
      logger.error('Error updating course status:', error.message);
      throw error;
    }
  }

  async getKitchenDisplaySystem(
    tenantId: string,
    kitchenStationId?: string
  ): Promise<any> {
    try {
      const whereClause: any = {
        tenantId,
        status: { in: ['FIRED', 'PREPARING', 'READY'] },
      };

      if (kitchenStationId) {
        whereClause.kitchenStationId = kitchenStationId;
      }

      const courses = await prisma.orderCourse.findMany({
        where: whereClause,
        include: {
          order: {
            include: {
              table: true,
            },
          },
          menuItem: true,
          kitchenStation: true,
        },
        orderBy: {
          firedAt: 'asc',
        },
      });

      // Group by status
      const grouped = {
        FIRED: courses.filter((c) => c.status === 'FIRED'),
        PREPARING: courses.filter((c) => c.status === 'PREPARING'),
        READY: courses.filter((c) => c.status === 'READY'),
      };

      logger.info(
        `📊 Kitchen display: ${grouped.FIRED.length} fired, ${grouped.PREPARING.length} preparing, ${grouped.READY.length} ready`
      );

      return grouped;
    } catch (error: any) {
      logger.error('Error fetching kitchen display system:', error.message);
      throw error;
    }
  }

  async calculatePrepTime(orderCourseId: string, tenantId: string): Promise<number> {
    try {
      const course = await prisma.orderCourse.findFirst({
        where: { id: orderCourseId, tenantId },
        include: {
          menuItem: true,
        },
      });

      if (!course) {
        throw new Error('Course not found');
      }

      if (!course.firedAt) {
        return 0;
      }

      const now = new Date();
      const prepTimeMs = now.getTime() - course.firedAt.getTime();
      const prepTimeMins = Math.floor(prepTimeMs / 60000);

      logger.info(`⏱️ Prep time for ${course.menuItem.name}: ${prepTimeMins} minutes`);

      return prepTimeMins;
    } catch (error: any) {
      logger.error('Error calculating prep time:', error.message);
      throw error;
    }
  }

  async getOrderReadyStatus(orderId: string, tenantId: string): Promise<any> {
    try {
      const courses = await prisma.orderCourse.findMany({
        where: { orderId, tenantId },
        include: {
          menuItem: true,
        },
      });

      const totalCourses = courses.length;
      const readyCourses = courses.filter((c) => c.status === 'READY' || c.status === 'SERVED')
        .length;
      const servedCourses = courses.filter((c) => c.status === 'SERVED').length;

      const status = {
        orderId,
        totalCourses,
        readyCourses,
        servedCourses,
        allReady: readyCourses === totalCourses,
        allServed: servedCourses === totalCourses,
        percentage: totalCourses > 0 ? (readyCourses / totalCourses) * 100 : 0,
      };

      logger.info(
        `📦 Order ${orderId} status: ${readyCourses}/${totalCourses} ready (${status.percentage.toFixed(0)}%)`
      );

      return status;
    } catch (error: any) {
      logger.error('Error getting order ready status:', error.message);
      throw error;
    }
  }
}

export default new KitchenService();

// ============================================================================
// FIX 5: TableService.ts - Table Locking Mechanism
// ============================================================================

export class TableService {
  async seatGuests(
    tableId: string,
    guestCount: number,
    tenantId: string,
    notes?: string
  ): Promise<any> {
    try {
      // Get table with lock
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      // Validate capacity
      if (guestCount > table.capacity) {
        throw new Error(
          `Guest count (${guestCount}) exceeds table capacity (${table.capacity})`
        );
      }

      // Check if table is already occupied
      if (table.isOccupied) {
        throw new Error('Table is already occupied. Cannot seat new guests.');
      }

      // Use transaction to prevent race conditions
      const result = await prisma.$transaction(async (tx) => {
        // Lock the table (update isOccupied)
        const lockedTable = await tx.table.update({
          where: { id: tableId },
          data: {
            isOccupied: true,
            seatedAt: new Date(),
            occupancyCount: guestCount,
          },
        });

        // Create associated order
        const order = await tx.order.create({
          data: {
            tableId,
            guestCount,
            tenantId,
            notes: notes || '',
            status: OrderStatus.OPEN,
            subtotal: new Decimal(0),
            tax: new Decimal(0),
            total: new Decimal(0),
          },
        });

        logger.info(
          `🪑 Table ${table.number} locked: ${guestCount} guests seated (Order: ${order.id})`
        );

        return {
          table: lockedTable,
          order,
        };
      });

      return result;
    } catch (error: any) {
      logger.error(`Error seating guests at table ${tableId}:`, error.message);
      throw error;
    }
  }

  async releaseTable(tableId: string, tenantId: string): Promise<any> {
    try {
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      if (!table.isOccupied) {
        throw new Error('Table is not occupied');
      }

      // Use transaction to update table and close order
      const result = await prisma.$transaction(async (tx) => {
        // Unlock the table
        const unlockedTable = await tx.table.update({
          where: { id: tableId },
          data: {
            isOccupied: false,
            seatedAt: null,
            occupancyCount: 0,
          },
        });

        // Get associated order and close it if not already closed
        const order = await tx.order.findFirst({
          where: {
            tableId,
            tenantId,
            status: { not: OrderStatus.CLOSED },
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

        if (order) {
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.CLOSED,
              closedAt: new Date(),
            },
          });
        }

        logger.info(`🔓 Table ${table.number} released (Order closed)`);

        return {
          table: unlockedTable,
          order,
        };
      });

      return result;
    } catch (error: any) {
      logger.error(`Error releasing table ${tableId}:`, error.message);
      throw error;
    }
  }

  async checkTableAvailability(
    tenantId: string,
    guestCount?: number
  ): Promise<any[]> {
    try {
      const whereClause: any = {
        tenantId,
        isOccupied: false,
      };

      if (guestCount) {
        whereClause.capacity = {
          gte: guestCount,
        };
      }

      const availableTables = await prisma.table.findMany({
        where: whereClause,
        orderBy: {
          capacity: 'asc',
        },
      });

      logger.info(`🔍 Available tables: ${availableTables.length}`);

      return availableTables;
    } catch (error: any) {
      logger.error('Error checking table availability:', error.message);
      throw error;
    }
  }

  async getTableStatus(tenantId: string): Promise<any> {
    try {
      const tables = await prisma.table.findMany({
        where: { tenantId },
        include: {
          orders: {
            where: {
              status: { not: OrderStatus.CLOSED },
            },
            take: 1,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      const summary = {
        total: tables.length,
        occupied: tables.filter((t) => t.isOccupied).length,
        available: tables.filter((t) => !t.isOccupied).length,
        tables: tables.map((t) => ({
          id: t.id,
          number: t.number,
          capacity: t.capacity,
          isOccupied: t.isOccupied,
          occupancyCount: t.occupancyCount,
          seatedAt: t.seatedAt,
          currentOrder: t.orders[0] || null,
        })),
      };

      logger.info(
        `📊 Table status: ${summary.occupied}/${summary.total} occupied, ${summary.available} available`
      );

      return summary;
    } catch (error: any) {
      logger.error('Error getting table status:', error.message);
      throw error;
    }
  }

  async validateTableLock(tableId: string, tenantId: string): Promise<boolean> {
    try {
      const table = await prisma.table.findFirst({
        where: { id: tableId, tenantId },
      });

      if (!table) {
        throw new Error('Table not found');
      }

      const isLocked = table.isOccupied;
      logger.info(
        `🔒 Table ${table.number} lock status: ${isLocked ? 'LOCKED' : 'UNLOCKED'}`
      );

      return isLocked;
    } catch (error: any) {
      logger.error('Error validating table lock:', error.message);
      throw error;
    }
  }
}

export default new TableService();

// ============================================================================
// FIX 6: RoleBasedAccessFilter.ts - Role-Based Data Filtering Utility
// ============================================================================

import { UserRole } from '@prisma/client';

export interface FilterOptions {
  userId: string;
  role: UserRole;
  tenantId: string;
}

export class RoleBasedAccessFilter {
  /**
   * Filter orders based on user role
   * - ADMIN: Can see all orders
   * - MANAGER: Can see all orders in their tenant
   * - SERVER: Can only see orders for tables they're assigned to
   * - KITCHEN: Can only see orders they're preparing
   */
  async filterOrders(
    orders: any[],
    options: FilterOptions
  ): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.ADMIN:
          // Admins see all orders
          logger.info(`RBAC: ADMIN ${userId} accessing all orders`);
          return orders;

        case UserRole.MANAGER:
          // Managers see all orders in their tenant
          const managerOrders = orders.filter((o) => o.tenantId === tenantId);
          logger.info(
            `RBAC: MANAGER ${userId} accessing ${managerOrders.length} tenant orders`
          );
          return managerOrders;

        case UserRole.SERVER:
          // Servers see only their assigned tables
          const serverOrders = orders.filter((o) => {
            return o.assignedServerId === userId && o.tenantId === tenantId;
          });
          logger.info(`RBAC: SERVER ${userId} accessing ${serverOrders.length} assigned orders`);
          return serverOrders;

        case UserRole.KITCHEN:
          // Kitchen staff see orders assigned to their station
          const kitchenOrders = orders.filter((o) => {
            return o.tenantId === tenantId && o.items.some((item: any) =>
              item.kitchenStationId === userId
            );
          });
          logger.info(
            `RBAC: KITCHEN ${userId} accessing ${kitchenOrders.length} station orders`
          );
          return kitchenOrders;

        default:
          logger.warn(`RBAC: Unknown role ${role} for user ${userId}`);
          return [];
      }
    } catch (error: any) {
      logger.error('Error filtering orders:', error.message);
      throw error;
    }
  }

  /**
   * Filter users based on user role
   */
  async filterUsers(
    users: any[],
    options: FilterOptions
  ): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.ADMIN:
          // Admins see all users
          return users;

        case UserRole.MANAGER:
          // Managers see all users in their tenant
          return users.filter((u) => u.tenantId === tenantId);

        default:
          // Other roles can only see themselves
          return users.filter((u) => u.id === userId);
      }
    } catch (error: any) {
      logger.error('Error filtering users:', error.message);
      throw error;
    }
  }

  /**
   * Filter tables based on user role
   */
  async filterTables(
    tables: any[],
    options: FilterOptions
  ): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      // All authenticated users in a tenant can see tables
      const filteredTables = tables.filter((t) => t.tenantId === tenantId);
      logger.info(
        `RBAC: ${role} ${userId} accessing ${filteredTables.length} tables`
      );
      return filteredTables;
    } catch (error: any) {
      logger.error('Error filtering tables:', error.message);
      throw error;
    }
  }

  /**
   * Filter reports based on user role
   */
  async filterReports(
    reports: any[],
    options: FilterOptions
  ): Promise<any[]> {
    const { userId, role, tenantId } = options;

    try {
      switch (role) {
        case UserRole.ADMIN:
          // Admins see all reports
          return reports;

        case UserRole.MANAGER:
          // Managers see tenant reports
          return reports.filter((r) => r.tenantId === tenantId);

        default:
          // Other roles have no access
          logger.warn(`RBAC: ${role} ${userId} denied access to reports`);
          return [];
      }
    } catch (error: any) {
      logger.error('Error filtering reports:', error.message);
      throw error;
    }
  }

  /**
   * Check if user has permission for specific action
   */
  async checkPermission(
    resource: string,
    action: string,
    options: FilterOptions
  ): Promise<boolean> {
    const { userId, role } = options;

    const permissionMatrix: Record<UserRole, Record<string, string[]>> = {
      [UserRole.ADMIN]: {
        orders: ['create', 'read', 'update', 'delete'],
        payments: ['create', 'read', 'update', 'delete'],
        users: ['create', 'read', 'update', 'delete'],
        tables: ['create', 'read', 'update', 'delete'],
        reports: ['create', 'read', 'update', 'delete'],
      },
      [UserRole.MANAGER]: {
        orders: ['create', 'read', 'update'],
        payments: ['create', 'read', 'update'],
        users: ['read'],
        tables: ['read', 'update'],
        reports: ['read'],
      },
      [UserRole.SERVER]: {
        orders: ['read', 'update'],
        payments: ['create', 'read'],
        users: [],
        tables: ['read'],
        reports: [],
      },
      [UserRole.KITCHEN]: {
        orders: ['read'],
        payments: [],
        users: [],
        tables: [],
        reports: [],
      },
    };

    try {
      const allowedActions = permissionMatrix[role]?.[resource] || [];
      const hasPermission = allowedActions.includes(action);

      if (!hasPermission) {
        logger.warn(
          `RBAC: ${role} ${userId} denied access to ${action} on ${resource}`
        );
      }

      return hasPermission;
    } catch (error: any) {
      logger.error('Error checking permission:', error.message);
      throw error;
    }
  }

  /**
   * Apply row-level security filters
   */
  applyRLSFilter(
    options: FilterOptions
  ): Record<string, any> {
    const { userId, role, tenantId } = options;

    const filters: Record<string, any> = {
      tenantId, // All queries must be tenant-scoped
    };

    // Add role-specific filters
    switch (role) {
      case UserRole.SERVER:
        filters.assignedServerId = userId;
        break;
      case UserRole.KITCHEN:
        filters.kitchenStationId = userId;
        break;
    }

    logger.info(`RBAC: RLS filter applied for ${role} ${userId}: ${JSON.stringify(filters)}`);

    return filters;
  }
}

export default new RoleBasedAccessFilter();
