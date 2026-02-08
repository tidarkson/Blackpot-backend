import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../services/PaymentService';
import { AuthRequest } from '../types/auth';
import { ZodError } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  /**
   * Charge a customer for an order
   * POST /api/payments/charge
   */
  async chargePayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId, amount, paymentMethod, referenceNumber } = req.body;

      if (!orderId || amount === undefined || !paymentMethod) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: orderId, amount, paymentMethod',
        });
      }

      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Amount must be a positive number',
        });
      }

      const payment = await this.paymentService.processPayment(
        orderId,
        tenantId,
        new Decimal(amount),
        paymentMethod,
        referenceNumber
      );

      logger.info('Payment processed', { orderId, amount, paymentMethod, tenantId });

      res.status(201).json({
        success: true,
        data: payment,
      });
    } catch (error: any) {
      if (error.message.includes('insufficient funds') || error.message.includes('declined')) {
        return res.status(402).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * Refund a payment
   * POST /api/payments/refund
   */
  async refundPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { paymentId, amount, reason } = req.body;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: paymentId',
        });
      }

      const refund = await this.paymentService.refundPayment(
        paymentId,
        tenantId,
        amount ? new Decimal(amount) : undefined,
        reason
      );

      logger.info('Payment refunded', { paymentId, amount, tenantId });

      res.status(200).json({
        success: true,
        data: refund,
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
      if (error.message.includes('already refunded')) {
        return res.status(409).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * Split payment between multiple cards
   * POST /api/payments/split
   */
  async splitPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId, splits } = req.body;

      if (!orderId || !splits || !Array.isArray(splits)) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: orderId, splits (array)',
        });
      }

      const splitPayments = await this.paymentService.splitPayment(orderId, tenantId, splits);

      logger.info('Payment split', { orderId, splitCount: splits.length, tenantId });

      res.status(201).json({
        success: true,
        data: splitPayments,
      });
    } catch (error: any) {
      if (error.message.includes('must equal')) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * Capture pre-authorized payment
   * POST /api/payments/capture
   */
  async capturePreAuth(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { paymentId } = req.body;

      if (!paymentId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: paymentId',
        });
      }

      const captured = await this.paymentService.capturePreAuth(paymentId, tenantId);

      logger.info('Payment captured', { paymentId, tenantId });

      res.status(200).json({
        success: true,
        data: captured,
      });
    } catch (error: any) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }
      next(error);
    }
  }

  /**
   * Get transaction history for an order or all
   * GET /api/payments/history?orderId=xxx&startDate=xxx&endDate=xxx&status=xxx
   */
  async getTransactionHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId, startDate, endDate, status } = req.query;

      const filters = {
        orderId: orderId as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        status: status as string | undefined,
      };

      const history = await this.paymentService.getTransactionHistory(tenantId, filters);

      logger.info('Transaction history retrieved', { tenantId, count: history.length });

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get bill for an order
   * GET /api/payments/bill/:orderId
   */
  async getBill(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const bill = await this.paymentService.getBill(orderId, tenantId);

      res.json({
        success: true,
        data: bill,
      });
    } catch (error) {
      next(error);
    }
  }
}
