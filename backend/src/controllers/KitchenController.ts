import { Request, Response, NextFunction } from 'express';
import { KitchenService } from '../services/KitchenService';
import { AuthRequest } from '../types/auth';
import { z } from 'zod';
import logger from '../config/logger';
import { socketService } from '../services/SocketService';

export class KitchenController {
  constructor(private kitchenService: KitchenService) {}

  /**
   * Get all pending orders for the kitchen
   * GET /api/kitchen/orders
   */
  async getPendingOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;

      const orders = await this.kitchenService.getPendingOrders(tenantId);

      logger.info('Pending orders retrieved', { tenantId, count: orders.length });
      res.json({
        success: true,
        data: orders,
        count: orders.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get orders for a specific kitchen station
   * GET /api/kitchen/stations/:stationId/orders
   */
  async getOrdersByStation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const stationId = typeof req.params.stationId === 'string' ? req.params.stationId : req.params.stationId[0];
      const status = typeof req.query.status === 'string' ? (req.query.status as string) : undefined;

      const orders = await this.kitchenService.getOrdersByStation(
        stationId,
        tenantId
      );

      logger.info('Station orders retrieved', { stationId, tenantId, count: orders.length });
      res.json({
        success: true,
        data: orders,
        count: orders.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get the kitchen display system view
   * GET /api/kitchen/display
   */
  async getKitchenDisplaySystem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { stationId } = req.query;

      const kds = await this.kitchenService.getKitchenDisplaySystem(
        tenantId,
        (stationId as string) || undefined
      );

      logger.info('KDS view retrieved', { tenantId, stationId });
      res.json({
        success: true,
        data: kds,
        counts: {
          pending: kds.pending?.length || 0,
          prepared: kds.prepared?.length || 0,
          served: kds.served?.length || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Start preparing an order item (fire item)
   * PATCH /api/kitchen/items/:itemId/fire
   */
  async fireOrderItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { itemId } = req.params;

      const item = await this.kitchenService.fireOrderItem(itemId, tenantId);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Order item fired', { itemId, tenantId });
      socketService.emitKitchenAlert(tenantId, {
        type: 'kitchen:item_fired',
        itemId,
        orderId: item.orderCourse?.orderId,
        item,
      });
      res.json({
        success: true,
        data: item,
        message: 'Item preparation started',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark an item as prepared
   * PATCH /api/kitchen/items/:itemId/complete
   */
  async completeItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { itemId } = req.params;

      const item = await this.kitchenService.completeItem(itemId, tenantId);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Order item completed', { itemId, tenantId });
      socketService.emitKitchenAlert(tenantId, {
        type: 'kitchen:item_completed',
        itemId,
        orderId: item.orderCourse?.orderId,
        item,
      });
      res.json({
        success: true,
        data: item,
        message: 'Item preparation completed',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark an item as served
   * PATCH /api/kitchen/items/:itemId/serve
   */
  async serveItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { itemId } = req.params;

      const item = await this.kitchenService.serveItem(itemId, tenantId);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Order item served', { itemId, tenantId });
      socketService.emitTableStatusChanged(
        tenantId,
        item.orderCourse?.order?.tableId || 'unknown',
        'ITEM_SERVED',
        {
          itemId,
          orderId: item.orderCourse?.orderId,
          item,
        }
      );
      res.json({
        success: true,
        data: item,
        message: 'Item marked as served',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order ready status
   * GET /api/kitchen/orders/:orderId/status
   */
  async getOrderReadyStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const status = await this.kitchenService.getOrderReadyStatus(orderId, tenantId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      logger.info('Order ready status retrieved', { orderId, tenantId });
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get kitchen metrics
   * GET /api/kitchen/metrics
   */
  async getKitchenMetrics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;

      const metrics = await this.kitchenService.getKitchenMetrics(tenantId);

      logger.info('Kitchen metrics retrieved', { tenantId });
      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all items by status
   * GET /api/kitchen/items?status=PENDING
   */
  async getItemsByStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { status, stationId, limit } = req.query;

      if (!status || !['PENDING', 'PREPARED', 'SERVED'].includes(status as string)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid status filter',
        });
      }

      const items = await this.kitchenService.getItemsByStatus(
        tenantId,
        status as string,
        stationId ? (stationId as string) : undefined,
        limit ? parseInt(limit as string) : 50
      );

      logger.info('Items by status retrieved', { tenantId, status, count: items.length });
      res.json({
        success: true,
        data: items,
        count: items.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calculate prep time for an item
   * GET /api/kitchen/items/:itemId/preptime
   */
  async calculatePrepTime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { itemId } = req.params;

      const prepTime = await this.kitchenService.calculatePrepTime(itemId, tenantId);

      if (prepTime === null) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Prep time calculated', { itemId, tenantId, minutes: prepTime });
      res.json({
        success: true,
        data: {
          itemId,
          prepTimeMinutes: prepTime,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
