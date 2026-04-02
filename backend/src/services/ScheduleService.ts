import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { startOfWeek, endOfWeek, addDays, startOfDay, endOfDay } from 'date-fns';
import logger from '../config/logger';
import { socketService } from './SocketService';
import { CreateScheduleRequest, UpdateScheduleRequest, ScheduleFilters } from '../validators/schedule.validator';

const prisma = new PrismaClient();

/**
 * ShiftService
 * 
 * Comprehensive shift/schedule management including:
 * - CRUD operations for shifts/schedules
 * - Clock in/out functionality
 * - Hours calculation
 * - Labor cost calculation
 * - Shift status tracking
 * - Week-view scheduling
 * - Date range filtering
 */
export class ShiftService {
  /**
   * Create a new shift/schedule
   */
  async createShift(tenantId: string, data: CreateScheduleRequest) {
    try {
      // Parse times
      const [startHour, startMin] = data.scheduledStart.split(':').map(Number);
      const [endHour, endMin] = data.scheduledEnd.split(':').map(Number);

      // Build scheduled times
      const scheduledDate = new Date(data.scheduledDate);
      const scheduledStart = new Date(scheduledDate);
      scheduledStart.setHours(startHour, startMin, 0, 0);

      const scheduledEnd = new Date(scheduledDate);
      scheduledEnd.setHours(endHour, endMin, 0, 0);

      // Get staff hourly rate for labor cost
      const staff = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { hourlyRate: true },
      });

      // Calculate expected labor cost
      const durationMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
      const durationHours = durationMinutes / 60;
      const laborCost = staff?.hourlyRate ? new Decimal(staff.hourlyRate).mul(durationHours) : null;

