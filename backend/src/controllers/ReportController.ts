import { Request, Response } from 'express';
import { ReportService } from '../services/ReportService';
import cacheService, { CACHE_TTL } from '../services/CacheService';
import cacheInvalidationService from '../services/cacheInvalidation.service';
import CacheKeyGenerator, { CACHE_KEY_PATTERNS } from '../utils/cacheKeyGenerator';
import logger from '../config/logger';

/**
 * ReportController
 * 
 * Handles all reporting endpoints
 * - Sales reports
 * - Kitchen performance reports
 * - Inventory reports
 * - Staff performance reports
 * - Financial reports
 */
export class ReportController {
  private reportService: ReportService;

  constructor() {
    this.reportService = new ReportService();
  }

  /**
   * POST /api/reports/sales
   * 
   * Generate daily sales report
   * Includes revenue by payment method, trends, and top items
   * Cached: Until midnight (next day) - invalidated when new order placed
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns SalesReport with detailed breakdown
   */
  async generateDailySalesReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { startDate } = req.body;

      if (!tenantId || !startDate) {
        res.status(400).json({
          error: 'Missing required fields: startDate'
        });
        return;
      }

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      // Calculate TTL until midnight
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const ttlSeconds = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

      // Generate cache key with date
      const reportDate = new Date(startDate).toISOString().split('T')[0];
      const cacheKey = CACHE_KEY_PATTERNS.REPORT_SALES(tenantId, reportDate);

      // Try to get from cache
      if (!bypassCache && !forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.debug(`✅ Sales report cache HIT for ${reportDate}`);
          res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${ttlSeconds}`)
            .json({
              ...cached,
              _cache: 'HIT',
            });
          return;
        }
      }

      // Cache miss - generate report
      logger.debug(`❌ Sales report cache MISS for ${reportDate}`);
      const report = await this.reportService.generateDailySalesReport(
        tenantId,
        new Date(startDate)
      );

      // Cache until midnight
      await cacheService.set(cacheKey, report, ttlSeconds);

      res
        .set('X-Cache', 'MISS')
        .set('Cache-Control', `public, max-age=${ttlSeconds}`)
        .json({
          ...report,
          _cache: 'MISS',
        });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reports/kitchen
   * 
   * Generate kitchen performance report
   * Includes order times, course completion rates, bottlenecks
   * Cached: 1 hour TTL
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns KitchenReport with performance metrics
   */
  async generateKitchenReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { startDate } = req.body;

      if (!tenantId || !startDate) {
        res.status(400).json({
          error: 'Missing required fields: startDate'
        });
        return;
      }

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      const reportDate = new Date(startDate).toISOString().split('T')[0];
      const cacheKey = `report:kitchen:${tenantId}:${reportDate}`;

      // Try to get from cache
      if (!bypassCache && !forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.debug(`✅ Kitchen report cache HIT for ${reportDate}`);
          res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${CACHE_TTL.REPORTS}`)
            .json({
              ...cached,
              _cache: 'HIT',
            });
          return;
        }
      }

      // Cache miss - generate report
      logger.debug(`❌ Kitchen report cache MISS for ${reportDate}`);
      const report = await this.reportService.generateKitchenPerformanceReport(
        tenantId,
        new Date(startDate)
      );

      // Cache for 1 hour
      await cacheService.set(cacheKey, report, CACHE_TTL.REPORTS);

      res
        .set('X-Cache', 'MISS')
        .set('Cache-Control', `public, max-age=${CACHE_TTL.REPORTS}`)
        .json({
          ...report,
          _cache: 'MISS',
        });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reports/inventory
   * 
   * Generate inventory analysis report
   * Includes item usage, waste analysis, reorder recommendations
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns InventoryReport with detailed analytics
   */
  async generateInventoryReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(400).json({
          error: 'Missing tenant ID'
        });
        return;
      }

      const report = await this.reportService.generateInventoryReport(tenantId);
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reports/staff
   * 
   * Generate staff performance report
   * Includes per-server metrics, shift productivity, ratings
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns StaffReport with individual and team metrics
   */
  async generateStaffReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { startDate } = req.body;

      if (!tenantId || !startDate) {
        res.status(400).json({
          error: 'Missing required fields: startDate'
        });
        return;
      }

      const report = await this.reportService.generateStaffPerformanceReport(
        tenantId,
        new Date(startDate)
      );
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reports/financial
   * 
   * Generate comprehensive financial report
   * Includes revenue, expenses, profit margins, cash flow
   * Cached: Until midnight (next day)
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns FinancialReport with complete financial analysis
   */
  async generateFinancialReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { startDate } = req.body;

      if (!tenantId || !startDate) {
        res.status(400).json({
          error: 'Missing required fields: startDate'
        });
        return;
      }

      const bypassCache = req.query.cache === 'false';
      const forceRefresh = req.query.refresh === 'true';

      // Calculate TTL until midnight
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const ttlSeconds = Math.floor((tomorrow.getTime() - now.getTime()) / 1000);

      const reportDate = new Date(startDate).toISOString().split('T')[0];
      const cacheKey = CACHE_KEY_PATTERNS.REPORT_FINANCIAL(tenantId, reportDate);

      // Try to get from cache
      if (!bypassCache && !forceRefresh) {
        const cached = await cacheService.get(cacheKey);
        if (cached) {
          logger.debug(`✅ Financial report cache HIT for ${reportDate}`);
          res
            .set('X-Cache', 'HIT')
            .set('Cache-Control', `public, max-age=${ttlSeconds}`)
            .json({
              ...cached,
              _cache: 'HIT',
            });
          return;
        }
      }

      // Cache miss - generate report
      logger.debug(`❌ Financial report cache MISS for ${reportDate}`);
      const report = await this.reportService.generateFinancialReport(
        tenantId,
        new Date(startDate)
      );

      // Cache until midnight
      await cacheService.set(cacheKey, report, ttlSeconds);

      res
        .set('X-Cache', 'MISS')
        .set('Cache-Control', `public, max-age=${ttlSeconds}`)
        .json({
          ...report,
          _cache: 'MISS',
        });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  async getDailyReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const date = typeof req.params.date === 'string' ? req.params.date : req.params.date[0];

      if (!tenantId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      // Validate date format
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({
          error: 'Invalid date format. Use YYYY-MM-DD',
        });
        return;
      }

      const report = await this.reportService.getProfitAndLoss(tenantId, parsedDate);
      res.json({
        date: parsedDate,
        ...report,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/reports/monthly/:month/:year
   * 
   * Get monthly summary report
   * @param month - Month number (1-12)
   * @param year - Year (e.g., 2026)
   * @returns Monthly financial summary
   */
  async getMonthlyReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const month = typeof req.params.month === 'string' ? req.params.month : req.params.month[0];
      const year = typeof req.params.year === 'string' ? req.params.year : req.params.year[0];

      if (!tenantId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      // Validate month and year
      if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12 || yearNum < 1900) {
        res.status(400).json({
          error: 'Invalid month or year format. Month should be 1-12, year should be valid.',
        });
        return;
      }

      // Create date range for the month
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0); // Last day of the month

      const report = await this.reportService.getReportByDateRange(tenantId, startDate, endDate);
      res.json({
        month: monthNum,
        year: yearNum,
        ...report,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}
