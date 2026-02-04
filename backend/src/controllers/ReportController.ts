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
}

export const reportController = new ReportController();
