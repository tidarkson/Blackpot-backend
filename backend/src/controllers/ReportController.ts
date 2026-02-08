import { Request, Response } from 'express';
import { ReportService } from '../services/ReportService';

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

      const report = await this.reportService.generateDailySalesReport(
        tenantId,
        new Date(startDate)
      );
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reports/kitchen
   * 
   * Generate kitchen performance report
   * Includes order times, course completion rates, bottlenecks
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

      const report = await this.reportService.generateKitchenPerformanceReport(
        tenantId,
        new Date(startDate)
      );
      res.json(report);
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

      const report = await this.reportService.generateFinancialReport(
        tenantId,
        new Date(startDate)
      );
      res.json(report);
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
