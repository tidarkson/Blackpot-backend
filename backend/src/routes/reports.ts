import { Router } from 'express';
import { reportController } from '../controllers/ReportController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Report Routes
 * All routes require authentication and tenant isolation
 */

/**
 * POST /api/reports/sales
 * Generate daily sales report for date range
 */
router.post(
  '/sales',
  authenticate,
  ensureTenantAccess,
  (req, res) => reportController.generateDailySalesReport(req, res)
);

/**
 * POST /api/reports/kitchen
 * Generate kitchen performance report
 */
router.post(
  '/kitchen',
  authenticate,
  ensureTenantAccess,
  (req, res) => reportController.generateKitchenReport(req, res)
);

/**
 * POST /api/reports/inventory
 * Generate inventory analysis report
 */
router.post(
  '/inventory',
  authenticate,
  ensureTenantAccess,
  (req, res) => reportController.generateInventoryReport(req, res)
);

/**
 * POST /api/reports/staff
 * Generate staff performance report
 */
router.post(
  '/staff',
  authenticate,
  ensureTenantAccess,
  (req, res) => reportController.generateStaffReport(req, res)
);

/**
 * POST /api/reports/financial
 * Generate comprehensive financial report
 */
router.post(
  '/financial',
  authenticate,
  ensureTenantAccess,
  (req, res) => reportController.generateFinancialReport(req, res)
);

export default router;

