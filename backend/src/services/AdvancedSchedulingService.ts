import { PrismaClient, Shift, User, UserRole, CoverageRequirement } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays, getDay, getDate, getMonth } from 'date-fns';
import logger from '../config/logger';

const prisma = new PrismaClient();

export interface DemandForecast {
  date: Date;
  predictedCustomerCount: number;
  dayOfWeekFactor: number;
  seasonalityFactor: number;
  specialEventFactor: number;
  confidence: number;
}

export interface StaffingRecommendation {
  recommendedShiftCount: number;
  recommendedStaffCount: number;
  estimatedLaborCost: Decimal;
  roleBreakdown: { role: string; count: number }[];
  constraints: string[];
}

export interface OptimizedSchedule {
  shifts: Shift[];
  totalCost: Decimal;
  coverageByRole: { [role: string]: number };
  workloadBalance: number; // 0-1, where 1 is perfectly balanced
  conflicts: string[];
}

export interface ConflictReport {
  conflictId: string;
  type: 'DOUBLE_BOOKING' | 'CONSTRAINT_VIOLATION' | 'UNDERSTAFFING' | 'OVERTAFFING';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  affectedShifts: string[];
  suggestedResolution: string;
}

export interface ScheduleReport {
  generatedAt: Date;
  dateRange: { start: Date; end: Date };
  totalShifts: number;
  totalStaff: number;
  totalCost: Decimal;
  coverageByRole: { role: UserRole; count: number; percentage: number }[];
  laborCostPercentage: number;
  conflicts: ConflictReport[];
  averageWorkloadPerStaff: number;
  utilizationRate: number;
}

/**
 * AdvancedSchedulingService
 *
 * Handles advanced scheduling features including:
 * - Demand forecasting
 * - Staffing recommendations
 * - Schedule optimization
 * - Conflict detection
 * - Schedule reporting
 */
