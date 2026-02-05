import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { KitchenController } from '../controllers/KitchenController';
import { KitchenService } from '../services/KitchenService';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();
const kitchenService = new KitchenService(prisma);
const kitchenController = new KitchenController(kitchenService);

// Middleware to bind 'this' context
const bindController = (method: Function) => {
  return method.bind(kitchenController);
};

/**
 * GET PENDING ORDERS
 * GET /api/kitchen/orders
 */
router.get('/orders', authenticate, bindController(kitchenController.getPendingOrders));

/**
 * GET KITCHEN DISPLAY SYSTEM
 * GET /api/kitchen/display?stationId=xxx
 */
router.get('/display', authenticate, bindController(kitchenController.getKitchenDisplaySystem));

/**
 * GET ORDERS BY STATION
 * GET /api/kitchen/stations/:stationId/orders
 */
router.get(
  '/stations/:stationId/orders',
  authenticate,
  bindController(kitchenController.getOrdersByStation)
);

/**
 * GET ITEMS BY STATUS
 * GET /api/kitchen/items?status=PENDING&stationId=xxx&limit=50
 */
router.get('/items', authenticate, bindController(kitchenController.getItemsByStatus));

/**
 * FIRE ORDER ITEM (Start prep)
 * PATCH /api/kitchen/items/:itemId/fire
 */
router.patch('/items/:itemId/fire', authenticate, bindController(kitchenController.fireOrderItem));

/**
 * COMPLETE ORDER ITEM (Mark prepared)
 * PATCH /api/kitchen/items/:itemId/complete
 */
router.patch(
  '/items/:itemId/complete',
  authenticate,
  bindController(kitchenController.completeItem)
);

/**
 * SERVE ORDER ITEM
 * PATCH /api/kitchen/items/:itemId/serve
 */
router.patch('/items/:itemId/serve', authenticate, bindController(kitchenController.serveItem));

/**
 * GET ORDER READY STATUS
 * GET /api/kitchen/orders/:orderId/status
 */
router.get(
  '/orders/:orderId/status',
  authenticate,
  bindController(kitchenController.getOrderReadyStatus)
);

/**
 * CALCULATE PREP TIME
 * GET /api/kitchen/items/:itemId/preptime
 */
router.get(
  '/items/:itemId/preptime',
  authenticate,
  bindController(kitchenController.calculatePrepTime)
);

/**
 * GET KITCHEN METRICS
 * GET /api/kitchen/metrics
 */
router.get('/metrics', authenticate, bindController(kitchenController.getKitchenMetrics));

export default router;
