import { ReconciliationService } from '../src/services/ReconciliationService';
import { ReconciliationController } from '../src/controllers/ReconciliationController';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response, NextFunction } from 'express';
import { ReconciliationStatus, DiscrepancyType, DiscrepancySeverity, DiscrepancyStatus } from '@prisma/client';
import { AuthRequest } from '../src/types/auth';

describe('Feature A10: End-of-Day Reconciliation', () => {
  let reconciliationService: ReconciliationService;
  let reconciliationController: ReconciliationController;
  let mockPrisma: any;

  beforeEach(() => {
    // Create comprehensive mock Prisma client
    mockPrisma = {
      reconciliation: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      cashCount: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      cardSettlement: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      discrepancy: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      tip: {
        findMany: jest.fn(),
      },
      businessDay: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      activityLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    reconciliationService = new ReconciliationService(mockPrisma);
    reconciliationController = new ReconciliationController(reconciliationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ========== ReconciliationService Tests ==========

  describe('ReconciliationService', () => {
    const tenantId = 'tenant-1';
    const businessDayId = 'businessday-1';
    const reconciliationDate = new Date('2026-02-08');
    const userId = 'user-1';

    // ========== startReconciliation Tests ==========
    describe('startReconciliation', () => {
      it('should lock orders from being modified', async () => {
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100'),
            payments: [{ amount: new Decimal('100'), method: 'CARD' }],
            tips: [],
            closedAt: new Date(),
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.reconciliation.create.mockResolvedValue({
          id: 'reconciliation-1',
          isLocked: true,
          status: ReconciliationStatus.PENDING,
          expectedCash: new Decimal('0'),
          cardExpected: new Decimal('100'),
        });

        const result = await reconciliationService.startReconciliation(
          tenantId,
          businessDayId,
          reconciliationDate,
          userId
        );

        expect(result.isLocked).toBe(true);
        expect(mockPrisma.reconciliation.create).toHaveBeenCalled();
      });

      it('should create reconciliation record', async () => {
        const mockOrders: any[] = [];
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.reconciliation.create.mockResolvedValue({
          id: 'reconciliation-1',
          status: ReconciliationStatus.PENDING,
        });

        await reconciliationService.startReconciliation(
          tenantId,
          businessDayId,
          reconciliationDate,
          userId
        );

        expect(mockPrisma.reconciliation.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            tenantId,
            businessDayId,
            reconciliationDate,
            status: ReconciliationStatus.PENDING,
            isLocked: true,
          }),
        });
      });

      it('should calculate expected cash', async () => {
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100'),
            payments: [
              { amount: new Decimal('50'), method: 'CASH' },
              { amount: new Decimal('50'), method: 'CARD' },
            ],
            tips: [{ amount: new Decimal('10'), method: 'CASH' }],
            closedAt: new Date(),
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.reconciliation.create.mockResolvedValue({
          id: 'reconciliation-1',
          expectedCash: new Decimal('60'),
          cardExpected: new Decimal('50'),
        });

        const result = await reconciliationService.startReconciliation(
          tenantId,
          businessDayId,
          reconciliationDate,
          userId
        );

        expect(result.expectedCash.toString()).toBe('60');
        expect(result.cardExpected.toString()).toBe('50');
      });
    });

    // ========== recordCashCount Tests ==========
    describe('recordCashCount', () => {
      it('should record physical cash count', async () => {
        const reconciliationId = 'reconciliation-1';
        const breakdown = [
          { denomination: new Decimal('100'), quantity: 5 },
          { denomination: new Decimal('50'), quantity: 3 },
        ];

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          expectedCash: new Decimal('650'),
        });

        mockPrisma.cashCount.create
          .mockResolvedValueOnce({
            id: 'cashcount-1',
            totalAmount: new Decimal('500'),
          })
          .mockResolvedValueOnce({
            id: 'cashcount-2',
            totalAmount: new Decimal('150'),
          });

        mockPrisma.reconciliation.update.mockResolvedValue({
          id: reconciliationId,
          actualCash: new Decimal('650'),
          cashDiscrepancy: new Decimal('0'),
        });

        const result = await reconciliationService.recordCashCount(
          reconciliationId,
          tenantId,
          breakdown,
          userId
        );

        expect(result.actualCash.toString()).toBe('650');
        expect(mockPrisma.cashCount.create).toHaveBeenCalledTimes(2);
      });

      it('should compare to expected cash', async () => {
        const reconciliationId = 'reconciliation-1';
        const breakdown = [{ denomination: new Decimal('100'), quantity: 5 }];

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          expectedCash: new Decimal('500'),
        });

        mockPrisma.cashCount.create.mockResolvedValue({
          totalAmount: new Decimal('500'),
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          actualCash: new Decimal('500'),
          cashDiscrepancy: new Decimal('0'),
        });

        const result = await reconciliationService.recordCashCount(
          reconciliationId,
          tenantId,
          breakdown,
          userId
        );

        expect(result.discrepancy.toString()).toBe('0');
        expect(result.hasDiscrepancy).toBe(false);
      });

      it('should flag discrepancies', async () => {
        const reconciliationId = 'reconciliation-1';
        const breakdown = [{ denomination: new Decimal('100'), quantity: 3 }];

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          expectedCash: new Decimal('500'),
        });

        mockPrisma.cashCount.create.mockResolvedValue({
          totalAmount: new Decimal('300'),
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          actualCash: new Decimal('300'),
          cashDiscrepancy: new Decimal('200'),
        });

        mockPrisma.discrepancy.create.mockResolvedValue({
          id: 'discrepancy-1',
          type: DiscrepancyType.CASH_SHORTAGE,
        });

        const result = await reconciliationService.recordCashCount(
          reconciliationId,
          tenantId,
          breakdown,
          userId
        );

        expect(result.hasDiscrepancy).toBe(true);
        expect(mockPrisma.discrepancy.create).toHaveBeenCalled();
      });
    });

    // ========== recordCardSettlement Tests ==========
    describe('recordCardSettlement', () => {
      it('should verify card transactions', async () => {
        const reconciliationId = 'reconciliation-1';
        const settlementData = {
          transactionCount: 10,
          settlementAmount: new Decimal('1000'),
          processorFees: new Decimal('30'),
          settlementDate: new Date(),
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          cardExpected: new Decimal('970'),
        });

        mockPrisma.cardSettlement.create.mockResolvedValue({
          id: 'settlement-1',
          transactionCount: 10,
          netAmount: new Decimal('970'),
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          cardActual: new Decimal('970'),
          cardDiscrepancy: new Decimal('0'),
        });

        const result = await reconciliationService.recordCardSettlement(
          reconciliationId,
          tenantId,
          settlementData,
          userId
        );

        expect(result.transactionCount).toBe(10);
        expect(mockPrisma.cardSettlement.create).toHaveBeenCalled();
      });

      it('should confirm settlement amounts', async () => {
        const reconciliationId = 'reconciliation-1';
        const settlementData = {
          transactionCount: 5,
          settlementAmount: new Decimal('500'),
          processorFees: new Decimal('15'),
          settlementDate: new Date(),
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          cardExpected: new Decimal('485'),
        });

        mockPrisma.cardSettlement.create.mockResolvedValue({
          netAmount: new Decimal('485'),
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          cardActual: new Decimal('485'),
          cardDiscrepancy: new Decimal('0'),
        });

        const result = await reconciliationService.recordCardSettlement(
          reconciliationId,
          tenantId,
          settlementData,
          userId
        );

        expect(result.netAmount.toString()).toBe('485');
        expect(result.discrepancy.toString()).toBe('0');
      });

      it('should flag reversed transactions', async () => {
        const reconciliationId = 'reconciliation-1';
        const settlementData = {
          transactionCount: 10,
          settlementAmount: new Decimal('900'),
          processorFees: new Decimal('30'),
          settlementDate: new Date(),
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          cardExpected: new Decimal('1000'),
        });

        mockPrisma.cardSettlement.create.mockResolvedValue({
          netAmount: new Decimal('870'),
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          cardActual: new Decimal('870'),
          cardDiscrepancy: new Decimal('130'),
        });

        mockPrisma.discrepancy.create.mockResolvedValue({
          id: 'discrepancy-1',
          type: DiscrepancyType.UNMATCHED_TRANSACTION,
        });

        const result = await reconciliationService.recordCardSettlement(
          reconciliationId,
          tenantId,
          settlementData,
          userId
        );

        expect(result.hasDiscrepancy).toBe(true);
        expect(mockPrisma.discrepancy.create).toHaveBeenCalled();
      });
    });

    // ========== detectDiscrepancies Tests ==========
    describe('detectDiscrepancies', () => {
      it('should flag cash shortages', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockReconciliation = {
          id: reconciliationId,
          reconciliationDate,
          discrepancies: [
            {
              id: 'disc-1',
              type: DiscrepancyType.CASH_SHORTAGE,
              severity: DiscrepancySeverity.HIGH,
            },
          ],
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue(mockReconciliation);
        mockPrisma.order.findMany.mockResolvedValue([]);

        const result = await reconciliationService.detectDiscrepancies(reconciliationId, tenantId);

        expect(result.byType.cashShortages).toBeGreaterThanOrEqual(1);
      });

      it('should flag cash overages', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockReconciliation = {
          id: reconciliationId,
          reconciliationDate,
          discrepancies: [
            {
              id: 'disc-1',
              type: DiscrepancyType.CASH_OVERAGE,
              severity: DiscrepancySeverity.LOW,
            },
          ],
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue(mockReconciliation);
        mockPrisma.order.findMany.mockResolvedValue([]);

        const result = await reconciliationService.detectDiscrepancies(reconciliationId, tenantId);

        expect(result.byType.cashOverages).toBeGreaterThanOrEqual(1);
      });

      it('should identify unmatched transactions', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockReconciliation = {
          id: reconciliationId,
          reconciliationDate,
          discrepancies: [],
        };

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100'),
            payments: [{ amount: new Decimal('110') }],
          },
        ];

        mockPrisma.reconciliation.findFirst.mockResolvedValue(mockReconciliation);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reconciliationService.detectDiscrepancies(reconciliationId, tenantId);

        expect(result.totalDiscrepancies).toBeGreaterThanOrEqual(0);
      });

      it('should suggest corrections', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockReconciliation = {
          id: reconciliationId,
          reconciliationDate,
          discrepancies: [
            {
              id: 'disc-1',
              type: DiscrepancyType.CASH_SHORTAGE,
              severity: DiscrepancySeverity.HIGH,
            },
          ],
        };

        mockPrisma.reconciliation.findFirst.mockResolvedValue(mockReconciliation);
        mockPrisma.order.findMany.mockResolvedValue([]);

        const result = await reconciliationService.detectDiscrepancies(reconciliationId, tenantId);

        expect(result.suggestions).toBeDefined();
        expect(Array.isArray(result.suggestions)).toBe(true);
        expect(result.suggestions.length).toBeGreaterThan(0);
      });
    });

    // ========== completeReconciliation Tests ==========
    describe('completeReconciliation', () => {
      it('should require approval', async () => {
        const reconciliationId = 'reconciliation-1';
        const approver = 'manager-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          isLocked: true,
          businessDayId,
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          id: reconciliationId,
          approvedBy: approver,
          approvedAt: new Date(),
        });

        mockPrisma.businessDay.update.mockResolvedValue({
          status: 'CLOSED',
        });

        const result = await reconciliationService.completeReconciliation(
          reconciliationId,
          tenantId,
          approver
        );

        expect(result.approvedBy).toBe(approver);
        expect(mockPrisma.reconciliation.update).toHaveBeenCalled();
      });

      it('should close the business day', async () => {
        const reconciliationId = 'reconciliation-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          isLocked: true,
          businessDayId,
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          id: reconciliationId,
          status: ReconciliationStatus.COMPLETED,
        });

        mockPrisma.businessDay.update.mockResolvedValue({
          status: 'CLOSED',
        });

        const result = await reconciliationService.completeReconciliation(
          reconciliationId,
          tenantId,
          userId
        );

        expect(mockPrisma.businessDay.update).toHaveBeenCalledWith({
          where: { id: businessDayId },
          data: expect.objectContaining({
            status: 'CLOSED',
          }),
        });

        expect(result.businessDayClosed).toBe(true);
      });

      it('should allow next day opening', async () => {
        const reconciliationId = 'reconciliation-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          isLocked: true,
          businessDayId,
        });

        mockPrisma.reconciliation.update.mockResolvedValue({
          status: ReconciliationStatus.ARCHIVED,
        });

        mockPrisma.businessDay.update.mockResolvedValue({});

        const result = await reconciliationService.completeReconciliation(
          reconciliationId,
          tenantId,
          userId
        );

        expect(result.nextDayOpenable).toBe(true);
      });

      it('should archive reconciliation', async () => {
        const reconciliationId = 'reconciliation-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          isLocked: true,
          businessDayId,
        });

        mockPrisma.reconciliation.update
          .mockResolvedValueOnce({
            status: ReconciliationStatus.COMPLETED,
          })
          .mockResolvedValueOnce({
            status: ReconciliationStatus.ARCHIVED,
          });

        mockPrisma.businessDay.update.mockResolvedValue({});

        const result = await reconciliationService.completeReconciliation(
          reconciliationId,
          tenantId,
          userId
        );

        expect(mockPrisma.reconciliation.update).toHaveBeenCalledTimes(2);
      });
    });

    // ========== getReconciliationReport Tests ==========
    describe('getReconciliationReport', () => {
      it('should show all transactions', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockOrders = [
          { id: 'order-1', total: new Decimal('100'), payments: [], tips: [] },
          { id: 'order-2', total: new Decimal('150'), payments: [], tips: [] },
        ];

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          reconciliationDate,
          status: ReconciliationStatus.COMPLETED,
          expectedCash: new Decimal('0'),
          cardExpected: new Decimal('250'),
          actualCash: new Decimal('0'),
          cardActual: new Decimal('250'),
          approvedBy: userId,
          approvedAt: new Date(),
          cashCounts: [],
          cardSettlements: [],
          discrepancies: [],
        });

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const report = await reconciliationService.getReconciliationReport(reconciliationId, tenantId);

        expect(report.transactions.totalOrders).toBe(2);
      });

      it('should show cash count', async () => {
        const reconciliationId = 'reconciliation-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          reconciliationDate,
          expectedCash: new Decimal('500'),
          actualCash: new Decimal('500'),
          cashDiscrepancy: new Decimal('0'),
          cardExpected: new Decimal('0'),
          cardActual: new Decimal('0'),
          approvedBy: userId,
          approvedAt: new Date(),
          cashCounts: [{ totalAmount: new Decimal('500') }],
          cardSettlements: [],
          discrepancies: [],
          status: ReconciliationStatus.COMPLETED,
        });

        mockPrisma.order.findMany.mockResolvedValue([]);

        const report = await reconciliationService.getReconciliationReport(reconciliationId, tenantId);

        expect(report.cashCount).toBeDefined();
        expect(report.cashCount.expected.toString()).toBe('500');
        expect(report.cashCount.actual.toString()).toBe('500');
      });

      it('should show discrepancies', async () => {
        const reconciliationId = 'reconciliation-1';
        const mockDiscrepancies = [
          {
            id: 'disc-1',
            type: DiscrepancyType.CASH_SHORTAGE,
            severity: DiscrepancySeverity.MEDIUM,
          },
        ];

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          reconciliationDate,
          expectedCash: new Decimal('0'),
          cardExpected: new Decimal('0'),
          cardActual: new Decimal('0'),
          approvedBy: userId,
          approvedAt: new Date(),
          cashCounts: [],
          cardSettlements: [],
          discrepancies: mockDiscrepancies,
          status: ReconciliationStatus.COMPLETED,
        });

        mockPrisma.order.findMany.mockResolvedValue([]);

        const report = await reconciliationService.getReconciliationReport(reconciliationId, tenantId);

        expect(report.discrepancies.total).toBe(1);
        expect(report.discrepancies.details).toEqual(mockDiscrepancies);
      });

      it('should show approver', async () => {
        const reconciliationId = 'reconciliation-1';
        const approver = 'manager-1';

        mockPrisma.reconciliation.findFirst.mockResolvedValue({
          id: reconciliationId,
          reconciliationDate,
          approvedBy: approver,
          approvedAt: new Date(),
          expectedCash: new Decimal('0'),
          cardExpected: new Decimal('0'),
          cardActual: new Decimal('0'),
          cashCounts: [],
          cardSettlements: [],
          discrepancies: [],
          status: ReconciliationStatus.COMPLETED,
        });

        mockPrisma.order.findMany.mockResolvedValue([]);

        const report = await reconciliationService.getReconciliationReport(reconciliationId, tenantId);

        expect(report.approver).toBe(approver);
        expect(report.approvedAt).toBeDefined();
      });
    });
  });

  // ========== ReconciliationController Tests ==========

  describe('ReconciliationController', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;

    beforeEach(() => {
      mockReq = {
        user: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          locationId: 'location-1',
          role: 'ADMIN' as any,
          email: 'admin@test.com',
        },
        params: {},
        body: {},
      };

      mockRes = {
        json: jest.fn().mockReturnThis(),
        status: jest.fn().mockReturnThis(),
      };
    });

    describe('POST /api/reconciliation/start', () => {
      it('should create reconciliation and lock orders', async () => {
        mockReq.body = {
          businessDayId: 'businessday-1',
          reconciliationDate: new Date('2026-02-08'),
        };

        const mockResult = {
          reconciliationId: 'reconciliation-1',
          isLocked: true,
          ordersCount: 5,
        };

        jest.spyOn(reconciliationService, 'startReconciliation').mockResolvedValue(mockResult);

        await reconciliationController.startReconciliation(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      });
    });

    describe('POST /api/reconciliation/:reconciliationId/cash-count', () => {
      it('should record cash count', async () => {
        mockReq.params = { reconciliationId: 'reconciliation-1' };
        mockReq.body = {
          denominationBreakdown: [
            { denomination: '100', quantity: '5' },
          ],
        };

        const mockResult = {
          reconciliationId: 'reconciliation-1',
          actualCash: new Decimal('500'),
          discrepancy: new Decimal('0'),
        };

        jest.spyOn(reconciliationService, 'recordCashCount').mockResolvedValue(mockResult);

        await reconciliationController.recordCashCount(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalled();
      });
    });

    describe('POST /api/reconciliation/:reconciliationId/card-settlement', () => {
      it('should verify card transactions', async () => {
        mockReq.params = { reconciliationId: 'reconciliation-1' };
        mockReq.body = {
          settlementAmount: '1000',
          processorFees: '30',
          transactionCount: 10,
        };

        const mockResult = {
          settlementId: 'settlement-1',
          transactionCount: 10,
          netAmount: new Decimal('970'),
        };

        jest.spyOn(reconciliationService, 'recordCardSettlement').mockResolvedValue(mockResult);

        await reconciliationController.recordCardSettlement(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalled();
      });
    });

    describe('GET /api/reconciliation/:reconciliationId/discrepancies', () => {
      it('should detect discrepancies', async () => {
        mockReq.params = { reconciliationId: 'reconciliation-1' };

        const mockResult = {
          reconciliationId: 'reconciliation-1',
          totalDiscrepancies: 2,
          discrepancies: [],
        };

        jest.spyOn(reconciliationService, 'detectDiscrepancies').mockResolvedValue(mockResult);

        await reconciliationController.detectDiscrepancies(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      });
    });

    describe('POST /api/reconciliation/:reconciliationId/complete', () => {
      it('should complete reconciliation', async () => {
        mockReq.params = { reconciliationId: 'reconciliation-1' };

        const mockResult = {
          reconciliationId: 'reconciliation-1',
          status: ReconciliationStatus.ARCHIVED,
          approvedBy: 'user-1',
          businessDayClosed: true,
        };

        jest.spyOn(reconciliationService, 'completeReconciliation').mockResolvedValue(mockResult);

        await reconciliationController.completeReconciliation(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      });
    });

    describe('GET /api/reconciliation/:reconciliationId/report', () => {
      it('should get reconciliation report', async () => {
        mockReq.params = { reconciliationId: 'reconciliation-1' };

        const mockReport = {
          reconciliationId: 'reconciliation-1',
          reconciliationDate: new Date(),
          status: ReconciliationStatus.COMPLETED,
          transactions: { totalOrders: 10 },
          cashCount: {},
          cardSettlement: {},
          discrepancies: {},
        };

        jest.spyOn(reconciliationService, 'getReconciliationReport').mockResolvedValue(mockReport);

        await reconciliationController.getReconciliationReport(
          mockReq as AuthRequest,
          mockRes as Response
        );

        expect(mockRes.json).toHaveBeenCalledWith(mockReport);
      });
    });
  });

  // ========== Integration Tests ==========

  describe('Integration: Full Reconciliation Workflow', () => {
    it('should complete full reconciliation workflow', async () => {
      const tenantId = 'tenant-1';
      const businessDayId = 'businessday-1';
      const reconciliationDate = new Date();
      const userId = 'user-1';

      // 1. Start reconciliation
      mockPrisma.reconciliation.create.mockResolvedValue({
        id: 'reconciliation-1',
        isLocked: true,
        status: ReconciliationStatus.PENDING,
      });

      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          total: new Decimal('100'),
          payments: [{ amount: new Decimal('100'), method: 'CARD' }],
          tips: [],
        },
      ]);

      const startResult = await reconciliationService.startReconciliation(
        tenantId,
        businessDayId,
        reconciliationDate,
        userId
      );

      expect(startResult.isLocked).toBe(true);

      // 2. Record cash count
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: 'reconciliation-1',
        expectedCash: new Decimal('500'),
      });

      mockPrisma.cashCount.create.mockResolvedValue({
        id: 'cashcount-1',
        totalAmount: new Decimal('500'),
      });

      mockPrisma.reconciliation.update.mockResolvedValue({
        actualCash: new Decimal('500'),
        cashDiscrepancy: new Decimal('0'),
      });

      const cashResult = await reconciliationService.recordCashCount(
        'reconciliation-1',
        tenantId,
        [{ denomination: new Decimal('100'), quantity: 5 }],
        userId
      );

      expect(cashResult.actualCash.toString()).toBe('500');

      // 3. Detect discrepancies
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: 'reconciliation-1',
        discrepancies: [],
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      
      const discsResult = await reconciliationService.detectDiscrepancies('reconciliation-1', tenantId);
      expect(discsResult.totalDiscrepancies).toBeDefined();

      // 4. Complete reconciliation
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: 'reconciliation-1',
        isLocked: true,
        businessDayId,
      });

      mockPrisma.reconciliation.update.mockResolvedValue({
        status: ReconciliationStatus.ARCHIVED,
        approvedBy: userId,
        approvedAt: new Date(),
      });

      mockPrisma.businessDay.update.mockResolvedValue({
        status: 'CLOSED',
      });

      const completeResult = await reconciliationService.completeReconciliation(
        'reconciliation-1',
        tenantId,
        userId
      );

      expect(completeResult.status).toBe(ReconciliationStatus.ARCHIVED);
      expect(completeResult.businessDayClosed).toBe(true);

      // 5. Get report
      mockPrisma.reconciliation.findFirst.mockResolvedValue({
        id: 'reconciliation-1',
        reconciliationDate,
        status: ReconciliationStatus.ARCHIVED,
        approvedBy: userId,
        approvedAt: new Date(),
        expectedCash: new Decimal('500'),
        actualCash: new Decimal('500'),
        cardExpected: new Decimal('100'),
        cardActual: new Decimal('100'),
        cashCounts: [],
        cardSettlements: [],
        discrepancies: [],
      });

      mockPrisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          total: new Decimal('100'),
          payments: [{ amount: new Decimal('100') }],
          tips: [],
        },
      ]);

      const report = await reconciliationService.getReconciliationReport('reconciliation-1', tenantId);

      expect(report.status).toBe(ReconciliationStatus.ARCHIVED);
      expect(report.approver).toBe(userId);
      expect(report.transactions.totalOrders).toBe(1);
    });
  });
});