export class AdvancedSchedulingService {
  /**
   * Forecast demand for a given date
   * Considers day of week, seasonality, and special events
   */
  async forecastDemand(tenantId: string, date: Date): Promise<DemandForecast> {
    try {
      // Get historical data for the same day of week
      const dayOfWeek = getDay(date);
      const historicalOrders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: addDays(date, -365),
            lte: date,
          },
        },
      });

      // Filter orders by day of week and calculate average
      const sameDayOrders = historicalOrders.filter(
        (order) => getDay(order.createdAt) === dayOfWeek
      );

      const avgCustomersPerDay =
        sameDayOrders.length > 0
          ? sameDayOrders.length / Math.ceil(365 / 7)
          : 50; // Default estimate

      // Calculate day of week factor (weekends typically busier)
      let dayOfWeekFactor = 1.0;
      if (dayOfWeek === 5) dayOfWeekFactor = 1.3; // Friday
      if (dayOfWeek === 6) dayOfWeekFactor = 1.4; // Saturday
      if (dayOfWeek === 0) dayOfWeekFactor = 1.2; // Sunday
      if (dayOfWeek === 1) dayOfWeekFactor = 0.7; // Monday
      if (dayOfWeek === 2) dayOfWeekFactor = 0.75; // Tuesday

      // Calculate seasonality factor
      const month = getMonth(date);
      let seasonalityFactor = 1.0;
      if (month === 11 || month === 0) seasonalityFactor = 1.4; // Dec, Jan (holidays)
      if (month === 6 || month === 7) seasonalityFactor = 1.2; // Jul, Aug (summer)

      // Check for special events
      let specialEventFactor = 1.0;
      const dateNum = getDate(date);
      if (dateNum === 14 || dateNum === 25 || dateNum === 31) {
        specialEventFactor = 1.5; // Valentine's Day, Christmas, New Year's Eve
      }

      // Calculate predicted customer count
      const predictedCustomerCount = Math.round(
        avgCustomersPerDay * dayOfWeekFactor * seasonalityFactor * specialEventFactor
      );

      // Calculate confidence (higher with more historical data)
      const confidence = Math.min(sameDayOrders.length / 52, 1.0); // Max confidence at 1 year of data

      logger.info(
        `📊 Demand forecast for ${date.toISOString()}: ${predictedCustomerCount} customers (confidence: ${(confidence * 100).toFixed(1)}%)`
      );

      return {
        date,
        predictedCustomerCount,
        dayOfWeekFactor,
        seasonalityFactor,
        specialEventFactor,
        confidence,
      };
    } catch (error: any) {
      logger.error('Error forecasting demand:', error.message);
      throw error;
    }
  }

  /**
   * Recommend staffing levels based on forecasted demand
   */
  async recommendStaffing(
    tenantId: string,
    date: Date,
    demandForecast: DemandForecast
  ): Promise<StaffingRecommendation> {
    try {
      // Get coverage requirements
      const dayOfWeek = getDay(date);
      const coverageReqs = await prisma.coverageRequirement.findMany({
        where: {
          tenantId,
          OR: [
            { dayOfWeek: null }, // Global requirements
            { dayOfWeek }, // Specific day requirements
          ],
        },
      });

      // Calculate shifts needed (assume 1 server per 15 customers)
      const serversNeeded = Math.ceil(demandForecast.predictedCustomerCount / 15);

      // Get available staff
      const availableStaff = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
          role: { not: UserRole.OWNER },
        },
        select: {
          id: true,
          role: true,
          hourlyRate: true,
        },
      });

      // Calculate cost estimate
      const costPerStaff = availableStaff.length > 0
        ? availableStaff.reduce((sum, staff) => sum.add(staff.hourlyRate || 0), new Decimal(0))
          .div(availableStaff.length)
        : new Decimal(15);

      const estimatedShiftHours = 8; // Standard 8-hour shift
      const estimatedLaborCost = new Decimal(serversNeeded)
        .mul(costPerStaff)
        .mul(estimatedShiftHours);

      // Group by role
      const roleBreakdown: { role: string; count: number }[] = [];
      const roleGroups = new Map<string, number>();

      availableStaff.forEach((staff) => {
        const current = roleGroups.get(staff.role) || 0;
        roleGroups.set(staff.role, current + 1);
      });

      roleGroups.forEach((count, role) => {
        roleBreakdown.push({ role, count });
      });

      // Identify constraints
      const constraints: string[] = [];
      if (serversNeeded > availableStaff.length) {
        constraints.push(`Insufficient staff: need ${serversNeeded}, available ${availableStaff.length}`);
      }

      // Check coverage requirements
      for (const req of coverageReqs) {
        const roleCount = availableStaff.filter((s) => s.role === req.roleRequired).length;
        if (roleCount < req.minimumStaff) {
          constraints.push(
            `${req.roleRequired} coverage: need ${req.minimumStaff}, available ${roleCount}`
          );
        }
      }

      logger.info(
        `👥 Staffing recommendation: ${serversNeeded} servers needed, cost: $${estimatedLaborCost.toFixed(2)}`
      );

      return {
        recommendedShiftCount: serversNeeded,
        recommendedStaffCount: availableStaff.length,
        estimatedLaborCost,
        roleBreakdown,
        constraints,
      };
    } catch (error: any) {
      logger.error('Error recommending staffing:', error.message);
      throw error;
    }
  }

  /**
   * Optimize schedule based on constraints and availability
   */
  async optimizeSchedule(
    tenantId: string,
    staffIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<OptimizedSchedule> {
    try {
      // Get existing shifts
      const existingShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          userId: { in: staffIds },
          scheduledDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: { id: true, hourlyRate: true, name: true },
          },
        },
      });

      // Get staff availability exceptions
      const availabilityExceptions = await prisma.staffAvailabilityException.findMany({
        where: {
          tenantId,
          userId: { in: staffIds },
          dateOfException: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate workload balance
      const workloadMap = new Map<string, number>();
      existingShifts.forEach((shift) => {
        const current = workloadMap.get(shift.userId) || 0;
        workloadMap.set(shift.userId, current + 1);
      });

      const workloads = Array.from(workloadMap.values());
      const avgWorkload = workloads.length > 0 ? workloads.reduce((a, b) => a + b, 0) / workloads.length : 0;
      const maxDeviation = workloads.length > 0
        ? Math.max(...workloads.map((w) => Math.abs(w - avgWorkload)))
        : 0;
      const workloadBalance = maxDeviation > 0 ? 1 - Math.min(maxDeviation / avgWorkload, 1) : 1;

      // Calculate total cost
      let totalCost = new Decimal(0);
      existingShifts.forEach((shift) => {
        if (shift.laborCost) {
          totalCost = totalCost.add(shift.laborCost);
        }
      });

      // Count coverage by role
      const coverageByRole: { [role: string]: number } = {};
      existingShifts.forEach((shift) => {
        const role = shift.roleAssigned || 'UNASSIGNED';
        coverageByRole[role] = (coverageByRole[role] || 0) + 1;
      });

      // Detect conflicts
      const conflicts: string[] = [];
      const scheduledDates = new Set<string>();
      existingShifts.forEach((shift) => {
        const dateKey = shift.scheduledDate.toISOString();
        if (scheduledDates.has(dateKey)) {
          conflicts.push(`Multiple shifts on ${shift.scheduledDate.toDateString()}`);
        }
        scheduledDates.add(dateKey);
      });

      logger.info(
        `⚖️ Schedule optimized: ${existingShifts.length} shifts, workload balance: ${(workloadBalance * 100).toFixed(1)}%`
      );

      return {
        shifts: existingShifts,
        totalCost,
        coverageByRole,
        workloadBalance,
        conflicts,
      };
    } catch (error: any) {
      logger.error('Error optimizing schedule:', error.message);
      throw error;
    }
  }

  /**
   * Detect scheduling conflicts and violations
   */
  async detectConflicts(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ConflictReport[]> {
    try {
      const conflicts: ConflictReport[] = [];

      // Get all shifts in date range
      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          scheduledDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      });

      // Check for double-bookings
      const staffShifts = new Map<string, Shift[]>();
      shifts.forEach((shift) => {
        const staffId = shift.userId;
        if (!staffShifts.has(staffId)) {
          staffShifts.set(staffId, []);
        }
        staffShifts.get(staffId)!.push(shift);
      });

      staffShifts.forEach((shiftList, staffId) => {
        for (let i = 0; i < shiftList.length; i++) {
          for (let j = i + 1; j < shiftList.length; j++) {
            const shift1 = shiftList[i];
            const shift2 = shiftList[j];

            // Check if shifts overlap
            if (
              shift1.scheduledStart < shift2.scheduledEnd &&
              shift1.scheduledEnd > shift2.scheduledStart
            ) {
              conflicts.push({
                conflictId: `db_${shift1.id}_${shift2.id}`,
                type: 'DOUBLE_BOOKING',
                severity: 'HIGH',
                description: `Staff member has overlapping shifts`,
                affectedShifts: [shift1.id, shift2.id],
                suggestedResolution: 'Remove one of the overlapping shifts',
              });
            }
          }
        }
      });

      // Check for understaffing
      const coverageReqs = await prisma.coverageRequirement.findMany({
        where: { tenantId },
      });

      const shiftsPerRole = new Map<string, number>();
      shifts.forEach((shift) => {
        const role = shift.roleAssigned || 'UNASSIGNED';
        shiftsPerRole.set(role, (shiftsPerRole.get(role) || 0) + 1);
      });

      coverageReqs.forEach((req) => {
        const currentCoverage = shiftsPerRole.get(req.roleRequired) || 0;
        if (currentCoverage < req.minimumStaff) {
          conflicts.push({
            conflictId: `us_${req.id}`,
            type: 'UNDERSTAFFING',
            severity: 'HIGH',
            description: `Insufficient ${req.roleRequired} coverage: ${currentCoverage}/${req.minimumStaff}`,
            affectedShifts: shifts.filter((s) => s.roleAssigned === req.roleRequired).map((s) => s.id),
            suggestedResolution: `Assign ${req.minimumStaff - currentCoverage} more ${req.roleRequired}s`,
          });
        }
      });

      logger.info(`🚨 Detected ${conflicts.length} scheduling conflicts`);

      return conflicts;
    } catch (error: any) {
      logger.error('Error detecting conflicts:', error.message);
      throw error;
    }
  }

  /**
   * Generate comprehensive schedule report
   */
  async generateScheduleReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ScheduleReport> {
    try {
      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          scheduledDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: { id: true, role: true, hourlyRate: true },
          },
        },
      });

      // Count by role
      const roleCountMap = new Map<UserRole, number>();
      shifts.forEach((shift) => {
        const role = shift.user.role;
        roleCountMap.set(role, (roleCountMap.get(role) || 0) + 1);
      });

      const coverageByRole = Array.from(roleCountMap.entries()).map(([role, count]) => ({
        role,
        count,
        percentage: shifts.length > 0 ? (count / shifts.length) * 100 : 0,
      }));

      // Calculate labor cost
      let totalLaborCost = new Decimal(0);
      shifts.forEach((shift) => {
        if (shift.laborCost) {
          totalLaborCost = totalLaborCost.add(shift.laborCost);
        }
      });

      // Get total revenue for the period
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          total: true,
        },
      });

      const totalRevenue = orders.reduce(
        (sum, order) => sum.add(order.total || 0),
        new Decimal(0)
      );

      const laborCostPercentage =
        totalRevenue.gt(0)
          ? parseFloat(totalLaborCost.div(totalRevenue).mul(100).toFixed(2))
          : 0;

      // Detect conflicts
      const conflicts = await this.detectConflicts(tenantId, startDate, endDate);

      // Calculate workload
      const uniqueStaff = new Set(shifts.map((s) => s.userId));
      const averageWorkloadPerStaff =
        uniqueStaff.size > 0 ? shifts.length / uniqueStaff.size : 0;

      // Calculate utilization rate
      const maxWorkingDays = differenceInDays(endDate, startDate) + 1;
      const utilizationRate =
        Math.min(uniqueStaff.size * maxWorkingDays, 1) > 0
          ? shifts.length / (uniqueStaff.size * maxWorkingDays)
          : 0;

      logger.info(
        `📋 Schedule report: ${shifts.length} shifts, $${totalLaborCost.toFixed(2)} labor cost (${laborCostPercentage.toFixed(1)}% of revenue)`
      );

      return {
        generatedAt: new Date(),
        dateRange: { start: startDate, end: endDate },
        totalShifts: shifts.length,
        totalStaff: uniqueStaff.size,
        totalCost: totalLaborCost,
        coverageByRole,
        laborCostPercentage,
        conflicts,
        averageWorkloadPerStaff,
        utilizationRate,
      };
    } catch (error: any) {
      logger.error('Error generating schedule report:', error.message);
      throw error;
    }
  }
}

export const advancedSchedulingService = new AdvancedSchedulingService();
