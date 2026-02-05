import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * LaborCostService
 * 
 * Comprehensive labor cost tracking and reporting including:
 * - Labor cost calculation per shift
 * - Daily/weekly labor cost summaries
 * - Labor cost % of revenue calculation
 * - Staff utilization metrics
 * - Cost analysis and reporting
 */
export class LaborCostService {
  /**
   * Calculate labor cost for a single shift
   */
  async calculateShiftLaborCost(shiftId: string, tenantId: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: { id: shiftId, tenantId },
        include: {
          user: {
            select: { id: true, name: true, hourlyRate: true },
          },
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (!shift.user.hourlyRate || !shift.hoursWorked) {
        return null; // Cannot calculate without rate and hours
      }

      const laborCost = shift.user.hourlyRate.mul(shift.hoursWorked);

      // Update shift with labor cost
      await prisma.shift.update({
        where: { id: shiftId },
        data: { laborCost },
      });

      return laborCost;
    } catch (error: any) {
      logger.error('Error calculating shift labor cost:', error.message);
      throw error;
    }
  }

  /**
   * Calculate daily labor costs
   */
  async calculateDailyLaborCost(tenantId: string, date: Date) {
    try {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          clockInTime: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, hourlyRate: true },
          },
        },
      });

      let totalLaborCost = new Decimal(0);
      let totalHours = new Decimal(0);
      const staffBreakdown: { [key: string]: any } = {};

      shifts.forEach(shift => {
        if (shift.user.hourlyRate && shift.hoursWorked) {
          const cost = shift.user.hourlyRate.mul(shift.hoursWorked);
          totalLaborCost = totalLaborCost.plus(cost);
          totalHours = totalHours.plus(shift.hoursWorked);

          if (!staffBreakdown[shift.user.id]) {
            staffBreakdown[shift.user.id] = {
              staffName: shift.user.name,
              hourlyRate: shift.user.hourlyRate,
              hoursWorked: new Decimal(0),
              laborCost: new Decimal(0),
            };
          }

          staffBreakdown[shift.user.id].hoursWorked = staffBreakdown[shift.user.id].hoursWorked.plus(shift.hoursWorked);
          staffBreakdown[shift.user.id].laborCost = staffBreakdown[shift.user.id].laborCost.plus(cost);
        }
      });

      return {
        date,
        totalLaborCost,
        totalHours,
        staffCount: Object.keys(staffBreakdown).length,
        staffBreakdown,
        averageLaborCostPerHour: totalHours.toNumber() > 0 ? totalLaborCost.div(totalHours) : new Decimal(0),
      };
    } catch (error: any) {
      logger.error('Error calculating daily labor cost:', error.message);
      throw error;
    }
  }

  /**
   * Calculate labor cost % of revenue
   */
  async calculateLaborCostPercentage(tenantId: string, date: Date) {
    try {
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      // Get labor costs
      const laborCostData = await this.calculateDailyLaborCost(tenantId, date);

      // Get revenue
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          closedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          payments: true,
        },
      });

      const totalRevenue = orders.reduce((sum, order) => sum.plus(order.total), new Decimal(0));

      const laborCostPercent =
        totalRevenue.toNumber() > 0
          ? (laborCostData.totalLaborCost.toNumber() / totalRevenue.toNumber()) * 100
          : 0;

      return {
        date,
        totalRevenue,
        totalLaborCost: laborCostData.totalLaborCost,
        laborCostPercent: new Decimal(laborCostPercent),
        orderCount: orders.length,
        staffCount: laborCostData.staffCount,
      };
    } catch (error: any) {
      logger.error('Error calculating labor cost percentage:', error.message);
      throw error;
    }
  }

  /**
   * Generate daily labor cost report and store it
   */
  async generateDailyLaborCostReport(tenantId: string, date: Date) {
    try {
      const costData = await this.calculateLaborCostPercentage(tenantId, date);

      // Store report in database
      const report = await prisma.laborCostReport.upsert({
        where: {
          tenantId_reportDate: {
            tenantId,
            reportDate: date,
          },
        },
        update: {
          totalLaborCost: costData.totalLaborCost,
          totalRevenue: costData.totalRevenue,
          laborCostPercent: costData.laborCostPercent,
          staffCount: costData.staffCount,
          totalHours: new Decimal(0), // Will be calculated
        },
        create: {
          tenantId,
          reportDate: date,
          totalLaborCost: costData.totalLaborCost,
          totalRevenue: costData.totalRevenue,
          laborCostPercent: costData.laborCostPercent,
          staffCount: costData.staffCount,
          totalHours: new Decimal(0),
        },
      });

      logger.info(`📊 Daily labor cost report generated for ${date.toDateString()}`);

      return report;
    } catch (error: any) {
      logger.error('Error generating daily labor cost report:', error.message);
      throw error;
    }
  }

  /**
   * Get weekly labor cost summary
   */
  async getWeeklyLaborCostSummary(tenantId: string, date: Date) {
    try {
      const weekStart = startOfWeek(date);
      const weekEnd = endOfWeek(date);

      const reports = await prisma.laborCostReport.findMany({
        where: {
          tenantId,
          reportDate: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
        orderBy: { reportDate: 'asc' },
      });

      const totalLaborCost = reports.reduce((sum, r) => sum.plus(r.totalLaborCost), new Decimal(0));
      const totalRevenue = reports.reduce((sum, r) => sum.plus(r.totalRevenue), new Decimal(0));
      const averageLaborCostPercent =
        reports.length > 0
          ? reports.reduce((sum, r) => sum.plus(r.laborCostPercent), new Decimal(0)).div(reports.length)
          : new Decimal(0);

      return {
        weekStart,
        weekEnd,
        totalLaborCost,
        totalRevenue,
        averageLaborCostPercent,
        dailyReports: reports,
      };
    } catch (error: any) {
      logger.error('Error getting weekly labor cost summary:', error.message);
      throw error;
    }
  }

  /**
   * Get monthly labor cost trend
   */
  async getMonthlyLaborCostTrend(tenantId: string, date: Date) {
    try {
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

      const reports = await prisma.laborCostReport.findMany({
        where: {
          tenantId,
          reportDate: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
        orderBy: { reportDate: 'asc' },
      });

      const totalLaborCost = reports.reduce((sum, r) => sum.plus(r.totalLaborCost), new Decimal(0));
      const totalRevenue = reports.reduce((sum, r) => sum.plus(r.totalRevenue), new Decimal(0));
      const totalDays = reports.length;

      const averageDailyLaborCost = totalDays > 0 ? totalLaborCost.div(totalDays) : new Decimal(0);
      const averageLaborCostPercent =
        totalRevenue.toNumber() > 0 ? (totalLaborCost.toNumber() / totalRevenue.toNumber()) * 100 : 0;

      return {
        month: `${monthStart.toLocaleString('default', { month: 'long' })} ${monthStart.getFullYear()}`,
        monthStart,
        monthEnd,
        totalLaborCost,
        totalRevenue,
        totalDays,
        averageDailyLaborCost,
        averageLaborCostPercent,
        dailyReports: reports,
      };
    } catch (error: any) {
      logger.error('Error getting monthly labor cost trend:', error.message);
      throw error;
    }
  }

  /**
   * Get staff cost comparison
   */
  async getStaffCostComparison(tenantId: string, startDate: Date, endDate: Date) {
    try {
      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          status: { in: ['ACTIVE', 'COMPLETED'] },
          scheduledDate: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: { id: true, name: true, hourlyRate: true },
          },
        },
      });

      const staffCosts: { [key: string]: any } = {};

      shifts.forEach(shift => {
        if (shift.user.hourlyRate && shift.hoursWorked) {
          const cost = shift.user.hourlyRate.mul(shift.hoursWorked);

          if (!staffCosts[shift.user.id]) {
            staffCosts[shift.user.id] = {
              staffName: shift.user.name,
              hourlyRate: shift.user.hourlyRate,
              shiftsWorked: 0,
              totalHours: new Decimal(0),
              totalCost: new Decimal(0),
            };
          }

          staffCosts[shift.user.id].shiftsWorked += 1;
          staffCosts[shift.user.id].totalHours = staffCosts[shift.user.id].totalHours.plus(shift.hoursWorked);
          staffCosts[shift.user.id].totalCost = staffCosts[shift.user.id].totalCost.plus(cost);
        }
      });

      // Sort by total cost descending
      const sorted = Object.values(staffCosts).sort((a, b) => {
        return b.totalCost.toNumber() - a.totalCost.toNumber();
      });

      return {
        period: { startDate, endDate },
        staffCosts: sorted,
        totalCount: Object.keys(staffCosts).length,
      };
    } catch (error: any) {
      logger.error('Error getting staff cost comparison:', error.message);
      throw error;
    }
  }

  /**
   * Forecast labor costs
   */
  async forecastLaborCosts(tenantId: string, daysAhead: number = 7) {
    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(today.getDate() + daysAhead);

      // Get scheduled shifts
      const scheduledShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          status: 'SCHEDULED',
          scheduledDate: {
            gte: today,
            lte: endDate,
          },
        },
        include: {
          user: {
            select: { hourlyRate: true },
          },
        },
      });

      let forecastedCost = new Decimal(0);
      let forecastedHours = new Decimal(0);

      scheduledShifts.forEach(shift => {
        if (shift.user.hourlyRate) {
          const durationHours = new Decimal((shift.scheduledEnd.getTime() - shift.scheduledStart.getTime()) / (1000 * 60 * 60));
          forecastedHours = forecastedHours.plus(durationHours);
          forecastedCost = forecastedCost.plus(shift.user.hourlyRate.mul(durationHours));
        }
      });

      return {
        forecastPeriod: {
          startDate: today,
          endDate,
          daysAhead,
        },
        forecastedLaborCost: forecastedCost,
        forecastedHours,
        scheduledShifts: scheduledShifts.length,
        averageDailyLaborCost: daysAhead > 0 ? forecastedCost.div(daysAhead) : new Decimal(0),
      };
    } catch (error: any) {
      logger.error('Error forecasting labor costs:', error.message);
      throw error;
    }
  }
}

export const laborCostService = new LaborCostService();
