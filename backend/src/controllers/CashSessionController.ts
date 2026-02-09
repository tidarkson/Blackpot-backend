import { Request, Response } from 'express';
import { CashSessionService } from '../services/CashSessionService';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

/**
 * CashSessionController
 * 
 * Handles all cash session endpoints
 * - Opening cash sessions
 * - Closing cash sessions
 * - Retrieving session details
 * - Manager review workflow
 */
export class CashSessionController {
  private cashSessionService: CashSessionService;

  constructor(cashSessionService?: CashSessionService) {
    this.cashSessionService = cashSessionService || new CashSessionService();
  }

  /**
   * POST /api/cash-sessions/open
   * 
   * Open a new cash session for a shift
   * Called when staff member starts their shift
   * 
   * @body shiftId - Shift ID (required)
   * @body openingCash - Opening cash balance in register (required)
   * @returns CashSession with id and status
   */
  async openCashSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const { shiftId, openingCash } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!shiftId || openingCash === undefined) {
        res.status(400).json({ error: 'Missing required fields: shiftId, openingCash' });
        return;
      }

      const result = await this.cashSessionService.openCashSession(
        tenantId,
        shiftId,
        userId, // Staff member opening the session is the authenticated user
        new Decimal(openingCash),
        userId
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error opening cash session:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/cash-sessions/:id/close
   * 
   * Close a cash session and record closing balance
   * Calculates discrepancy between expected and actual cash
   * Supports card and denomination tracking
   * 
   * @param id - Cash session ID
   * @body closingCash - Physical cash count at end of shift (required)
   * @body actualCard - Actual card amount counted (optional)
   * @body cashDenominations - Breakdown by denomination like {50: 10, 100: 5} (optional)
   * @returns CashSession with discrepancy, card details, and status
   */
  async closeCashSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const cashSessionId = req.params.id as string;
      const { closingCash, actualCard, cashDenominations } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!cashSessionId || closingCash === undefined) {
        res.status(400).json({ error: 'Missing required fields: closingCash' });
        return;
      }

      const result = await this.cashSessionService.closeCashSession(
        cashSessionId,
        tenantId,
        new Decimal(closingCash),
        userId,
        actualCard ? new Decimal(actualCard) : undefined,
        cashDenominations
      );

      res.status(200).json(result);
    } catch (error: any) {
      logger.error('Error closing cash session:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/cash-sessions/:id
   * 
   * Get cash session details
   * 
   * @param id - Cash session ID
   * @returns Complete CashSession object
   */
  async getCashSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const cashSessionId = req.params.id as string;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!cashSessionId) {
        res.status(400).json({ error: 'Missing required parameter: id' });
        return;
      }

      const result = await this.cashSessionService.getCashSession(cashSessionId, tenantId);
      res.json(result);
    } catch (error: any) {
      logger.error('Error getting cash session:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/cash-sessions
   * 
   * Get all cash sessions for a date range
   * 
   * @query startDate - Start date (required)
   * @query endDate - End date (required)
   * @returns Array of CashSession objects
   */
  async getCashSessionsByDateRange(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { startDate, endDate } = req.query;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Missing required query parameters: startDate, endDate' });
        return;
      }

      const result = await this.cashSessionService.getCashSessionsByDateRange(
        tenantId,
        new Date(startDate as string),
        new Date(endDate as string)
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error getting cash sessions by date range:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/cash-sessions/:id/review
   * 
   * Add manager review and comments to a flagged cash session
   * 
   * @param id - Cash session ID
   * @body managerNotes - Manager's review notes (required)
   * @body approved - Whether manager approves this session (required)
   * @returns Updated CashSession with review status
   */
  async reviewCashSession(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const cashSessionId = req.params.id as string;
      const { managerNotes, approved } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!cashSessionId || managerNotes === undefined || approved === undefined) {
        res.status(400).json({ error: 'Missing required fields: managerNotes, approved' });
        return;
      }

      const result = await this.cashSessionService.reviewCashSession(
        cashSessionId,
        tenantId,
        userId,
        managerNotes,
        approved
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error reviewing cash session:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/cash-sessions/flagged
   * 
   * Get all flagged cash sessions requiring manager review
   * 
   * @returns Array of flagged CashSession objects
   */
  async getFlaggedCashSessions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      const result = await this.cashSessionService.getFlaggedCashSessions(tenantId);
      res.json(result);
    } catch (error: any) {
      logger.error('Error getting flagged cash sessions:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reports/discrepancies
   * 
   * Get discrepancy report for a date range
   * Used for financial analysis and staff performance tracking
   * 
   * @query startDate - Report start date (required, ISO format)
   * @query endDate - Report end date (required, ISO format)
   * @returns Detailed discrepancy report with summary and per-session details
   */
  async getDiscrepancyReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { startDate, endDate } = req.query;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Missing required query parameters: startDate, endDate' });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        res.status(400).json({ error: 'Invalid date format. Use ISO format (YYYY-MM-DD or ISO string)' });
        return;
      }

      const result = await this.cashSessionService.getDiscrepancyReport(tenantId, start, end);
      res.json(result);
    } catch (error: any) {
      logger.error('Error getting discrepancy report:', error.message);
      res.status(500).json({ error: error.message });
    }
  }
}

export const cashSessionController = new CashSessionController();
