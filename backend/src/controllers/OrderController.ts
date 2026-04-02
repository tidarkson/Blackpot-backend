import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/OrderService';
import cacheService, { CACHE_TTL } from '../services/CacheService';
import cacheInvalidationService from '../services/cacheInvalidation.service';
import CacheKeyGenerator, { CACHE_KEY_PATTERNS } from '../utils/cacheKeyGenerator';
import { AuthRequest } from '../types/auth';
import { ZodError } from 'zod';
import {
  createOrderSchema,
  updateOrderSchema,
  addCourseSchema,
  addItemToOrderSchema,
  updateOrderStatusSchema,
  forceCloseOrderSchema,
  listOrdersSchema,
  updateOrderItemSchema,
} from '../validators/order.validator';
import logger from '../config/logger';

export class OrderController {
  constructor(private orderService: OrderService) {}

  /**
   * Create a new order
   * POST /api/orders
   * Invalidates: Order list, dashboard caches
   */
  async createOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const userId = req.userId!;

      const validatedData = createOrderSchema.parse(req.body);
      const { tableId, serverId, guestCount } = validatedData;

      const order = await this.orderService.createOrder(
        tenantId,
        tableId,
        serverId,
        guestCount,
        userId
      );

      // Invalidate order caches
      await cacheInvalidationService.invalidateOrderCache(tenantId);

      logger.info('Order created', { orderId: order.id, tenantId });
      res.status(201).json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List all orders with optional filters
   * GET /api/orders?status=OPEN&tableId=xxx&page=1
   * Cached: 30 second TTL
   */
  async listOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const queryParams = listOrdersSchema.parse(req.query);

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      const { status, tableId, serverId, page, pageSize, startDate, endDate } = queryParams;

      // Generate cache key
      const cacheKey = CACHE_KEY_PATTERNS.ORDERS_LIST(tenantId, page || 1, {
        status,
        tableId,
        serverId,
      });

