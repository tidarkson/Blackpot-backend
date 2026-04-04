import { Router, Request, Response } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { dashboardRetrievalLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * ✅ DASHBOARD ENDPOINTS WITH CACHING & RATE LIMITING
 * 
 * All dashboard endpoints are cached to provide sub-500ms response times
 * Cache TTL: 1 minute for stats and recent orders
 * Rate limits: 200 per minute (premium: 600 per minute)
 * 
 * Cache Bypass:
 * - Add ?cache=false to bypass cache
 * - Add ?refresh=true to force refresh
 */

/**
 * GET /api/dashboard/stats
 * Rate Limit: 200 per minute per account
 * Cache: 1 minute TTL
 * 
 * Returns dashboard statistics including:
 * - Today's sales data (revenue by payment method)
 * - Order statistics (total, by status)
 * - Top 5 items
 * - Average order value
 */
router.get(
  '/stats',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getDashboardStats(req, res, () => {})
);

/**
 * GET /api/dashboard/recent-orders
 * Rate Limit: 200 per minute per account
 * Cache: 1 minute TTL
 * 
 * Query params:
 *   - limit: Number of orders to return (default: 20, max: 50)
 *   - cache: Set to 'false' to bypass cache
 *   - refresh: Set to 'true' to force refresh
 * 
 * Returns last 20 orders with status, amount, table, server info
 */
router.get(
  '/recent-orders',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getRecentOrders(req, res, () => {})
);

router.get(
  '/upcoming-reservations',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getUpcomingReservations(req, res, () => {})
);

router.get(
  '/server-performance',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getServerPerformance(req, res, () => {})
);

router.get(
  '/low-stock',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getLowStock(req, res, () => {})
);

/**
 * GET /api/dashboard/today-summary
 * Rate Limit: 200 per minute per account
 * Cache: 1 minute TTL
 * 
 * Quick summary endpoint for dashboard at a glance:
 * - Open orders count
 * - Completed orders today
 * - Total revenue today
 */
router.get(
  '/today-summary',
  authenticate,
  ensureTenantAccess,
  dashboardRetrievalLimiter,
  (req: Request, res: Response) => DashboardController.getTodaysSummary(req, res, () => {})
);

/**
 * GET /api/dashboard/cache-stats
 * Rate Limit: 50 per minute (monitoring endpoint)
 * 
 * Monitor cache performance:
 * - Hit/miss rates by endpoint
 * - Overall hit rate percentage
 * - Total requests tracked
 * 
 * Admin use only (check auth middleware if added)
 */
router.get(
  '/cache-stats',
  authenticate,
  ensureTenantAccess,
  (req: Request, res: Response) => DashboardController.getCacheStats(req, res, () => {})
);

/**
 * POST /api/dashboard/invalidate-cache
 * Rate Limit: 10 per hour (admin operation)
 * 
 * Force invalidate all dashboard caches for this restaurant
 * Useful for troubleshooting stale data
 * 
 * Admin/Owner only
 */
router.post(
  '/invalidate-cache',
  authenticate,
  ensureTenantAccess,
  (req: Request, res: Response) => DashboardController.invalidateCache(req, res, () => {})
);

export default router;
