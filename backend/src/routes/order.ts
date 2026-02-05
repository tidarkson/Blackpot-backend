import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { OrderController } from '../controllers/OrderController';
import { SpecialRequestController } from '../controllers/SpecialRequestController';
import { OrderService } from '../services/OrderService';
import { SpecialRequestService } from '../services/SpecialRequestService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const orderService = new OrderService(prisma);
const specialRequestService = new SpecialRequestService(prisma);
const orderController = new OrderController(orderService);
const specialRequestController = new SpecialRequestController(specialRequestService);

// Middleware to bind 'this' context
const bindController = (method: Function) => {
  return method.bind(orderController);
};

const bindSpecialRequestController = (method: Function) => {
  return method.bind(specialRequestController);
};

/**
 * CREATE ORDER
 * POST /api/orders
 */
router.post('/', authenticate, bindController(orderController.createOrder));

/**
 * LIST ORDERS
 * GET /api/orders?status=OPEN&page=1&pageSize=10
 */
router.get('/', authenticate, bindController(orderController.listOrders));

/**
 * GET ORDER BY ID
 * GET /api/orders/:orderId
 */
router.get('/:orderId', authenticate, bindController(orderController.getOrderById));

/**
 * GET ORDER DETAILS
 * GET /api/orders/:orderId/details
 */
router.get('/:orderId/details', authenticate, bindController(orderController.getOrderDetails));

/**
 * UPDATE ORDER
 * PUT /api/orders/:orderId
 */
router.put('/:orderId', authenticate, bindController(orderController.updateOrder));

/**
 * UPDATE ORDER STATUS
 * PATCH /api/orders/:orderId/status
 */
router.patch('/:orderId/status', authenticate, bindController(orderController.updateOrderStatus));

/**
 * CLOSE ORDER (Prepare for payment)
 * PATCH /api/orders/:orderId/close
 */
router.patch('/:orderId/close', authenticate, bindController(orderController.closeOrder));

/**
 * CANCEL ORDER
 * DELETE /api/orders/:orderId
 */
router.delete('/:orderId', authenticate, bindController(orderController.cancelOrder));

/**
 * ADD COURSE TO ORDER
 * POST /api/orders/:orderId/courses
 */
router.post('/:orderId/courses', authenticate, bindController(orderController.addCourse));

/**
 * ADD ITEM TO ORDER
 * POST /api/orders/:orderId/items
 */
router.post('/:orderId/items', authenticate, bindController(orderController.addItemToOrder));

/**
 * UPDATE ORDER ITEM
 * PUT /api/orders/:orderId/items/:itemId
 */
router.put(
  '/:orderId/items/:itemId',
  authenticate,
  bindController(orderController.updateOrderItem)
);

/**
 * REMOVE ORDER ITEM
 * DELETE /api/orders/:orderId/items/:itemId
 */
router.delete(
  '/:orderId/items/:itemId',
  authenticate,
  bindController(orderController.removeOrderItem)
);

/**
 * GET ORDERS BY TABLE
 * GET /api/tables/:tableId/orders
 */
router.get('/table/:tableId', authenticate, bindController(orderController.getOrdersByTable));

// ===============================
// SPECIAL REQUESTS ROUTES
// ===============================

/**
 * CREATE SPECIAL REQUEST
 * POST /api/orders/:orderId/special-requests
 */
router.post(
  '/:orderId/special-requests',
  authenticate,
  bindSpecialRequestController(specialRequestController.createSpecialRequest)
);

/**
 * GET SPECIAL REQUESTS FOR ORDER
 * GET /api/orders/:orderId/special-requests
 */
router.get(
  '/:orderId/special-requests',
  authenticate,
  bindSpecialRequestController(specialRequestController.getSpecialRequests)
);

/**
 * GET SPECIAL REQUEST BY ID
 * GET /api/special-requests/:requestId
 */
router.get(
  '/special-requests/:requestId',
  authenticate,
  bindSpecialRequestController(specialRequestController.getSpecialRequest)
);

/**
 * UPDATE SPECIAL REQUEST
 * PUT /api/special-requests/:requestId
 */
router.put(
  '/special-requests/:requestId',
  authenticate,
  bindSpecialRequestController(specialRequestController.updateSpecialRequest)
);

/**
 * DELETE SPECIAL REQUEST
 * DELETE /api/special-requests/:requestId
 */
router.delete(
  '/special-requests/:requestId',
  authenticate,
  bindSpecialRequestController(specialRequestController.deleteSpecialRequest)
);

/**
 * GET HIGH-PRIORITY SPECIAL REQUESTS
 * GET /api/special-requests/priority/HIGH
 */
router.get(
  '/priority/HIGH',
  authenticate,
  bindSpecialRequestController(specialRequestController.getHighPriorityRequests)
);

export default router;
