import { Request, Response, NextFunction } from 'express';
import DashboardService from '../services/DashboardService';
import logger from '../config/logger';
import { CacheMonitoring } from '../utils/cacheMonitoring';

const cacheMonitoring = new CacheMonitoring();

/**
 * Dashboard Controller
 * Handles all dashboard endpoints with intelligent caching
 */
export class DashboardController {
  /**
   * GET /api/dashboard/stats
   * Cache: 1 minute TTL
   * Query params:
   *   - cache=false (bypass cache)
   *   - refresh=true (force refresh)
   *
   * Returns:
   *   - Today's sales data
   *   - Order statistics
   *   - Top items
   *   - Average order value
   */
  static async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      // Check for cache bypass
      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      logger.info(`📊 Dashboard stats requested for tenant ${tenantId}`, {
        bypassCache,
        forceRefresh,
      });

      const stats: any = await DashboardService.getDashboardStats(tenantId, forceRefresh || bypassCache);

      // Track cache metrics
      if (stats._cache === 'HIT') {
        cacheMonitoring.recordHit('dashboard_stats');
      } else {
        cacheMonitoring.recordMiss('dashboard_stats');
      }

      const cacheStatus = stats._cache || 'MISS';
      const { _cache, ...statsData } = stats;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .set('Content-Type', 'application/json')
        .json({
          success: true,
          data: statsData,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getDashboardStats:', error);
      next(error);
    }
  }

  /**
   * GET /api/dashboard/recent-orders
   * Cache: 1 minute TTL
   * Query params:
   *   - limit=20 (number of orders, max 50)
   *   - cache=false (bypass cache)
   *
   * Returns:
   *   - Last 20 orders with status and amounts
   */
  static async getRecentOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      logger.debug(`📊 Recent orders requested for tenant ${tenantId}`, {
        limit,
        bypassCache,
        forceRefresh,
      });

      const result: any = await DashboardService.getRecentOrders(tenantId, limit, forceRefresh || bypassCache);

      // Track cache metrics
      if (result._cache === 'HIT') {
        cacheMonitoring.recordHit('recent_orders');
      } else {
        cacheMonitoring.recordMiss('recent_orders');
      }

      const cacheStatus = result._cache || 'MISS';
      const { _cache, ...resultData } = result;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .json({
          success: true,
          data: resultData.data || resultData,
          count: (resultData.data || resultData).length,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getRecentOrders:', error);
      next(error);
    }
  }

  static async getUpcomingReservations(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 5, 20);
      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      const reservations: any = await DashboardService.getUpcomingReservations(
        tenantId,
        limit,
        forceRefresh || bypassCache
      );

      const cacheStatus = reservations._cache || 'MISS';
      const { _cache, ...reservationData } = reservations;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .json({
          success: true,
          data: reservationData.data || reservationData,
          count: (reservationData.data || reservationData).length,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getUpcomingReservations:', error);
      next(error);
    }
  }

  static async getServerPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      const performance: any = await DashboardService.getServerPerformance(
        tenantId,
        forceRefresh || bypassCache
      );

      const cacheStatus = performance._cache || 'MISS';
      const { _cache, ...performanceData } = performance;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .json({
          success: true,
          data: performanceData.data || performanceData,
          count: (performanceData.data || performanceData).length,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getServerPerformance:', error);
      next(error);
    }
  }

  static async getLowStock(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 50);
      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      const lowStock: any = await DashboardService.getLowStockItems(
        tenantId,
        limit,
        forceRefresh || bypassCache
      );

      const cacheStatus = lowStock._cache || 'MISS';
      const { _cache, ...stockData } = lowStock;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .json({
          success: true,
          data: stockData.data || stockData,
          count: (stockData.data || stockData).length,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getLowStock:', error);
      next(error);
    }
  }

  /**
   * GET /api/dashboard/today-summary
   * Cache: 1 minute TTL
   * Quick summary of today's metrics
   *
   * Returns:
   *   - Open orders count
   *   - Completed orders count
   *   - Revenue
   */
  static async getTodaysSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      logger.debug(`📊 Today's summary requested for tenant ${tenantId}`);

      const summary: any = await DashboardService.getTodaysSummary(tenantId, forceRefresh || bypassCache);

      // Track cache metrics
      if (summary._cache === 'HIT') {
        cacheMonitoring.recordHit('today_summary');
      } else {
        cacheMonitoring.recordMiss('today_summary');
      }

      const cacheStatus = summary._cache || 'MISS';
      const { _cache, ...summaryData } = summary;

      return res
        .set('X-Cache', cacheStatus)
        .set('Cache-Control', 'public, max-age=60')
        .json({
          success: true,
          data: summaryData,
          _cache: cacheStatus,
        });
    } catch (error) {
      logger.error('Error in getTodaysSummary:', error);
      next(error);
    }
  }

  /**
   * GET /api/dashboard/cache-stats
   * Returns cache performance metrics
   */
  static async getCacheStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await cacheMonitoring.getOverallStats();

      return res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error in getCacheStats:', error);
      next(error);
    }
  }

  /**
   * POST /api/dashboard/invalidate-cache
   * Admin only: Force invalidate dashboard cache
   */
  static async invalidateCache(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = (req as any).user?.tenantId || (req as any).tenant?.id;

      if (!tenantId) {
        return res.status(401).json({
          success: false,
          error: 'Tenant not found in request context',
        });
      }

      logger.warn(`🗑️  Dashboard cache invalidation requested for tenant ${tenantId}`);

      const keysInvalidated = await DashboardService.invalidateDashboard(tenantId);

      return res.json({
        success: true,
        message: 'Dashboard cache invalidated',
        keysInvalidated,
      });
    } catch (error) {
      logger.error('Error in invalidateCache:', error);
      next(error);
    }
  }
}

export default DashboardController;