      const shift = await prisma.shift.create({
        data: {
          tenantId,
          userId: data.userId,
          scheduledDate,
          scheduledStart,
          scheduledEnd,
          roleAssigned: data.roleAssigned,
          sectionAssigned: data.sectionAssigned,
          breakMinutes: data.breakMinutes || 0,
          notes: data.notes,
          status: 'SCHEDULED',
          laborCost,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, hourlyRate: true },
          },
        },
      });

      logger.info(`📅 Shift created: ${shift.user.name} on ${shift.scheduledDate}`);

      return shift;
    } catch (error: any) {
      logger.error('Error creating shift:', error.message);
      throw error;
    }
  }

  /**
   * Get all shifts with filtering
   */
  async getAllShifts(tenantId: string, filters?: ScheduleFilters) {
    try {
      const where: any = { tenantId };

      if (filters?.userId) {
        where.userId = filters.userId;
      }

      if (filters?.roleAssigned) {
        where.roleAssigned = filters.roleAssigned;
      }

      if (filters?.sectionAssigned) {
        where.sectionAssigned = filters.sectionAssigned;
      }

      if (filters?.status) {
        where.status = filters.status;
      }

      // Date range filtering
      if (filters?.startDate || filters?.endDate) {
        where.scheduledDate = {};
        if (filters?.startDate) {
          where.scheduledDate.gte = new Date(filters.startDate);
        }
        if (filters?.endDate) {
          where.scheduledDate.lte = new Date(filters.endDate);
        }
      }

      const orderBy: any = {};
      if (filters?.sortBy) {
        orderBy[filters.sortBy] = filters?.sortOrder || 'asc';
      } else {
        orderBy.scheduledDate = 'desc';
      }

      const shifts = await prisma.shift.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          clockIns: true,
        },
        orderBy,
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      });

      return shifts;
    } catch (error: any) {
      logger.error('Error fetching shifts:', error.message);
      throw error;
    }
  }

  /**
   * Get shift by ID
   */
  async getShiftById(shiftId: string, tenantId: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: { id: shiftId, tenantId },
        include: {
          user: {
            select: { id: true, name: true, email: true, hourlyRate: true, phone: true },
          },
          clockIns: true,
          tips: true,
        },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      return shift;
    } catch (error: any) {
      logger.error('Error fetching shift:', error.message);
      throw error;
    }
  }

  /**
   * Update shift
   */
  async updateShift(shiftId: string, tenantId: string, data: UpdateScheduleRequest) {
    try {
      const updateData: any = {};

      // Handle date/time updates
      if (data.scheduledDate || data.scheduledStart || data.scheduledEnd) {
        const shift = await prisma.shift.findFirst({
          where: { id: shiftId, tenantId },
        });

        if (!shift) throw new Error('Shift not found');

        const scheduledDate = data.scheduledDate ? new Date(data.scheduledDate) : shift.scheduledDate;
        const scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : shift.scheduledStart;
        const scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : shift.scheduledEnd;

        updateData.scheduledDate = scheduledDate;
        updateData.scheduledStart = scheduledStart;
        updateData.scheduledEnd = scheduledEnd;

        // Recalculate labor cost if times changed
        const staff = await prisma.user.findUnique({
          where: { id: shift.userId },
          select: { hourlyRate: true },
        });

        if (staff?.hourlyRate) {
          const durationMinutes = (scheduledEnd.getHours() * 60 + scheduledEnd.getMinutes()) -
            (scheduledStart.getHours() * 60 + scheduledStart.getMinutes());
          const durationHours = durationMinutes / 60;
          updateData.laborCost = new Decimal(staff.hourlyRate).mul(durationHours);
        }
      }

      if (data.roleAssigned) updateData.roleAssigned = data.roleAssigned;
      if (data.sectionAssigned !== undefined) updateData.sectionAssigned = data.sectionAssigned;
      if (data.breakMinutes !== undefined) updateData.breakMinutes = data.breakMinutes;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.status) updateData.status = data.status;

      const shift = await prisma.shift.update({
        where: { id: shiftId },
        data: updateData,
        include: {
          user: { select: { name: true } },
        },
      });

      logger.info(`✏️ Shift updated: ${shift.user.name}`);

      return shift;
    } catch (error: any) {
      logger.error('Error updating shift:', error.message);
      throw error;
    }
  }

  /**
   * Delete/Cancel shift
   */
  async deleteShift(shiftId: string, tenantId: string) {
    try {
      const shift = await prisma.shift.update({
        where: { id: shiftId },
        data: { status: 'CANCELLED' },
        include: {
          user: { select: { name: true } },
        },
      });

      logger.info(`🚫 Shift cancelled: ${shift.user.name}`);

      return shift;
    } catch (error: any) {
      logger.error('Error cancelling shift:', error.message);
      throw error;
    }
  }

  /**
   * Clock in for a shift
   */
  async clockIn(shiftId: string, tenantId: string, notes?: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: { id: shiftId, tenantId },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.status === 'ACTIVE') {
        throw new Error('Staff is already clocked in');
      }

      // Create clock-in record
      const clockIn = await prisma.shiftClockIn.create({
        data: {
          tenantId,
          shiftId,
          clockInTime: new Date(),
          notes,
        },
      });

      // Update shift status
      await prisma.shift.update({
        where: { id: shiftId },
        data: { status: 'ACTIVE', clockInTime: new Date() },
      });

      logger.info(`🕐 Clock in recorded for shift ${shiftId}`);

      if (shift.userId) {
        socketService.emitStaffStatusUpdated(tenantId, shift.userId, 'CLOCKED_IN', {
          shiftId,
        });
      }

      return clockIn;
    } catch (error: any) {
      logger.error('Error clocking in:', error.message);
      throw error;
    }
  }

  /**
   * Clock out from a shift
   */
  async clockOut(shiftId: string, tenantId: string, breakMinutes?: number, notes?: string) {
    try {
      const shift = await prisma.shift.findFirst({
        where: { id: shiftId, tenantId },
      });

      if (!shift) {
        throw new Error('Shift not found');
      }

      if (shift.status !== 'ACTIVE') {
        throw new Error('Shift is not currently active');
      }

      // Get latest clock-in record
      const clockInRecord = await prisma.shiftClockIn.findFirst({
        where: { shiftId, clockOutTime: null },
        orderBy: { clockInTime: 'desc' },
      });

      if (clockInRecord) {
        // Update clock-in record with clock-out time
        await prisma.shiftClockIn.update({
          where: { id: clockInRecord.id },
          data: {
            clockOutTime: new Date(),
            breakMinutes: breakMinutes || 0,
            notes,
          },
        });
      }

      // Calculate hours worked
      const clockInTime = shift.clockInTime || new Date();
      const clockOutTime = new Date();
      const totalMinutes = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60);
      const hoursWorked = (totalMinutes - (breakMinutes || 0)) / 60;

      // Update shift
      const updatedShift = await prisma.shift.update({
        where: { id: shiftId },
        data: {
          status: 'COMPLETED',
          clockOutTime: new Date(),
          breakMinutes: breakMinutes || 0,
          hoursWorked: new Decimal(hoursWorked),
        },
        include: {
          user: { select: { name: true, hourlyRate: true } },
        },
      });

      logger.info(`🕑 Clock out recorded for shift ${shiftId} - ${hoursWorked.toFixed(2)} hours worked`);

      if (shift.userId) {
        socketService.emitStaffStatusUpdated(tenantId, shift.userId, 'CLOCKED_OUT', {
          shiftId,
          hoursWorked,
        });
      }

      return updatedShift;
    } catch (error: any) {
      logger.error('Error clocking out:', error.message);
      throw error;
    }
  }

  /**
   * Get week schedule
   */
  async getWeekSchedule(tenantId: string, date: Date, roleFilter?: string) {
    try {
      const weekStart = startOfWeek(date);
      const weekEnd = endOfWeek(date);

      const where: any = {
        tenantId,
        scheduledDate: {
          gte: weekStart,
          lte: weekEnd,
        },
      };

      if (roleFilter) {
        where.roleAssigned = roleFilter;
      }

      const shifts = await prisma.shift.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { scheduledDate: 'asc' },
      });

      // Organize by day
      const weekData: { [key: string]: any[] } = {};
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + i);
        const dayName = days[day.getDay()];
        weekData[dayName] = [];
      }

      shifts.forEach(shift => {
        const dayName = days[shift.scheduledDate.getDay()];
        weekData[dayName].push(shift);
      });

      return {
        weekStart,
        weekEnd,
        schedule: weekData,
      };
    } catch (error: any) {
      logger.error('Error fetching week schedule:', error.message);
      throw error;
    }
  }

  /**
   * Get currently active shifts
   */
  async getActiveShifts(tenantId: string) {
    try {
      const now = new Date();

      const shifts = await prisma.shift.findMany({
        where: {
          tenantId,
          status: 'ACTIVE',
          scheduledStart: { lte: now },
          scheduledEnd: { gte: now },
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { scheduledStart: 'asc' },
      });

      return shifts;
    } catch (error: any) {
      logger.error('Error fetching active shifts:', error.message);
      throw error;
    }
  }

  /**
   * Copy previous week's schedule
   */
  async copyPreviousWeek(tenantId: string, startDate: Date, ignoreConflicts: boolean = false) {
    try {
      const previousWeekStart = addDays(startOfWeek(startDate), -7);
      const previousWeekEnd = addDays(endOfWeek(startDate), -7);

      const previousWeekShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          scheduledDate: {
            gte: previousWeekStart,
            lte: previousWeekEnd,
          },
          status: { not: 'CANCELLED' },
        },
      });

      const newShifts = [];

      for (const shift of previousWeekShifts) {
        const newDate = addDays(shift.scheduledDate, 7);

        try {
          const newShift = await prisma.shift.create({
            data: {
              tenantId: shift.tenantId,
              userId: shift.userId,
              scheduledDate: newDate,
              scheduledStart: addDays(shift.scheduledStart, 7),
              scheduledEnd: addDays(shift.scheduledEnd, 7),
              roleAssigned: shift.roleAssigned,
              sectionAssigned: shift.sectionAssigned,
              breakMinutes: shift.breakMinutes,
              notes: shift.notes,
              status: 'SCHEDULED',
              laborCost: shift.laborCost,
            },
          });

          newShifts.push(newShift);
        } catch (error: any) {
          if (!ignoreConflicts) {
            throw error;
          }
          logger.warn(`Skipped conflicting shift for user ${shift.userId}: ${error.message}`);
        }
      }

      logger.info(`✅ Copied ${newShifts.length} shifts from previous week`);

      return {
        copiedCount: newShifts.length,
        totalInPreviousWeek: previousWeekShifts.length,
        newShifts,
      };
    } catch (error: any) {
      logger.error('Error copying previous week:', error.message);
      throw error;
    }
  }

  /**
   * Bulk create shifts
   */
  async bulkCreateShifts(tenantId: string, schedules: CreateScheduleRequest[]) {
    try {
      const results: any[] = [];

      for (const schedule of schedules) {
        try {
          const shift = await this.createShift(tenantId, schedule);
          results.push({ success: true, shift });
        } catch (error: any) {
          results.push({ success: false, error: error.message, schedule });
        }
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`✅ Bulk created ${successCount}/${schedules.length} shifts`);

      return results;
    } catch (error: any) {
      logger.error('Error bulk creating shifts:', error.message);
      throw error;
    }
  }
}

export const shiftService = new ShiftService();
