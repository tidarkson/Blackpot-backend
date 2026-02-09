import { Router } from 'express';
import { cashSessionController } from '../controllers/CashSessionController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Cash Session Routes
 * All routes require authentication and tenant isolation
 * 
 * Shift-level cash reconciliation for staff and managers
 */

/**
 * GET /api/cash-sessions/flagged
 * Get all flagged cash sessions requiring manager review
 * Requires MANAGER or OWNER role
 */
router.get(
  '/flagged',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.getFlaggedCashSessions(req, res)
);

/**
 * POST /api/cash-sessions/open
 * Open a new cash session for a shift
 * Staff member starts their shift and prepares register
 */
router.post(
  '/open',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.openCashSession(req, res)
);

/**
 * GET /api/cash-sessions
 * Get all cash sessions for a date range
 * Query params: startDate, endDate
 */
router.get(
  '/',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.getCashSessionsByDateRange(req, res)
);

/**
 * GET /api/cash-sessions/:id
 * Get cash session details
 */
router.get(
  '/:id',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.getCashSession(req, res)
);

/**
 * POST /api/cash-sessions/:id/close
 * Close a cash session and record closing balance
 * Calculates discrepancy between expected and actual cash
 */
router.post(
  '/:id/close',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.closeCashSession(req, res)
);

/**
 * POST /api/cash-sessions/:id/review
 * Add manager review and comments to a flagged cash session
 * Requires MANAGER or OWNER role
 */
router.post(
  '/:id/review',
  authenticate,
  ensureTenantAccess,
  (req, res) => cashSessionController.reviewCashSession(req, res)
);

export default router;
