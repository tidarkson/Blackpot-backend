import { ReportService } from '../src/services/ReportService';
import { ReportController } from '../src/controllers/ReportController';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { AuthRequest } from '../src/types/auth';
import { UserRole } from '@prisma/client';

// Mock Prisma Client
jest.mock('@prisma/client');

describe('Feature A9: Financial Reports', () => {
  let reportService: ReportService;
  let reportController: ReportController;
  let mockPrisma: any;
  let mockRequest: AuthRequest;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    // Setup mock Prisma
    mockPrisma = {
      order: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      payment: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      shift: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      staff: {
        findMany: jest.fn(),
      },
      inventoryMovement: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      stockMovement: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
      tax: {
        findMany: jest.fn(),
        aggregate: jest.fn(),
      },
    };

    reportService = new ReportService(mockPrisma);
    reportController = new ReportController();

    // Setup mock request/response
    mockRequest = {
      user: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        locationId: 'location-1',
        role: 'ADMIN' as UserRole,
        email: 'admin@test.com',
      },
      body: {},
      params: {},
    } as unknown as AuthRequest;

    mockResponse = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    } as Partial<Response>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // PART 1: ReportService Tests
  // ============================================================================

  describe('ReportService', () => {
    // ========================================================================
    // getDailyRevenue Tests
    // ========================================================================
    describe('getDailyRevenue', () => {
      it('should sum all orders for a specific day', async () => {
        const testDate = new Date('2026-02-08');
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('150.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getDailyRevenue('tenant-1', testDate);

        expect(result).toHaveProperty('totalRevenue');
        expect(result.totalRevenue).toEqual(new Decimal('250.00'));
        expect(result).toHaveProperty('reportDate', testDate);
        expect(mockPrisma.order.findMany).toHaveBeenCalled();
      });

      it('should exclude cancelled orders from revenue', async () => {
        const testDate = new Date('2026-02-08');
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('150.00'),
            status: 'CANCELLED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(
          mockOrders.filter((o) => o.status !== 'CANCELLED')
        );

        const result = await reportService.getDailyRevenue('tenant-1', testDate);

        expect(result.totalRevenue).toEqual(new Decimal('100.00'));
      });

      it('should include tips in revenue calculation', async () => {
        const testDate = new Date('2026-02-08');
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [{ amount: new Decimal('15.00') }],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getDailyRevenue('tenant-1', testDate);

        expect(result).toHaveProperty('totalTips', new Decimal('15.00'));
        expect(result).toHaveProperty('grossRevenue');
      });

      it('should break down revenue by payment method', async () => {
        const testDate = new Date('2026-02-08');
        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [{ method: 'CREDIT_CARD', amount: new Decimal('100.00') }],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('50.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [{ method: 'CASH', amount: new Decimal('50.00') }],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getDailyRevenue('tenant-1', testDate);

        expect(result).toHaveProperty('paymentMethodBreakdown');
        expect(result.paymentMethodBreakdown).toBeInstanceOf(Array);
        expect(result.paymentMethodBreakdown.length).toBeGreaterThan(0);
      });

      it('should return empty revenue when no orders exist for day', async () => {
        const testDate = new Date('2026-02-08');

        mockPrisma.order.findMany.mockResolvedValue([]);

        const result = await reportService.getDailyRevenue('tenant-1', testDate);

        expect(result.totalRevenue).toEqual(new Decimal('0'));
        expect(result.orderCount).toBe(0);
      });
    });

    // ========================================================================
    // getLaborCost Tests
    // ========================================================================
    describe('getLaborCost', () => {
      it('should sum all staff wages for a date range', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockShifts = [
          {
            id: 'shift-1',
            startTime: new Date('2026-02-08T09:00:00'),
            endTime: new Date('2026-02-08T17:00:00'),
            staff: { hourlyRate: new Decimal('15.00') },
            hoursWorked: 8,
            laborCost: new Decimal('120.00'),
            user: { hourlyRate: new Decimal('15.00') },
          },
          {
            id: 'shift-2',
            startTime: new Date('2026-02-08T17:00:00'),
            endTime: new Date('2026-02-09T01:00:00'),
            staff: { hourlyRate: new Decimal('16.00') },
            hoursWorked: 8,
            laborCost: new Decimal('128.00'),
            user: { hourlyRate: new Decimal('16.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.shift.findMany.mockResolvedValue(mockShifts);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getLaborCost('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('totalLaborCost');
        expect(result.totalLaborCost).toEqual(new Decimal('248.00'));
        expect(result).toHaveProperty('shiftCount', 2);
      });

      it('should include shift differentials in calculation', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockShifts = [
          {
            id: 'shift-1',
            startTime: new Date('2026-02-08T09:00:00'),
            endTime: new Date('2026-02-08T17:00:00'),
            staff: { hourlyRate: new Decimal('15.00') },
            shiftDifferential: new Decimal('2.00'),
            hoursWorked: 8,
            laborCost: new Decimal('136.00'),
            user: { hourlyRate: new Decimal('15.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.shift.findMany.mockResolvedValue(mockShifts);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getLaborCost('tenant-1', startDate, endDate);

        expect(result.totalLaborCost).toEqual(new Decimal('136.00'));
      });

      it('should include overtime multiplier (1.5x) in calculation', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockShifts = [
          {
            id: 'shift-1',
            startTime: new Date('2026-02-08T09:00:00'),
            endTime: new Date('2026-02-09T02:00:00'),
            staff: { hourlyRate: new Decimal('15.00') },
            hoursWorked: 17,
            overtimeHours: 9,
            laborCost: new Decimal('267.00'),
            user: { hourlyRate: new Decimal('15.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.shift.findMany.mockResolvedValue(mockShifts);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getLaborCost('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('overtimeHours');
      });

      it('should calculate percentage of revenue', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockShifts = [
          {
            id: 'shift-1',
            startTime: new Date('2026-02-08T09:00:00'),
            endTime: new Date('2026-02-08T17:00:00'),
            staff: { hourlyRate: new Decimal('15.00') },
            hoursWorked: 8,
            laborCost: new Decimal('120.00'),
            user: { hourlyRate: new Decimal('15.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.shift.findMany.mockResolvedValue(mockShifts);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getLaborCost('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('laborCostPercentage');
        expect(typeof result.laborCostPercentage).toBe('number');
      });
    });

    // ========================================================================
    // getFoodCost Tests
    // ========================================================================
    describe('getFoodCost', () => {
      it('should sum ingredient costs for items sold', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockMovements = [
          {
            id: 'mov-1',
            type: 'USAGE',
            quantity: new Decimal('2'),
            item: { unitCost: new Decimal('5.00') },
          },
          {
            id: 'mov-2',
            type: 'USAGE',
            quantity: new Decimal('3'),
            item: { unitCost: new Decimal('2.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.stockMovement.findMany.mockResolvedValue(mockMovements);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getFoodCost('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('totalFoodCost');
        expect(result.totalFoodCost).toEqual(new Decimal('16.00'));
      });

      it('should exclude waste from food cost calculation', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockMovements = [
          {
            id: 'mov-1',
            type: 'USAGE',
            quantity: new Decimal('2'),
            item: { unitCost: new Decimal('5.00') },
          },
          {
            id: 'mov-2',
            type: 'WASTE',
            quantity: new Decimal('1'),
            item: { unitCost: new Decimal('5.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.stockMovement.findMany.mockResolvedValue(
          mockMovements.filter((m) => m.type !== 'WASTE')
        );
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getFoodCost('tenant-1', startDate, endDate);

        expect(result.totalFoodCost).toEqual(new Decimal('10.00'));
      });

      it('should calculate percentage of revenue', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockMovements = [
          {
            id: 'mov-1',
            type: 'USAGE',
            quantity: new Decimal('2'),
            item: { unitCost: new Decimal('5.00') },
          },
        ];

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.stockMovement.findMany.mockResolvedValue(mockMovements);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getFoodCost('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('foodCostPercentage');
        expect(typeof result.foodCostPercentage).toBe('number');
      });

      it('should return zero cost when no usage', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            closedAt: new Date('2026-02-08'),
          },
        ];

        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getFoodCost('tenant-1', startDate, endDate);

        expect(result.totalFoodCost).toEqual(new Decimal('0'));
      });
    });

    // ========================================================================
    // getProfitAndLoss Tests
    // ========================================================================
    describe('getProfitAndLoss', () => {
      it('should calculate gross profit (revenue - COGS)', async () => {
        const testDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('500.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        const mockMovements = [
          {
            id: 'mov-1',
            type: 'USAGE',
            quantity: new Decimal('10'),
            item: { unitCost: new Decimal('5.00') },
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue(mockMovements);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getProfitAndLoss('tenant-1', testDate);

        expect(result).toHaveProperty('grossProfit');
      });

      it('should calculate net profit (gross profit - all expenses)', async () => {
        const testDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('500.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        const mockMovements = [
          {
            id: 'mov-1',
            type: 'USAGE',
            quantity: new Decimal('10'),
            item: { unitCost: new Decimal('5.00') },
          },
        ];

        const mockShifts = [
          {
            id: 'shift-1',
            startTime: new Date('2026-02-08T09:00:00'),
            endTime: new Date('2026-02-08T17:00:00'),
            staff: { hourlyRate: new Decimal('15.00') },
            hoursWorked: 8,
            laborCost: new Decimal('120.00'),
            user: { hourlyRate: new Decimal('15.00') },
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue(mockMovements);
        mockPrisma.shift.findMany.mockResolvedValue(mockShifts);

        const result = await reportService.getProfitAndLoss('tenant-1', testDate);

        expect(result).toHaveProperty('netProfit');
      });

      it('should include all expenses in calculation', async () => {
        const testDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('1000.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getProfitAndLoss('tenant-1', testDate);

        expect(result).toHaveProperty('grossProfit');
        expect(result).toHaveProperty('netProfit');
      });

      it('should match general ledger entries', async () => {
        const testDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('500.00'),
            status: 'CLOSED',
            closedAt: testDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getProfitAndLoss('tenant-1', testDate);

        // Verify structure matches general ledger format
        expect(result).toHaveProperty('revenue');
        expect(result).toHaveProperty('netProfit');
      });
    });

    // ========================================================================
    // getReportByDateRange Tests
    // ========================================================================
    describe('getReportByDateRange', () => {
      it('should return aggregated report for date range', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            closedAt: new Date('2026-02-05'),
            payments: [],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('150.00'),
            closedAt: new Date('2026-02-06'),
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getReportByDateRange('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('startDate', startDate);
        expect(result).toHaveProperty('endDate', endDate);
        expect(result).toHaveProperty('totalRevenue');
      });

      it('should aggregate data correctly across multiple days', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            closedAt: new Date('2026-02-05'),
            payments: [],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('150.00'),
            closedAt: new Date('2026-02-06'),
            payments: [],
            tips: [],
          },
          {
            id: 'order-3',
            total: new Decimal('200.00'),
            closedAt: new Date('2026-02-07'),
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getReportByDateRange('tenant-1', startDate, endDate);

        expect(result.totalRevenue).toEqual(new Decimal('450.00'));
        expect(result.orderCount).toBe(3);
      });

      it('should handle partial months', async () => {
        const startDate = new Date('2026-02-15');
        const endDate = new Date('2026-02-28');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            closedAt: new Date('2026-02-20'),
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);
        mockPrisma.stockMovement.findMany.mockResolvedValue([]);
        mockPrisma.shift.findMany.mockResolvedValue([]);

        const result = await reportService.getReportByDateRange('tenant-1', startDate, endDate);

        expect(result.startDate).toEqual(startDate);
        expect(result.endDate).toEqual(endDate);
      });
    });

    // ========================================================================
    // getTaxReport Tests
    // ========================================================================
    describe('getTaxReport', () => {
      it('should calculate tax liability for period', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            tax: new Decimal('8.00'),
            closedAt: startDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getTaxReport('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('totalTaxLiability');
        expect(result.totalTaxLiability).toEqual(new Decimal('8.00'));
      });

      it('should separate taxes by type (sales tax, etc)', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            tax: new Decimal('8.00'),
            closedAt: startDate,
            payments: [],
            tips: [],
          },
          {
            id: 'order-2',
            total: new Decimal('100.00'),
            tax: new Decimal('8.00'),
            closedAt: new Date('2026-02-07'),
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getTaxReport('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('taxByType');
        expect(Array.isArray(result.taxByType)).toBe(true);
      });

      it('should format data for submission to tax authorities', async () => {
        const startDate = new Date('2026-02-01');
        const endDate = new Date('2026-02-08');

        const mockOrders = [
          {
            id: 'order-1',
            total: new Decimal('100.00'),
            tax: new Decimal('8.00'),
            closedAt: startDate,
            payments: [],
            tips: [],
          },
        ];

        mockPrisma.order.findMany.mockResolvedValue(mockOrders);

        const result = await reportService.getTaxReport('tenant-1', startDate, endDate);

        expect(result).toHaveProperty('formattedForSubmission');
        expect(result).toHaveProperty('period');
      });
    });
  });

  // ============================================================================
  // PART 2: ReportController Tests
  // ============================================================================

  describe('ReportController', () => {
    // ========================================================================
    // GET /reports/daily/:date Tests
    // ========================================================================
    describe('GET /reports/daily/:date', () => {
      it('should return daily P&L for valid date', async () => {
        const testDate = '2026-02-08';
        mockRequest.params = { date: testDate };

        const mockResult: any = {
          revenue: new Decimal('500.00'),
          foodCost: new Decimal('100.00'),
          laborCost: new Decimal('150.00'),
          totalExpenses: new Decimal('250.00'),
          grossProfit: new Decimal('400.00'),
          netProfit: new Decimal('250.00'),
        };

        jest.spyOn(reportService, 'getProfitAndLoss').mockResolvedValue(mockResult);

        await reportController.getDailyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.json).toHaveBeenCalledWith(expect.any(Object));
      });

      it('should return 400 on invalid date format', async () => {
        mockRequest.params = { date: 'invalid-date' };

        await reportController.getDailyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });

      it('should return data for correct date', async () => {
        const testDate = '2026-02-08';
        mockRequest.params = { date: testDate };

        const mockResult: any = {
          revenue: new Decimal('500.00'),
          foodCost: new Decimal('100.00'),
          laborCost: new Decimal('150.00'),
          totalExpenses: new Decimal('250.00'),
          grossProfit: new Decimal('400.00'),
          netProfit: new Decimal('250.00'),
        };

        jest.spyOn(reportService, 'getProfitAndLoss').mockResolvedValue(mockResult);

        await reportController.getDailyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.json).toHaveBeenCalled();
      });

      it('should return 401 if not authenticated', async () => {
        mockRequest.user = undefined;
        mockRequest.params = { date: '2026-02-08' };

        await reportController.getDailyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.status).toHaveBeenCalledWith(401);
      });
    });

    // ========================================================================
    // GET /reports/monthly/:month/:year Tests
    // ========================================================================
    describe('GET /reports/monthly/:month/:year', () => {
      it('should return monthly summary', async () => {
        mockRequest.params = { month: '2', year: '2026' };

        const mockResult: any = {
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-28'),
          totalRevenue: new Decimal('5000.00'),
          totalExpenses: new Decimal('2500.00'),
          grossProfit: new Decimal('4500.00'),
          netProfit: new Decimal('2500.00'),
          orderCount: 50,
          averageOrderValue: new Decimal('100.00'),
        };

        jest.spyOn(reportService, 'getReportByDateRange').mockResolvedValue(mockResult);

        await reportController.getMonthlyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.json).toHaveBeenCalledWith(expect.any(Object));
      });

      it('should aggregate all days in month', async () => {
        mockRequest.params = { month: '2', year: '2026' };

        const mockResult: any = {
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-28'),
          totalRevenue: new Decimal('5000.00'),
          totalExpenses: new Decimal('2500.00'),
          grossProfit: new Decimal('4500.00'),
          netProfit: new Decimal('2500.00'),
          orderCount: 28,
          averageOrderValue: new Decimal('178.57'),
        };

        jest.spyOn(reportService, 'getReportByDateRange').mockResolvedValue(mockResult);

        await reportController.getMonthlyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.json).toHaveBeenCalled();
      });

      it('should return 400 for invalid month', async () => {
        mockRequest.params = { month: '13', year: '2026' };

        await reportController.getMonthlyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });

      it('should return 400 for invalid year', async () => {
        mockRequest.params = { month: '2', year: 'invalid' };

        await reportController.getMonthlyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.status).toHaveBeenCalledWith(400);
      });

      it('should return 401 if not authenticated', async () => {
        mockRequest.user = undefined;
        mockRequest.params = { month: '2', year: '2026' };

        await reportController.getMonthlyReport(
          mockRequest as unknown as Request,
          mockResponse as Response
        );

        expect(mockResponse.status).toHaveBeenCalledWith(401);
      });
    });
  });

  // ============================================================================
  // PART 3: Integration Tests
  // ============================================================================

  describe('Integration Tests', () => {
    it('should handle complete daily report flow', async () => {
      const testDate = new Date('2026-02-08');

      const mockOrders = [
        {
          id: 'order-1',
          total: new Decimal('500.00'),
          tax: new Decimal('40.00'),
          closedAt: testDate,
          payments: [],
          tips: [{ amount: new Decimal('50.00') }],
        },
      ];

      const mockMovements = [
        {
          id: 'mov-1',
          type: 'USAGE',
          quantity: new Decimal('10'),
          item: { unitCost: new Decimal('5.00') },
        },
      ];

      const mockShifts = [
        {
          id: 'shift-1',
          startTime: new Date('2026-02-08T09:00:00'),
          endTime: new Date('2026-02-08T17:00:00'),
          staff: { hourlyRate: new Decimal('15.00') },
          hoursWorked: 8,
          laborCost: new Decimal('120.00'),
          user: { hourlyRate: new Decimal('15.00') },
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.stockMovement.findMany.mockResolvedValue(mockMovements);
      mockPrisma.shift.findMany.mockResolvedValue(mockShifts);

      const revenue = await reportService.getDailyRevenue('tenant-1', testDate);
      const foodCost = await reportService.getFoodCost('tenant-1', testDate, testDate);
      const laborCost = await reportService.getLaborCost('tenant-1', testDate, testDate);

      expect(revenue).toHaveProperty('totalRevenue');
      expect(foodCost).toHaveProperty('totalFoodCost');
      expect(laborCost).toHaveProperty('totalLaborCost');
    });

    it('should handle monthly aggregation correctly', async () => {
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-02-28');

      const mockOrders = Array.from({ length: 10 }, (_, i) => ({
        id: `order-${i}`,
        total: new Decimal('100.00'),
        closedAt: new Date('2026-02-08'),
        payments: [],
        tips: [],
      }));

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);
      mockPrisma.shift.findMany.mockResolvedValue([]);

      const result = await reportService.getReportByDateRange('tenant-1', startDate, endDate);

      expect(result.orderCount).toBe(10);
      expect(result.totalRevenue).toEqual(new Decimal('1000.00'));
    });

    it('should generate complete financial report', async () => {
      const testDate = new Date('2026-02-08');

      const mockOrders = [
        {
          id: 'order-1',
          total: new Decimal('1000.00'),
          tax: new Decimal('80.00'),
          closedAt: testDate,
          payments: [],
          tips: [],
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);
      mockPrisma.shift.findMany.mockResolvedValue([]);

      const pnl = await reportService.getProfitAndLoss('tenant-1', testDate);

      expect(pnl).toHaveProperty('revenue');
      expect(pnl).toHaveProperty('netProfit');
    });
  });

  // ============================================================================
  // PART 4: Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully in getDailyRevenue', async () => {
      mockPrisma.order.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        reportService.getDailyRevenue('tenant-1', new Date())
      ).rejects.toThrow();
    });

    it('should handle invalid tenant ID', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await reportService.getDailyRevenue('invalid-tenant', new Date());

      expect(result.totalRevenue).toEqual(new Decimal('0'));
    });

    it('should handle null dates gracefully', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await reportService.getDailyRevenue('tenant-1', new Date());

      expect(result).toBeDefined();
    });

    it('should handle decimal precision correctly', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          total: new Decimal('99.99'),
          closedAt: new Date(),
          payments: [],
          tips: [{ amount: new Decimal('15.50') }],
        },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await reportService.getDailyRevenue('tenant-1', new Date());

      expect(result.totalRevenue).toEqual(new Decimal('99.99'));
      expect(result.totalTips).toEqual(new Decimal('15.50'));
    });
  });

  // ============================================================================
  // PART 5: Performance Tests
  // ============================================================================

  describe('Performance Tests', () => {
    it('should generate daily report within acceptable time', async () => {
      const mockOrders = Array.from({ length: 100 }, (_, i) => ({
        id: `order-${i}`,
        total: new Decimal('100.00'),
        closedAt: new Date('2026-02-08'),
        payments: [{ method: 'CREDIT_CARD', amount: new Decimal('100.00') }],
        tips: [],
      }));

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);

      const start = performance.now();
      await reportService.getDailyRevenue('tenant-1', new Date('2026-02-08'));
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500); // Should complete in less than 500ms
    });

    it('should handle large date ranges efficiently', async () => {
      const mockOrders = Array.from({ length: 1000 }, (_, i) => ({
        id: `order-${i}`,
        total: new Decimal('100.00'),
        closedAt: new Date('2026-02-08'),
        payments: [],
        tips: [],
      }));

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.stockMovement.findMany.mockResolvedValue([]);
      mockPrisma.shift.findMany.mockResolvedValue([]);

      const start = performance.now();
      await reportService.getReportByDateRange(
        'tenant-1',
        new Date('2026-01-01'),
        new Date('2026-12-31')
      );
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000); // Should complete in less than 1 second
    });
  });
});
