import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { OrderController } from '../controllers/OrderController';
import { SpecialRequestController } from '../controllers/SpecialRequestController';
import { OrderService } from '../services/OrderService';
import { SpecialRequestService } from '../services/SpecialRequestService';
import { PrismaClient } from '@prisma/client';
import { orderCreationLimiter, orderRetrievalLimiter, orderUpdateLimiter } from '../middleware/rateLimiter';

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
 * ✅ ACCEPTANCE CRITERIA: Order Endpoints with Rate Limiting
 * All order operations are protected with appropriate rate limits based on operation type
 * Premium accounts have 3x higher limits
 */

/**
 * POST /api/orders
 * Rate Limit: 100 per minute per account
 * Rationale: Protect against order flooding and bulk creation abuse
 * Premium: 300 per minute
 * CREATE ORDER
 */
router.post('/', authenticate, orderCreationLimiter, bindController(orderController.createOrder));

/**
 * GET /api/orders
 * Rate Limit: 200 per minute per account
 * Rationale: Read operations have higher limits than writes
 * Premium: 600 per minute
 * LIST ORDERS
 */
router.get('/', authenticate, orderRetrievalLimiter, bindController(orderController.listOrders));

/**
 * GET /api/orders/:orderId
 * Rate Limit: 200 per minute per account (inherited from GET)
 * GET ORDER BY ID
 */
router.get('/:orderId', authenticate, orderRetrievalLimiter, bindController(orderController.getOrderById));

/**
 * GET /api/orders/:orderId/details
 * Rate Limit: 200 per minute per account
 * GET ORDER DETAILS
 */
router.get('/:orderId/details', authenticate, orderRetrievalLimiter, bindController(orderController.getOrderDetails));

/**
 * PUT /api/orders/:orderId
 * Rate Limit: 50 per minute per account
 * Rationale: Update operations are lower than creation to prevent excessive modifications
 * Premium: 150 per minute
 * UPDATE ORDER
 */
router.put('/:orderId', authenticate, orderUpdateLimiter, bindController(orderController.updateOrder));

/**
 * PATCH /api/orders/:orderId/status
 * Rate Limit: 50 per minute per account
 * UPDATE ORDER STATUS
 */
router.patch('/:orderId/status', authenticate, orderUpdateLimiter, bindController(orderController.updateOrderStatus));

/**
 * PATCH /api/orders/:orderId/close
 * Rate Limit: 50 per minute per account
 * CLOSE ORDER (Prepare for payment)
 */
router.patch('/:orderId/close', authenticate, orderUpdateLimiter, bindController(orderController.closeOrder));

/**
 * POST /api/orders/:orderId/force-close
 * Rate Limit: 50 per minute per account
 * FORCE CLOSE ORDER (Manager/Owner override)
 */
router.post(
  '/:orderId/force-close',
  authenticate,
  requireRole('MANAGER', 'OWNER'),
  orderUpdateLimiter,
  bindController(orderController.forceCloseOrder)
);

/**
 * DELETE /api/orders/:orderId
 * Rate Limit: 50 per minute per account
 * CANCEL ORDER
 */
router.delete('/:orderId', authenticate, orderUpdateLimiter, bindController(orderController.cancelOrder));

/**
 * POST /api/orders/:orderId/courses
 * Rate Limit: 100 per minute per account (creation operation)
 * ADD COURSE TO ORDER
 */
router.post('/:orderId/courses', authenticate, orderCreationLimiter, bindController(orderController.addCourse));

/**
 * POST /api/orders/:orderId/items
 * Rate Limit: 100 per minute per account
 * ADD ITEM TO ORDER
 */
router.post('/:orderId/items', authenticate, orderCreationLimiter, bindController(orderController.addItemToOrder));

/**
 * PUT /api/orders/:orderId/items/:itemId
 * Rate Limit: 50 per minute per account
 * UPDATE ORDER ITEM
 */
router.put(
  '/:orderId/items/:itemId',
  authenticate,
  orderUpdateLimiter,
  bindController(orderController.updateOrderItem)
);

/**
 * DELETE /api/orders/:orderId/items/:itemId
 * Rate Limit: 50 per minute per account
 * REMOVE ORDER ITEM
 */
router.delete(
  '/:orderId/items/:itemId',
  authenticate,
  orderUpdateLimiter,
  bindController(orderController.removeOrderItem)
);

/**
 * GET /api/tables/:tableId/orders
 * Rate Limit: 200 per minute per account
 * GET ORDERS BY TABLE
 */
router.get('/table/:tableId', authenticate, orderRetrievalLimiter, bindController(orderController.getOrdersByTable));

// ===============================
// SPECIAL REQUESTS ROUTES
// ===============================

/**
 * POST /api/orders/:orderId/special-requests
 * Rate Limit: 100 per minute per account
 * CREATE SPECIAL REQUEST
 */
router.post(
  '/:orderId/special-requests',
  authenticate,
  orderCreationLimiter,
  bindSpecialRequestController(specialRequestController.createSpecialRequest)
);

/**
 * GET /api/orders/:orderId/special-requests
 * Rate Limit: 200 per minute per account
 * GET SPECIAL REQUESTS FOR ORDER
 */
router.get(
  '/:orderId/special-requests',
  authenticate,
  orderRetrievalLimiter,
  bindSpecialRequestController(specialRequestController.getSpecialRequests)
);

/**
 * GET /api/special-requests/:requestId
 * Rate Limit: 200 per minute per account
 * GET SPECIAL REQUEST BY ID
 */
router.get(
  '/special-requests/:requestId',
  authenticate,
  orderRetrievalLimiter,
  bindSpecialRequestController(specialRequestController.getSpecialRequest)
);

/**
 * PUT /api/special-requests/:requestId
 * Rate Limit: 50 per minute per account
 * UPDATE SPECIAL REQUEST
 */
router.put(
  '/special-requests/:requestId',
  authenticate,
  orderUpdateLimiter,
  bindSpecialRequestController(specialRequestController.updateSpecialRequest)
);

/**
 * DELETE /api/special-requests/:requestId
 * Rate Limit: 50 per minute per account
 * DELETE SPECIAL REQUEST
 */
router.delete(
  '/special-requests/:requestId',
  authenticate,
  orderUpdateLimiter,
  bindSpecialRequestController(specialRequestController.deleteSpecialRequest)
);

/**
 * GET /api/special-requests/priority/HIGH
 * Rate Limit: 200 per minute per account
 * GET HIGH-PRIORITY SPECIAL REQUESTS
 */
router.get(
  '/priority/HIGH',
  authenticate,
  orderRetrievalLimiter,
  bindSpecialRequestController(specialRequestController.getHighPriorityRequests)
);

export default router;
