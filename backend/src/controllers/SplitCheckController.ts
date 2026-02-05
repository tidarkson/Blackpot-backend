import { Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { SplitCheckService } from '../services/SplitCheckService';
import {
  createSplitSchema,
  splitPaymentSchema,
  orderIdSchema,
  splitIdSchema,
} from '../validators/split-check.validator';
import logger from '../config/logger';
import { AuthRequest } from '../types/auth';

const splitCheckService = new SplitCheckService();

export class SplitCheckController {
  /**
   * POST /api/orders/:orderId/split
   * Create a split bill for an order
   */
  static async createSplit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = orderIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      // Validate request body
      const body = createSplitSchema.parse(req.body);
      const { splitType, splitData } = body;

      logger.info(
        `Creating ${splitType} split for order ${orderId} by user ${req.user?.userId}`
      );

      let splits;

      // Calculate splits based on type
      switch (splitType) {
        case 'equal':
          splits = await splitCheckService.calculateEqualSplit(
            orderId,
            splitData.numPeople,
            tenantId
          );
          break;

        case 'item':
          splits = await splitCheckService.calculateItemSplit(
            orderId,
            splitData,
            tenantId
          );
          break;

        case 'custom':
          splits = await splitCheckService.calculateCustomSplit(
            orderId,
            splitData,
            tenantId
          );
          break;

        default:
          res.status(400).json({
            success: false,
            error: 'Invalid split type',
          });
          return;
      }

      // Create splits in database
      const createdSplits = await splitCheckService.createSplits(
        orderId,
        splits,
        splitType,
        tenantId
      );

      res.status(201).json({
        success: true,
        message: `${createdSplits.length} split bills created`,
        data: createdSplits,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/:orderId/splits
   * Get all splits for an order
   */
  static async getSplits(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = orderIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      logger.info(`Fetching splits for order ${orderId}`);

      const splits = await splitCheckService.getSplitsForOrder(orderId, tenantId);

      if (splits.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No splits found for this order',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Found ${splits.length} split bills`,
        data: splits,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/:orderId/splits/:splitId
   * Get single split bill details
   */
  static async getSplitBill(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = orderIdSchema.parse(req.params);
      const { splitId } = splitIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      logger.info(`Fetching split bill ${splitId} for order ${orderId}`);

      const split = await splitCheckService.getSplitById(splitId, tenantId);

      if (!split) {
        res.status(404).json({
          success: false,
          error: 'Split bill not found',
        });
        return;
      }

      // Include tip suggestions in response
      const tipSuggestions = [15, 18, 20].map((percent) => ({
        percent,
        amount: split.total.mul(percent).div(100).toFixed(2),
      }));

      res.status(200).json({
        success: true,
        data: {
          ...split,
          tipSuggestions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/splits/:splitId/pay
   * Record a payment against a split bill
   */
  static async paySplit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { splitId } = splitIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      // Validate request body
      const { splitPaymentId, amount, method, reference, cardLastFour } =
        splitPaymentSchema.parse(req.body);

      // Verify splitId matches splitPaymentId
      if (splitId !== splitPaymentId) {
        res.status(400).json({
          success: false,
          error: 'Split ID mismatch',
        });
        return;
      }

      logger.info(
        `Recording payment for split ${splitId}: $${amount.toFixed(2)} via ${method}`
      );

      const result = await splitCheckService.recordSplitPayment(
        splitId,
        amount,
        method as any,
        tenantId,
        reference,
        cardLastFour
      );

      res.status(200).json({
        success: true,
        message: 'Payment recorded successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/orders/:orderId/splits
   * Undo split (only if no payments made)
   */
  static async undoSplit(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = orderIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      logger.info(`Undoing split for order ${orderId}`);

      await splitCheckService.undoSplit(orderId, tenantId);

      res.status(200).json({
        success: true,
        message: 'Split bill removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/orders/:orderId/splits/:splitId/print
   * Get split bill formatted for printing
   */
  static async getSplitBillForPrint(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { orderId } = orderIdSchema.parse(req.params);
      const { splitId } = splitIdSchema.parse(req.params);
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized: Tenant not found',
        });
        return;
      }

      logger.info(`Fetching print-ready split bill ${splitId}`);

      const split = await splitCheckService.getSplitById(splitId, tenantId);

      if (!split) {
        res.status(404).json({
          success: false,
          error: 'Split bill not found',
        });
        return;
      }

      // Format for printing
      const printData = {
        billNumber: split.billNumber,
        personNumber: split.personNumber,
        items: split.items.map((item) => ({
          name: item.itemName,
          quantity: item.quantity,
          price: item.price.toFixed(2),
        })),
        subtotal: split.subtotal.toFixed(2),
        tax: split.tax.toFixed(2),
        total: split.total.toFixed(2),
        paid: split.paid.toFixed(2),
        remaining: split.remaining.toFixed(2),
        status: split.status,
        tipSuggestions: [15, 18, 20].map((percent) => ({
          percent: `${percent}%`,
          amount: split.total.mul(percent).div(100).toFixed(2),
        })),
        timestamp: new Date().toISOString(),
      };

      res.status(200).json({
        success: true,
        data: printData,
      });
    } catch (error) {
      next(error);
    }
  }
}
