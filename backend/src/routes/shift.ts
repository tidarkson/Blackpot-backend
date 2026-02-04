import { Router } from 'express';
import { shiftController } from '../controllers/ShiftController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Shift Routes
 * All routes require authentication and tenant isolation
 */

/**
 * POST /api/shifts/start
 * Start a new shift for a staff member
 */
router.post(
  '/start',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.startShift(req, res)
);

/**
 * POST /api/shifts/:shiftId/end
 * End a shift for a staff member
 */
router.post(
  '/:shiftId/end',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.endShift(req, res)
);

/**
 * GET /api/shifts/:shiftId/daily-revenue
 * Calculate total revenue for a shift
 */
router.get(
  '/:shiftId/daily-revenue',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.calculateDailyRevenue(req, res)
);

/**
 * POST /api/shifts/:shiftId/close-orders
 * Close all open orders for a shift
 */
router.post(
  '/:shiftId/close-orders',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.closeOpenOrders(req, res)
);

/**
 * GET /api/shifts/:shiftId/daily-report
 * Generate comprehensive daily report for shift
 */
router.get(
  '/:shiftId/daily-report',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.generateDailyReport(req, res)
);

/**
 * POST /api/shifts/lockdown-day
 * Lockdown business day
 */
router.post(
  '/lockdown-day',
  authenticate,
  ensureTenantAccess,
  (req, res) => shiftController.lockdownDay(req, res)
);

export default router;

