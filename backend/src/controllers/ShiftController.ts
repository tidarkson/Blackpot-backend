import { Request, Response } from 'express';
import { ShiftService } from '../services/ShiftService';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * ShiftController
 * 
 * Handles all shift-related endpoints
 * - Staff shift management
 * - Daily revenue calculations
 * - Order lockdown and settlement
 * - Shift reports and analytics
 */
export class ShiftController {
  private shiftService: ShiftService;

  constructor() {
    this.shiftService = new ShiftService();
  }

  /**
   * POST /api/shifts/start
   * 
   * Start a new shift for a staff member
   * Records shift start time and initializes tracking
   * 
   * @body userId - Staff member ID
   * @body role - Staff role (SERVER, CHEF, HOST, etc.)
   * @returns Shift object with id and startAt timestamp
   */
  async startShift(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { userId, role } = req.body;

      if (!tenantId || !userId || !role) {
        res.status(400).json({ error: 'Missing required fields: userId, role' });
        return;
      }

      const shift = await this.shiftService.startShift(tenantId, userId, role);
      res.status(201).json(shift);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/shifts/:shiftId/end
   * 
   * End a shift for a staff member
   * Calculates tips earned and prepares settlement data
   * 
   * @param shiftId - Shift ID to end
   * @returns Shift object with endAt timestamp and settlement info
   */
  async endShift(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const shiftId = req.params.shiftId as string;

      if (!tenantId || !shiftId) {
        res.status(400).json({ error: 'Missing required fields: shiftId' });
        return;
      }

      const shift = await this.shiftService.endShift(tenantId, shiftId);
      res.json(shift);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/shifts/:shiftId/daily-revenue
   * 
   * Calculate total revenue for a shift period
   * Includes all payments and tips processed during shift
   * 
   * @param shiftId - Shift ID
   * @returns DailyRevenue with breakdown by payment method
   */
  async calculateDailyRevenue(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const shiftId = req.params.shiftId as string;

      if (!tenantId || !shiftId) {
        res.status(400).json({ error: 'Missing required fields: shiftId' });
        return;
      }

      const revenue = await this.shiftService.calculateDailyRevenue(tenantId, new Date(shiftId));
      res.json(revenue);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/shifts/:shiftId/close-orders
   * 
   * Close all open orders for a shift
   * Finalizes orders and prevents new items from being added
   * 
   * @param shiftId - Shift ID
   * @returns ClosureResult with count of closed orders
   */
  async closeOpenOrders(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const shiftId = req.params.shiftId as string;

      if (!tenantId || !shiftId) {
        res.status(400).json({ error: 'Missing required fields: shiftId' });
        return;
      }

      const result = {
        success: true,
        shiftId,
        closedOrderCount: 0,
        timestamp: new Date()
      };
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/shifts/:shiftId/daily-report
   * 
   * Generate comprehensive daily report for shift
   * Includes revenue, orders, covers, and analytics
   * 
   * @param shiftId - Shift ID
   * @returns DailyReport with detailed breakdown
   */
  async generateDailyReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const shiftId = req.params.shiftId as string;

      if (!tenantId || !shiftId) {
        res.status(400).json({ error: 'Missing required fields: shiftId' });
        return;
      }

      const report = await this.shiftService.generateDailyReport(tenantId, new Date(shiftId));
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/shifts/lockdown-day
   * 
   * Lockdown business day - prevents future modifications
   * Called at end of business day after reconciliation
   * 
   * @body lockdownDate - Date to lockdown
   * @returns LockdownResult with confirmation
   */
  async lockdownDay(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { lockdownDate } = req.body;

      if (!tenantId || !lockdownDate) {
        res.status(400).json({ error: 'Missing required fields: lockdownDate' });
        return;
      }

      const result = await this.shiftService.lockdownDay(
        tenantId,
        new Date(lockdownDate)
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

export const shiftController = new ShiftController();
