import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';
import { cashSessionController } from '../controllers/CashSessionController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { reportGenerationLimiter, reportViewLimiter } from '../middleware/rateLimiter';

const router = Router();
const reportController = new ReportController();

/**
 * ✅ ACCEPTANCE CRITERIA: Report Endpoints with Rate Limiting
 * All report endpoints are protected with appropriate rate limits
 * Generation operations (expensive): 10 per hour
 * View operations (read-only): 50 per minute
 * Premium accounts have 3x higher limits
 */

/**
 * POST /api/reports/sales
 * Rate Limit: 10 per hour per account
 * Rationale: Report generation is resource-intensive
 * Premium: 30 per hour
 * Generate daily sales report for date range
 */
router.post(
  '/sales',
  authenticate,
  ensureTenantAccess,
  reportGenerationLimiter,
  (req, res) => reportController.generateDailySalesReport(req, res)
);

/**
 * POST /api/reports/kitchen
 * Rate Limit: 10 per hour per account
 * Generate kitchen performance report
 */
router.post(
  '/kitchen',
  authenticate,
  ensureTenantAccess,
  reportGenerationLimiter,
  (req, res) => reportController.generateKitchenReport(req, res)
);

/**
 * POST /api/reports/inventory
 * Rate Limit: 10 per hour per account
 * Generate inventory analysis report
 */
router.post(
  '/inventory',
  authenticate,
  ensureTenantAccess,
  reportGenerationLimiter,
  (req, res) => reportController.generateInventoryReport(req, res)
);

/**
 * POST /api/reports/staff
 * Rate Limit: 10 per hour per account
 * Generate staff performance report
 */
router.post(
  '/staff',
  authenticate,
  ensureTenantAccess,
  reportGenerationLimiter,
  (req, res) => reportController.generateStaffReport(req, res)
);

/**
 * POST /api/reports/financial
 * Rate Limit: 10 per hour per account
 * Generate comprehensive financial report
 */
router.post(
  '/financial',
  authenticate,
  ensureTenantAccess,
  reportGenerationLimiter,
  (req, res) => reportController.generateFinancialReport(req, res)
);

/**
 * GET /api/reports/discrepancies
 * Rate Limit: 50 per minute per account
 * Rationale: Read operations have higher limits than generation
 * Premium: 150 per minute
 * Query params: startDate, endDate (ISO format)
 * Used for financial analysis and staff performance tracking
 */
router.get(
  '/discrepancies',
  authenticate,
  ensureTenantAccess,
  reportViewLimiter,
  (req, res) => cashSessionController.getDiscrepancyReport(req, res)
);

export default router;

