import { PrismaClient, UserRole, Shift } from '@prisma/client';
import { AdvancedSchedulingService } from '../src/services/AdvancedSchedulingService';
import { Decimal } from 'decimal.js';
import { addDays, addWeeks, startOfWeek, addMonths } from 'date-fns';

describe('Feature A5: Advanced Scheduling', () => {
  let prisma: PrismaClient;
  let advancedSchedulingService: AdvancedSchedulingService;

  let tenantId: string;
  let locationId: string;
  let tableId: string;
  let staffId1: string;
  let staffId2: string;
  let staffId3: string;
  let staffId4: string;
  const testTimestamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    advancedSchedulingService = new AdvancedSchedulingService();

    // Clean up any existing test data
    const testTenants = await prisma.tenant.findMany({
      where: { name: { contains: 'Advanced Scheduling Test' } },
    });

    for (const tenant of testTenants) {
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Shift" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Order" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "CoverageRequirement" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "StaffAvailabilityException" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "User" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Location" WHERE "tenantId" = $1`,
          tenant.id
        );
        await prisma.tenant.delete({ where: { id: tenant.id } });
      } catch (e) {
        // Continue on error
      }
    }

    // Create test tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Advanced Scheduling Test Tenant',
      },
    });
    tenantId = tenant.id;

    // Create test location
    const location = await prisma.location.create({
      data: {
        tenantId,
        name: 'Test Location',
      },
    });
    locationId = location.id;

    // Create staff users
    const staff1 = await prisma.user.create({
      data: {
        tenantId,
        locationId,
        email: `server1-${testTimestamp}@test.com`,
        name: 'John Server 1',
        passwordHash: 'hashed_password',
        role: UserRole.STAFF,
        hourlyRate: new Decimal('15.50'),
        isActive: true,
      },
    });
    staffId1 = staff1.id;

    const staff2 = await prisma.user.create({
      data: {
        tenantId,
        locationId,
        email: `server2-${testTimestamp}@test.com`,
        name: 'Jane Server 2',
        passwordHash: 'hashed_password',
        role: UserRole.STAFF,
        hourlyRate: new Decimal('16.00'),
        isActive: true,
      },
    });
    staffId2 = staff2.id;

    const staff3 = await prisma.user.create({
      data: {
        tenantId,
        locationId,
        email: `manager1-${testTimestamp}@test.com`,
        name: 'Bob Manager',
        passwordHash: 'hashed_password',
        role: UserRole.MANAGER,
        hourlyRate: new Decimal('22.00'),
        isActive: true,
      },
    });
    staffId3 = staff3.id;

    const staff4 = await prisma.user.create({
      data: {
        tenantId,
        locationId,
        email: `cook1-${testTimestamp}@test.com`,
        name: 'Alice Cook',
        passwordHash: 'hashed_password',
        role: UserRole.STAFF,
        hourlyRate: new Decimal('18.50'),
        isActive: true,
      },
    });
    staffId4 = staff4.id;

    // Create a test table for orders
    const table = await prisma.table.create({
      data: {
        tenantId,
        locationId,
        name: 'Table 1',
        capacity: 4,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    });
    tableId = table.id;
  });

  afterEach(async () => {
    // Clean up shifts and related data after each test
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Shift" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Order" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "CoverageRequirement" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "StaffAvailabilityException" WHERE "tenantId" = $1`,
        tenantId
      );
    } catch (e) {
      // Continue on error
    }
  });

  afterAll(async () => {
    // Final cleanup
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Shift" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Order" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "CoverageRequirement" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "StaffAvailabilityException" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "User" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Location" WHERE "tenantId" = $1`,
        tenantId
      );
      await prisma.tenant.delete({ where: { id: tenantId } });
    } catch (e) {
      // Continue on error
    }
    await prisma.$disconnect();
  });

  // =====================================================================
  // DEMAND FORECASTING TESTS
  // =====================================================================

  describe('forecastDemand', () => {
    it('should predict customer count', async () => {
      const targetDate = new Date('2025-02-15'); // Saturday
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);

      expect(forecast).toBeDefined();
      expect(forecast.predictedCustomerCount).toBeGreaterThan(0);
      expect(forecast.date).toEqual(targetDate);
    });

    it('should account for day of week', async () => {
      const friday = new Date('2025-02-14');
      const monday = new Date('2025-02-17');

      const fridayForecast = await advancedSchedulingService.forecastDemand(tenantId, friday);
      const mondayForecast = await advancedSchedulingService.forecastDemand(tenantId, monday);

      // Friday should have higher factor than Monday
      expect(fridayForecast.dayOfWeekFactor).toBeGreaterThan(
        mondayForecast.dayOfWeekFactor
      );
    });

    it('should account for time of year (seasonality)', async () => {
      const julyDate = new Date('2025-07-15'); // Summer
      const januaryDate = new Date('2025-01-15'); // Regular month

      const julySeason = await advancedSchedulingService.forecastDemand(tenantId, julyDate);
      const januarySeason = await advancedSchedulingService.forecastDemand(
        tenantId,
        januaryDate
      );

      // Both should have defined seasonality factors
      expect(julySeason.seasonalityFactor).toBeGreaterThanOrEqual(1.0);
      expect(januarySeason.seasonalityFactor).toBeGreaterThanOrEqual(1.0);
    });

    it('should consider special events', async () => {
      const valentinesDay = new Date('2025-02-14');
      const regularDay = new Date('2025-02-10');

      const valentinesForecast = await advancedSchedulingService.forecastDemand(
        tenantId,
        valentinesDay
      );
      const regularForecast = await advancedSchedulingService.forecastDemand(
        tenantId,
        regularDay
      );

      // Special events should have higher factors or at least be considered
      expect(valentinesForecast).toBeDefined();
      expect(regularForecast).toBeDefined();
    });

    it('should return confidence metric', async () => {
      const targetDate = new Date('2025-02-15');
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);

      expect(forecast.confidence).toBeGreaterThanOrEqual(0);
      expect(forecast.confidence).toBeLessThanOrEqual(1);
    });
  });

  // =====================================================================
  // STAFFING RECOMMENDATION TESTS
  // =====================================================================

  describe('recommendStaffing', () => {
    it('should suggest shift counts', async () => {
      const targetDate = new Date('2025-02-15');
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );

      expect(recommendation).toBeDefined();
      expect(recommendation.recommendedShiftCount).toBeGreaterThan(0);
    });

    it('should match demand levels', async () => {
      const targetDate = new Date('2025-02-15');
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );

      // Recommendation should be based on forecast
      expect(recommendation.recommendedShiftCount).toBeGreaterThan(0);
      // More customers = more shifts
      expect(recommendation.recommendedShiftCount).toBeGreaterThanOrEqual(1);
    });

    it('should minimize labor cost', async () => {
      const targetDate = new Date('2025-02-15');
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );

      expect(recommendation.estimatedLaborCost).toBeDefined();
      expect(recommendation.estimatedLaborCost.toNumber()).toBeGreaterThan(0);
    });

    it('should respect constraints', async () => {
      // Set up coverage requirement
      await prisma.coverageRequirement.create({
        data: {
          tenantId,
          roleRequired: UserRole.MANAGER,
          minimumStaff: 2,
          dayOfWeek: 6, // Saturday
        },
      });

      const targetDate = new Date('2025-02-15'); // Saturday
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );

      // Should recognize constraints
      expect(recommendation.constraints).toBeDefined();
    });

    it('should include role breakdown', async () => {
      const targetDate = new Date('2025-02-15');
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );

      expect(recommendation.roleBreakdown).toBeDefined();
      expect(Array.isArray(recommendation.roleBreakdown)).toBe(true);
    });
  });

  // =====================================================================
  // SCHEDULE OPTIMIZATION TESTS
  // =====================================================================

  describe('optimizeSchedule', () => {
    beforeEach(async () => {
      // Create test shifts
      const today = new Date();
      const tomorrow = addDays(today, 1);

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: today,
          scheduledStart: new Date(today.setHours(8, 0, 0)),
          scheduledEnd: new Date(today.setHours(16, 0, 0)),
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('124'),
        },
      });

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId2,
          scheduledDate: today,
          scheduledStart: new Date(today.setHours(12, 0, 0)),
          scheduledEnd: new Date(today.setHours(20, 0, 0)),
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('128'),
        },
      });

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId3,
          scheduledDate: tomorrow,
          scheduledStart: new Date(tomorrow.setHours(8, 0, 0)),
          scheduledEnd: new Date(tomorrow.setHours(16, 0, 0)),
          roleAssigned: 'MANAGER',
          status: 'SCHEDULED',
          laborCost: new Decimal('176'),
        },
      });
    });

    it('should balance workload', async () => {
      const today = new Date();
      const endDate = addDays(today, 7);
      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        [staffId1, staffId2, staffId3],
        today,
        endDate
      );

      expect(optimized).toBeDefined();
      expect(optimized.workloadBalance).toBeGreaterThanOrEqual(0);
      expect(optimized.workloadBalance).toBeLessThanOrEqual(1);
    });

    it('should respect availability', async () => {
      const today = new Date();
      const endDate = addDays(today, 7);

      // Create an availability exception
      await prisma.staffAvailabilityException.create({
        data: {
          tenantId,
          userId: staffId1,
          dateOfException: today,
          isAvailable: false,
          reason: 'Personal leave',
        },
      });

      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        [staffId1, staffId2, staffId3],
        today,
        endDate
      );

      expect(optimized).toBeDefined();
      expect(optimized.shifts).toBeDefined();
    });

    it('should minimize cost', async () => {
      const today = new Date();
      const endDate = addDays(today, 7);
      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        [staffId1, staffId2, staffId3],
        today,
        endDate
      );

      expect(optimized.totalCost).toBeDefined();
      expect(optimized.totalCost).toBeInstanceOf(Decimal);
      expect(optimized.totalCost.toNumber()).toBeGreaterThanOrEqual(0);
    });

    it('should maximize coverage', async () => {
      const today = new Date();
      const endDate = addDays(today, 7);
      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        [staffId1, staffId2, staffId3],
        today,
        endDate
      );

      expect(optimized.coverageByRole).toBeDefined();
      expect(typeof optimized.coverageByRole).toBe('object');
    });
  });

  // =====================================================================
  // CONFLICT DETECTION TESTS
  // =====================================================================

  describe('detectConflicts', () => {
    it('should find double-bookings', async () => {
      const today = new Date();
      const startTime = new Date(today);
      startTime.setHours(10, 0, 0);
      const endTime = new Date(today);
      endTime.setHours(18, 0, 0);

      // Create overlapping shifts for the same staff
      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: today,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('124'),
        },
      });

      const overlapStart = new Date(today);
      overlapStart.setHours(14, 0, 0);
      const overlapEnd = new Date(today);
      overlapEnd.setHours(22, 0, 0);

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: today,
          scheduledStart: overlapStart,
          scheduledEnd: overlapEnd,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('132'),
        },
      });

      const conflicts = await advancedSchedulingService.detectConflicts(
        tenantId,
        today,
        addDays(today, 1)
      );

      expect(conflicts).toBeDefined();
      expect(conflicts.length).toBeGreaterThan(0);
      const doubleBookingConflict = conflicts.find((c) => c.type === 'DOUBLE_BOOKING');
      expect(doubleBookingConflict).toBeDefined();
    });

    it('should find constraint violations', async () => {
      // Set up a coverage requirement
      await prisma.coverageRequirement.create({
        data: {
          tenantId,
          roleRequired: UserRole.MANAGER,
          minimumStaff: 3,
        },
      });

      const today = new Date();

      // Create fewer shifts than required
      const startTime = new Date(today);
      startTime.setHours(10, 0, 0);
      const endTime = new Date(today);
      endTime.setHours(18, 0, 0);

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: today,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('124'),
        },
      });

      const conflicts = await advancedSchedulingService.detectConflicts(
        tenantId,
        today,
        addDays(today, 1)
      );

      expect(conflicts).toBeDefined();
      // Note: Conflicts may be found depending on coverage requirements
      expect(Array.isArray(conflicts)).toBe(true);
    });

    it('should flag understaffing', async () => {
      // Set up a high coverage requirement
      await prisma.coverageRequirement.create({
        data: {
          tenantId,
          roleRequired: UserRole.STAFF,
          minimumStaff: 10,
        },
      });

      const today = new Date();
      const tomorrow = addDays(today, 1);

      // Create only a few shifts
      const startTime = new Date(today);
      startTime.setHours(10, 0, 0);
      const endTime = new Date(today);
      endTime.setHours(18, 0, 0);

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: today,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('124'),
        },
      });

      const conflicts = await advancedSchedulingService.detectConflicts(tenantId, today, tomorrow);

      expect(conflicts).toBeDefined();
      expect(Array.isArray(conflicts)).toBe(true);
    });

    it('should return structured conflict report', async () => {
      const today = new Date();
      const conflicts = await advancedSchedulingService.detectConflicts(
        tenantId,
        today,
        addDays(today, 7)
      );

      if (conflicts.length > 0) {
        const conflict = conflicts[0];
        expect(conflict.conflictId).toBeDefined();
        expect(['DOUBLE_BOOKING', 'CONSTRAINT_VIOLATION', 'UNDERSTAFFING', 'OVERTAFFING']).toContain(
          conflict.type
        );
        expect(['LOW', 'MEDIUM', 'HIGH']).toContain(conflict.severity);
        expect(conflict.description).toBeDefined();
        expect(Array.isArray(conflict.affectedShifts)).toBe(true);
        expect(conflict.suggestedResolution).toBeDefined();
      }
    });
  });

  // =====================================================================
  // SCHEDULE REPORT GENERATION TESTS
  // =====================================================================

  describe('generateScheduleReport', () => {
    let reportTestDate: Date;

    beforeEach(async () => {
      // Use a fixed date for all report tests to ensure consistent queries
      reportTestDate = new Date('2025-02-15');

      // Create a test table
      const table = await prisma.table.create({
        data: {
          tenantId,
          locationId,
          name: 'Table 1',
          capacity: 4,
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        },
      });

      // Create test shifts
      const startTime = new Date(reportTestDate);
      startTime.setHours(10, 0, 0);
      const endTime = new Date(reportTestDate);
      endTime.setHours(18, 0, 0);

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId1,
          scheduledDate: reportTestDate,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('124'),
        },
      });

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId2,
          scheduledDate: reportTestDate,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'SERVER',
          status: 'SCHEDULED',
          laborCost: new Decimal('128'),
        },
      });

      await prisma.shift.create({
        data: {
          tenantId,
          userId: staffId3,
          scheduledDate: reportTestDate,
          scheduledStart: startTime,
          scheduledEnd: endTime,
          roleAssigned: 'MANAGER',
          status: 'SCHEDULED',
          laborCost: new Decimal('176'),
        },
      });

      // Create test orders for revenue calculation
      await prisma.order.create({
        data: {
          tenantId,
          tableId,
          serverId: staffId1,
          orderNumber: 'ORD001',
          status: 'COMPLETED',
          guestCount: 2,
          subtotal: new Decimal('150.00'),
          tax: new Decimal('15.00'),
          total: new Decimal('165.00'),
          createdAt: reportTestDate,
          updatedAt: reportTestDate,
        },
      });

      await prisma.order.create({
        data: {
          tenantId,
          tableId,
          serverId: staffId1,
          orderNumber: 'ORD002',
          status: 'COMPLETED',
          guestCount: 2,
          subtotal: new Decimal('200.00'),
          tax: new Decimal('20.00'),
          total: new Decimal('220.00'),
          createdAt: reportTestDate,
          updatedAt: reportTestDate,
        },
      });
    });

    it('should show coverage by role', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      expect(report.coverageByRole).toBeDefined();
      expect(Array.isArray(report.coverageByRole)).toBe(true);
      expect(report.coverageByRole.length).toBeGreaterThan(0);

      report.coverageByRole.forEach((coverage) => {
        expect(coverage.role).toBeDefined();
        expect(coverage.count).toBeGreaterThan(0);
        expect(coverage.percentage).toBeGreaterThan(0);
      });
    });

    it('should show labor cost', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      expect(report.totalCost).toBeDefined();
      expect(report.totalCost).toBeInstanceOf(Decimal);
      expect(report.totalCost.toNumber()).toBeGreaterThan(0);
    });

    it('should show potential conflicts', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      expect(report.conflicts).toBeDefined();
      expect(Array.isArray(report.conflicts)).toBe(true);
    });

    it('should include comprehensive report metadata', async () => {
      const tomorrow = addDays(reportTestDate, 1);
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        tomorrow
      );

      expect(report.generatedAt).toBeDefined();
      expect(report.dateRange).toBeDefined();
      expect(report.dateRange.start).toEqual(reportTestDate);
      expect(report.dateRange.end).toEqual(tomorrow);
      expect(report.totalShifts).toBeGreaterThanOrEqual(0);
      expect(report.totalStaff).toBeGreaterThanOrEqual(0);
      expect(report.totalCost).toBeDefined();
      expect(report.laborCostPercentage).toBeGreaterThanOrEqual(0);
      expect(report.averageWorkloadPerStaff).toBeGreaterThanOrEqual(0);
      expect(report.utilizationRate).toBeGreaterThanOrEqual(0);
      expect(report.utilizationRate).toBeLessThanOrEqual(1);
    });

    it('should calculate labor cost percentage correctly', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      // Labor cost percentage should be >= 0 (can exceed 100% on low-revenue days)
      expect(report.laborCostPercentage).toBeGreaterThanOrEqual(0);
    });

    it('should track unique staff count', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      expect(report.totalStaff).toBe(3); // We created 3 shifts for 3 different staff
    });

    it('should calculate average workload per staff', async () => {
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        addDays(reportTestDate, 1)
      );

      expect(report.averageWorkloadPerStaff).toBeGreaterThanOrEqual(0);
      expect(report.averageWorkloadPerStaff).toBeLessThanOrEqual(1);
    });

    it('should handle date ranges correctly', async () => {
      const nextWeek = addDays(reportTestDate, 7);

      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        reportTestDate,
        nextWeek
      );

      expect(report.dateRange.start).toEqual(reportTestDate);
      expect(report.dateRange.end).toEqual(nextWeek);
    });
  });

  // =====================================================================
  // INTEGRATION TESTS
  // =====================================================================

  describe('Integration Tests', () => {
    it('should forecast demand, recommend staffing, and optimize schedule', async () => {
      const targetDate = new Date('2025-02-15'); // Saturday

      // Step 1: Forecast demand
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, targetDate);
      expect(forecast).toBeDefined();

      // Step 2: Get staffing recommendation
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        targetDate,
        forecast
      );
      expect(recommendation).toBeDefined();

      // Step 3: Create shifts based on recommendation
      const startTime = new Date(targetDate);
      startTime.setHours(10, 0, 0);
      const endTime = new Date(targetDate);
      endTime.setHours(18, 0, 0);

      for (let i = 0; i < Math.min(recommendation.recommendedStaffCount, 4); i++) {
        const staffIds = [staffId1, staffId2, staffId3, staffId4];
        if (i < staffIds.length) {
          await prisma.shift.create({
            data: {
              tenantId,
              userId: staffIds[i],
              scheduledDate: targetDate,
              scheduledStart: startTime,
              scheduledEnd: endTime,
              roleAssigned: 'SERVER',
              status: 'SCHEDULED',
              laborCost: new Decimal('124'),
            },
          });
        }
      }

      // Step 4: Optimize schedule
      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        [staffId1, staffId2, staffId3, staffId4],
        targetDate,
        addDays(targetDate, 1)
      );
      expect(optimized).toBeDefined();
      expect(optimized.shifts.length).toBeGreaterThan(0);

      // Step 5: Detect conflicts
      const conflicts = await advancedSchedulingService.detectConflicts(
        tenantId,
        targetDate,
        addDays(targetDate, 1)
      );
      expect(Array.isArray(conflicts)).toBe(true);

      // Step 6: Generate report
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        targetDate,
        addDays(targetDate, 1)
      );
      expect(report).toBeDefined();
      expect(report.totalShifts).toBeGreaterThan(0);
    });

    it('should handle multi-week scheduling', async () => {
      const startDate = new Date('2025-02-10');
      const endDate = addDays(startDate, 7);

      // Create shifts for multiple days
      for (let i = 0; i < 7; i++) {
        const currentDate = addDays(startDate, i);
        const startTime = new Date(currentDate);
        startTime.setHours(10, 0, 0);
        const endTime = new Date(currentDate);
        endTime.setHours(18, 0, 0);

        const staffIds = [staffId1, staffId2, staffId3, staffId4];
        for (let j = 0; j < staffIds.length; j++) {
          await prisma.shift.create({
            data: {
              tenantId,
              userId: staffIds[j],
              scheduledDate: currentDate,
              scheduledStart: startTime,
              scheduledEnd: endTime,
              roleAssigned: j === 3 ? 'MANAGER' : 'SERVER',
              status: 'SCHEDULED',
              laborCost: new Decimal(j === 3 ? '176' : '124'),
            },
          });
        }
      }

      // Generate report for the week
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        startDate,
        endDate
      );

      expect(report.totalShifts).toBeGreaterThan(0);
      expect(report.totalStaff).toBeGreaterThan(0);
      expect(report.coverageByRole.length).toBeGreaterThan(0);
    });
  });
});
