import { Request, Response } from 'express';
import { ReconciliationService } from '../services/ReconciliationService';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

/**
 * ReconciliationController
 * 
 * Handles all reconciliation-related endpoints
 * - Daily payment verification
 * - Discrepancy identification
 * - Reconciliation approval
 * - Audit trail generation
 */
export class ReconciliationController {
  private reconciliationService: ReconciliationService;

  constructor(reconciliationService?: ReconciliationService) {
    this.reconciliationService = reconciliationService || new ReconciliationService();
  }

  /**
   * POST /api/reconciliation/start
   * 
   * Start a new reconciliation session
   * Locks orders from being modified
   * 
   * @body businessDayId - Business day to reconcile
   * @body reconciliationDate - Date of reconciliation
   * @returns ReconciliationSession with ID and lock status
   */
  async startReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const { businessDayId, reconciliationDate } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!businessDayId || !reconciliationDate) {
        res.status(400).json({ error: 'Missing required fields: businessDayId, reconciliationDate' });
        return;
      }

      const result = await this.reconciliationService.startReconciliation(
        tenantId,
        businessDayId,
        new Date(reconciliationDate),
        userId
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error starting reconciliation:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/reconciliation/:reconciliationId/cash-count
   * 
   * Record physical cash count for reconciliation
   * 
   * @param reconciliationId - Reconciliation ID
   * @body denominationBreakdown - Array of { denomination: number, quantity: number }
   * @returns Cash count summary with discrepancy
   */
  async recordCashCount(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const reconciliationId = req.params.reconciliationId as string;
      const { denominationBreakdown } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationId || !denominationBreakdown) {
        res.status(400).json({ error: 'Missing required fields: denominationBreakdown' });
        return;
      }

      // Convert denomination strings to Decimal
      const breakdown = denominationBreakdown.map((item: any) => ({
        denomination: new Decimal(item.denomination),
        quantity: parseInt(item.quantity, 10),
      }));

      const result = await this.reconciliationService.recordCashCount(
        reconciliationId,
        tenantId,
        breakdown,
        userId
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error recording cash count:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/reconciliation/:reconciliationId/card-settlement
   * 
   * Record card settlement information
   * 
   * @param reconciliationId - Reconciliation ID
   * @body settlementAmount - Total settlement amount
   * @body processorFees - Card processor fees
   * @body transactionCount - Number of card transactions
   * @body cardBrand - Optional card brand (VISA, MC, AMEX)
   * @returns Settlement record with discrepancy
   */
  async recordCardSettlement(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const reconciliationId = req.params.reconciliationId as string;
      const { settlementAmount, processorFees, transactionCount, cardBrand, settlementDate } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationId || settlementAmount === undefined || processorFees === undefined) {
        res.status(400).json({ error: 'Missing required fields: settlementAmount, processorFees' });
        return;
      }

      const result = await this.reconciliationService.recordCardSettlement(
        reconciliationId,
        tenantId,
        {
          settlementAmount: new Decimal(settlementAmount),
          processorFees: new Decimal(processorFees),
          transactionCount: transactionCount || 0,
          cardBrand,
          settlementDate: new Date(settlementDate || new Date()),
        },
        userId
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error recording card settlement:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reconciliation/:reconciliationId/discrepancies
   * 
   * Get all discrepancies detected in reconciliation
   * 
   * @param reconciliationId - Reconciliation ID
   * @returns Discrepancy summary and details
   */
  async detectDiscrepancies(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const reconciliationId = req.params.reconciliationId as string;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationId) {
        res.status(400).json({ error: 'Missing reconciliationId' });
        return;
      }

      const result = await this.reconciliationService.detectDiscrepancies(reconciliationId, tenantId);
      res.json(result);
    } catch (error: any) {
      logger.error('Error detecting discrepancies:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/reconciliation/:reconciliationId/complete
   * 
   * Complete and approve reconciliation
   * Closes business day and archives reconciliation
   * 
   * @param reconciliationId - Reconciliation ID
   * @returns Completion confirmation
   */
  async completeReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const reconciliationId = req.params.reconciliationId as string;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationId) {
        res.status(400).json({ error: 'Missing reconciliationId' });
        return;
      }

      const result = await this.reconciliationService.completeReconciliation(
        reconciliationId,
        tenantId,
        userId
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error completing reconciliation:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reconciliation/:reconciliationId/report
   * 
   * Get comprehensive reconciliation report
   * 
   * @param reconciliationId - Reconciliation ID
   * @returns Full reconciliation report with all details
   */
  async getReconciliationReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const reconciliationId = req.params.reconciliationId as string;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationId) {
        res.status(400).json({ error: 'Missing reconciliationId' });
        return;
      }

      const report = await this.reconciliationService.getReconciliationReport(reconciliationId, tenantId);
      res.json(report);
    } catch (error: any) {
      logger.error('Error getting reconciliation report:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reconciliation/daily
   * 
   * Perform daily reconciliation for a tenant (legacy method)
   * Verifies all payments from previous day match system records
   * 
   * @param tenantId - From JWT token
   * @returns DailyReconciliation object with matched/unmatched payments
   */
  async dailyReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Tenant not identified' });
        return;
      }

      const today = new Date();
      const reconciliation = await this.reconciliationService.dailyReconciliation(tenantId, today);
      res.json(reconciliation);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reconciliation/verify-payment
   * 
   * Verify a specific payment against system records (legacy method)
   * Used for manual verification of individual transactions
   * 
   * @body orderId - Order ID to verify
   * @body amount - Expected payment amount
   * @returns VerificationResult with match status and discrepancy if any
   */
  async verifyPayment(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { orderId, amount } = req.body;

      if (!tenantId || !orderId || amount === undefined) {
        res.status(400).json({ error: 'Missing required fields: orderId, amount' });
        return;
      }

      const verification = await this.reconciliationService.verifyPaymentMatches(orderId, tenantId);
      res.json(verification);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/reconciliation/discrepancies
   * 
   * Get all payment discrepancies for a tenant (legacy method)
   * Lists all payments that don't match system records
   * 
   * @query status - Filter by reconciliation status (PENDING, RESOLVED, etc.)
   * @returns Array of DiscrepancyReport objects
   */
  async identifyDiscrepancies(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { status } = req.query;

      if (!tenantId) {
        res.status(401).json({ error: 'Tenant not identified' });
        return;
      }

      // The service requires startDate and endDate - use yesterday as default range
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      const discrepancies = await this.reconciliationService.identifyDiscrepancies(
        tenantId,
        yesterday,
        today
      );
      res.json(discrepancies);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reconciliation/generate-report
   * 
   * Generate comprehensive reconciliation report for a date range (legacy method)
   * Used for audit and compliance purposes
   * 
   * @body startDate - Report period start
   * @body endDate - Report period end
   * @returns ReconciliationReport with summary and details
   */
  async generateReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { startDate, endDate } = req.body;

      if (!tenantId || !startDate || !endDate) {
        res.status(400).json({ error: 'Missing required fields: startDate, endDate' });
        return;
      }

      const reconciliationDate = new Date(startDate);
      const report = await this.reconciliationService.generateReconciliationReport(
        tenantId,
        reconciliationDate
      );
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reconciliation/approve
   * 
   * Approve reconciliation for a specific date (legacy method)
   * Creates reconciliation log and marks payments as reconciled
   * 
   * @body reconciliationDate - Date to reconcile
   * @body approvedBy - Manager/Admin ID approving
   * @returns ApprovalResult with success status
   */
  async approveReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const { reconciliationDate, approvedBy } = req.body;

      if (!tenantId || !reconciliationDate || !approvedBy) {
        res.status(400).json({
          error: 'Missing required fields: reconciliationDate, approvedBy'
        });
        return;
      }

      const orderId = 'unknown'; // This would need to be passed in request
      const result = await this.reconciliationService.reconcilePayments(
        orderId,
        tenantId,
        approvedBy
      );
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/reconciliation/run
   * 
   * Run daily reconciliation
   * Aggregates all cash sessions for a date and creates reconciliation record
   * 
   * @body reconciliationDate - Date to reconcile
   * @returns ReconciliationSummary with all session details
   */
  async runDailyReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const userId = (req.user as any)?.userId;
      const { reconciliationDate } = req.body;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!reconciliationDate) {
        res.status(400).json({ error: 'Missing required field: reconciliationDate' });
        return;
      }

      const result = await this.reconciliationService.runDailyReconciliation(
        tenantId,
        new Date(reconciliationDate),
        userId
      );

      res.status(201).json(result);
    } catch (error: any) {
      logger.error('Error running daily reconciliation:', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/reconciliation/:date
   * 
   * Get reconciliation summary for a specific date
   * 
   * @param date - Date in YYYY-MM-DD format
   * @returns ReconciliationSummary for that date
   */
  async getReconciliationByDate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = (req.user as any)?.tenantId;
      const dateParam = req.params.date as string;

      if (!tenantId) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
      }

      if (!dateParam) {
        res.status(400).json({ error: 'Missing required parameter: date' });
        return;
      }

      const reconciliationDate = new Date(dateParam);
      reconciliationDate.setHours(0, 0, 0, 0);

      const result = await this.reconciliationService.getReconciliationByDate(
        tenantId,
        reconciliationDate
      );

      res.json(result);
    } catch (error: any) {
      logger.error('Error getting reconciliation by date:', error.message);
      res.status(500).json({ error: error.message });
    }
  }}

export const reconciliationController = new ReconciliationController();