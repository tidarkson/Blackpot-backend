import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { SplitCheckController } from '../controllers/SplitCheckController';

const router = Router();

/**
 * Split Check Routes
 * All routes require authentication and tenant isolation
 */

// Middleware: Apply auth and tenant isolation to all routes
router.use(authenticate, ensureTenantAccess);

/**
 * POST /api/orders/:orderId/split
 * Create a split bill for an order
 * Required roles: MANAGER, SUPERVISOR, SERVER, HOST
 */
router.post(
  '/orders/:orderId/split',
  authorizeRoles('MANAGER', 'SUPERVISOR', 'SERVER', 'HOST'),
  SplitCheckController.createSplit
);

/**
 * GET /api/orders/:orderId/splits
 * Get all splits for an order
 * Required roles: MANAGER, SUPERVISOR, SERVER, BARTENDER, HOST, CASHIER
 */
router.get(
  '/orders/:orderId/splits',
  authorizeRoles('MANAGER', 'SUPERVISOR', 'SERVER', 'BARTENDER', 'HOST', 'CASHIER'),
  SplitCheckController.getSplits
);

/**
 * GET /api/orders/:orderId/splits/:splitId
 * Get single split bill details
 * Required roles: MANAGER, SUPERVISOR, SERVER, BARTENDER, HOST, CASHIER
 */
router.get(
  '/orders/:orderId/splits/:splitId',
  authorizeRoles('MANAGER', 'SUPERVISOR', 'SERVER', 'BARTENDER', 'HOST', 'CASHIER'),
  SplitCheckController.getSplitBill
);

/**
 * GET /api/orders/:orderId/splits/:splitId/print
 * Get split bill formatted for printing
 * Required roles: MANAGER, SUPERVISOR, SERVER, BARTENDER, HOST, CASHIER
 */
router.get(
  '/orders/:orderId/splits/:splitId/print',
  authorizeRoles('MANAGER', 'SUPERVISOR', 'SERVER', 'BARTENDER', 'HOST', 'CASHIER'),
  SplitCheckController.getSplitBillForPrint
);

/**
 * POST /api/splits/:splitId/pay
 * Record a payment against a split bill
 * Required roles: MANAGER, SUPERVISOR, SERVER, CASHIER
 */
router.post(
  '/splits/:splitId/pay',
  authorizeRoles('MANAGER', 'SUPERVISOR', 'SERVER', 'CASHIER'),
  SplitCheckController.paySplit
);

/**
 * DELETE /api/orders/:orderId/splits
 * Undo split (only if no payments made)
 * Required roles: MANAGER, SUPERVISOR
 */
router.delete(
  '/orders/:orderId/splits',
  authorizeRoles('MANAGER', 'SUPERVISOR'),
  SplitCheckController.undoSplit
);

/**
 * Role-based authorization middleware
 */
function authorizeRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role;

    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

export default router;
