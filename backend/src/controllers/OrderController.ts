import { Request, Response, NextFunction } from 'express';
import { OrderService } from '../services/OrderService';
import { AuthRequest } from '../types/auth';
import { ZodError } from 'zod';
import {
  createOrderSchema,
  updateOrderSchema,
  addCourseSchema,
  addItemToOrderSchema,
  updateOrderStatusSchema,
  listOrdersSchema,
  updateOrderItemSchema,
} from '../validators/order.validator';
import logger from '../config/logger';

export class OrderController {
  constructor(private orderService: OrderService) {}

  /**
   * Create a new order
   * POST /api/orders
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
   */
  async listOrders(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const queryParams = listOrdersSchema.parse(req.query);

      const { status, tableId, serverId, page, pageSize, startDate, endDate } = queryParams;

      const orders = await this.orderService.listOrders(tenantId, {
        status: status as any,
        tableId,
        serverId,
        page,
        pageSize,
        startDate,
        endDate,
      });

      logger.info('Orders listed', { tenantId, count: orders.data.length });
      res.json({
        success: true,
        data: orders.data,
        pagination: {
          page,
          pageSize,
          total: orders.total,
          totalPages: Math.ceil(orders.total / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get order by ID with full details
   * GET /api/orders/:orderId
   */
  async getOrderById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const order = await this.orderService.getOrderById(orderId, tenantId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
        });
      }

      logger.info('Order retrieved', { orderId, tenantId });
      res.json({
        success: true,
        data: order,
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