      // Try to get from cache
      if (!bypassCache && !forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.debug(`✅ Orders list cache HIT for tenant ${tenantId}`);
          const cachedData = cached as any;
          return res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${CACHE_TTL.RECENT_ORDERS}`)
            .json({
              success: true,
              data: cachedData.data,
              pagination: cachedData.pagination,
              _cache: 'HIT',
            });
        }
      }

      // Cache miss - fetch from database
      logger.debug(`❌ Orders list cache MISS for tenant ${tenantId}`);
      const orders = await this.orderService.listOrders(tenantId, {
        status: status as any,
        tableId,
        serverId,
        page,
        pageSize,
        startDate,
        endDate,
      });

      const response = {
        data: orders.data,
        pagination: {
          page,
          pageSize,
          total: orders.total,
          totalPages: Math.ceil(orders.total / pageSize),
        },
      };

      // Cache the result (30 second TTL)
      await cacheService.set(cacheKey, response, CACHE_TTL.RECENT_ORDERS);

      logger.info('Orders listed', { tenantId, count: orders.data.length });
      return res
        .set('X-Cache', 'MISS')
        .set('Cache-Control', `public, max-age=${CACHE_TTL.RECENT_ORDERS}`)
        .json({
          success: true,
          data: orders.data,
          pagination: response.pagination,
          _cache: 'MISS',
        });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order by ID with full details
   * GET /api/orders/:orderId
   * Cached: 30 second TTL
   */
  async getOrderById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      // Generate cache key
      const cacheKey = CACHE_KEY_PATTERNS.ORDER_DETAIL(tenantId, orderId);

      // Try to get from cache
      if (!bypassCache && !forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.debug(`✅ Order detail cache HIT for ${orderId}`);
          return res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${CACHE_TTL.RECENT_ORDERS}`)
            .json({
              success: true,
              data: cached,
              _cache: 'HIT',
            });
        }
      }

      // Cache miss - fetch from database
      logger.debug(`❌ Order detail cache MISS for ${orderId}`);
      const order = await this.orderService.getOrderById(orderId, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      // Cache the result
      await cacheService.set(cacheKey, order, CACHE_TTL.RECENT_ORDERS);

      logger.info('Order retrieved', { orderId, tenantId });
      return res
        .set('X-Cache', 'MISS')
        .set('Cache-Control', `public, max-age=${CACHE_TTL.RECENT_ORDERS}`)
        .json({
          success: true,
          data: order,
          _cache: 'MISS',
        });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get detailed order information
   * GET /api/orders/:orderId/details
   */
  async getOrderDetails(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const order = await this.orderService.getOrderDetails(orderId, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      logger.info('Order details retrieved', { orderId, tenantId });
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order details
   * PUT /api/orders/:orderId
   * Invalidates: Order cache and order list cache
   */
  async updateOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const validatedData = updateOrderSchema.parse(req.body);

      const order = await this.orderService.updateOrder(orderId, tenantId, validatedData);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      // Invalidate order caches
      await cacheInvalidationService.invalidateOrderCache(tenantId, orderId);

      logger.info('Order updated', { orderId, tenantId });
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update order status
   * PATCH /api/orders/:orderId/status
   * Invalidates: Order cache, order list, and dashboard caches
   */
  async updateOrderStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const validatedData = updateOrderStatusSchema.parse(req.body);
      const { status } = validatedData;

      const order = await this.orderService.updateOrderStatus(orderId, status as any, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      // Invalidate order caches
      await cacheInvalidationService.invalidateOrderCache(tenantId, orderId);

      logger.info('Order status updated', { orderId, status, tenantId });
      res.json({
        success: true,
        data: order,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Close an order (prepare for payment)
   * PATCH /api/orders/:orderId/close
   */
  async closeOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const order = await this.orderService.closeOrder(orderId, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      logger.info('Order closed', { orderId, tenantId });
      res.json({
        success: true,
        data: order,
        message: 'Order ready for payment',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Force-close an order (manager/owner override)
   * POST /api/orders/:orderId/force-close
   */
  async forceCloseOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const managerUserId = req.userId!;
      const { orderId } = req.params;

      const validatedData = forceCloseOrderSchema.parse(req.body);
      const { reason } = validatedData;

      const order = await this.orderService.forceCloseOrder(orderId, tenantId, reason, managerUserId);

      // Invalidate order caches
      await cacheInvalidationService.invalidateOrderCache(tenantId, orderId);

      logger.warn('Order force-closed', { orderId, tenantId, managerUserId, reason });
      res.json({
        success: true,
        data: order,
        message: 'Order force-closed by manager override',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cancel an order
   * DELETE /api/orders/:orderId
   */
  async cancelOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const order = await this.orderService.cancelOrder(orderId, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      logger.info('Order cancelled', { orderId, tenantId });
      res.json({
        success: true,
        data: order,
        message: 'Order cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a course to an order
   * POST /api/orders/:orderId/courses
   */
  async addCourse(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const validatedData = addCourseSchema.parse(req.body);
      const { courseType, kitchenStationId } = validatedData;

      const course = await this.orderService.addCourse(
        orderId,
        tenantId,
        courseType as 'APPETIZER' | 'MAIN' | 'DESSERT' | 'BEVERAGE',
        kitchenStationId
      );

      logger.info('Course added to order', { orderId, courseType, tenantId });
      res.status(201).json({
        success: true,
        data: course,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add an item to a course
   * POST /api/orders/:orderId/items
   */
  async addItemToOrder(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const validatedData = addItemToOrderSchema.parse(req.body);
      const { courseId, menuItemId, quantity, notes } = validatedData;

      const item = await this.orderService.addItemToOrder(
        orderId,
        courseId,
        menuItemId,
        quantity,
        notes || '',
        tenantId
      );

      logger.info('Item added to order', { orderId, menuItemId, quantity, tenantId });
      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update an order item
   * PUT /api/orders/:orderId/items/:itemId
   */
  async updateOrderItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId, itemId } = req.params;

      const validatedData = updateOrderItemSchema.parse(req.body);

      const item = await this.orderService.updateOrderItem(itemId, tenantId, validatedData);

      if (!item) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Order item updated', { itemId, tenantId });
      res.json({
        success: true,
        data: item,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove an item from an order
   * DELETE /api/orders/:orderId/items/:itemId
   */
  async removeOrderItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId, itemId } = req.params;

      const result = await this.orderService.removeOrderItem(itemId, tenantId);

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
      }

      logger.info('Order item removed', { itemId, tenantId });
      res.json({
        success: true,
        message: 'Order item removed successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get orders by table
   * GET /api/tables/:tableId/orders
   */
  async getOrdersByTable(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { tableId } = req.params;

      const orders = await this.orderService.getOrdersByTable(tableId, tenantId);

      logger.info('Orders by table retrieved', { tableId, tenantId, count: orders.length });
      res.json({
        success: true,
        data: orders,
      });
    } catch (error) {
      next(error);
    }
  }
}
