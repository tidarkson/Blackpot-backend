import { Router } from 'express';
import { reconciliationController } from '../controllers/ReconciliationController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Reconciliation Routes
 * All routes require authentication and tenant isolation
 */

/**
 * POST /api/reconciliation/run
 * Run daily reconciliation - aggregates all cash sessions
 */
router.post(
  '/run',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.runDailyReconciliation(req, res)
);

/**
 * GET /api/reconciliation/:date
 * Get reconciliation summary for a specific date (YYYY-MM-DD)
 */
router.get(
  '/:date',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.getReconciliationByDate(req, res)
);

/**
 * GET /api/reconciliation/daily
 * Perform daily reconciliation for tenant
 */
router.get(
  '/daily',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.dailyReconciliation(req, res)
);

/**
 * POST /api/reconciliation/verify-payment
 * Verify a specific payment against system records
 */
router.post(
  '/verify-payment',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.verifyPayment(req, res)
);

/**
 * GET /api/reconciliation/discrepancies
 * Get all unresolved discrepancies for tenant
 */
router.get(
  '/discrepancies',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.identifyDiscrepancies(req, res)
);

/**
 * POST /api/reconciliation/generate-report
 * Generate reconciliation report for date range
 */
router.post(
  '/generate-report',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.generateReport(req, res)
);

/**
 * POST /api/reconciliation/approve
 * Approve reconciliation for date and mark payments as reconciled
 */
router.post(
  '/approve',
  authenticate,
  ensureTenantAccess,
  (req, res) => reconciliationController.approveReconciliation(req, res)
);

export default router;

