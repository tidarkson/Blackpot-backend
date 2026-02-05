import { PrismaClient } from '@prisma/client';
import { Decimal } from 'decimal.js';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * ConflictDetectionService
 * 
 * Comprehensive conflict detection and prevention including:
 * - Overlapping shift detection
 * - Availability validation
 * - Overtime detection (40+ hours/week)
 * - Double-booking prevention
 * - Conflict warnings and alerts
 * - Conflict resolution tracking
 */
export class ConflictDetectionService {
  /**
   * Detect all conflicts for a proposed shift
   */
  async detectConflicts(
    tenantId: string,
    userId: string,
    scheduledDate: Date,
    scheduledStart: Date,
    scheduledEnd: Date,
    roleAssigned: string
  ) {
    try {
      const conflicts = [];

      // Check for overlapping shifts
      const overlapConflict = await this.checkOverlappingShifts(
        tenantId,
        userId,
        scheduledStart,
        scheduledEnd
      );
      if (overlapConflict) {
        conflicts.push(overlapConflict);
      }

      // Check availability
      const availabilityConflict = await this.checkAvailability(
        tenantId,
        userId,
        scheduledDate,
        scheduledStart,
        scheduledEnd
      );
      if (availabilityConflict) {
        conflicts.push(availabilityConflict);
      }

      // Check overtime
      const overtimeConflict = await this.checkOvertime(
        tenantId,
        userId,
        scheduledDate,
        scheduledStart,
        scheduledEnd
      );
      if (overtimeConflict) {
        conflicts.push(overtimeConflict);
      }

      // Check coverage requirements
      const coverageConflict = await this.checkCoverageRequirements(
        tenantId,
        roleAssigned,
        scheduledDate,
        scheduledStart,
        scheduledEnd
      );
      if (coverageConflict) {
        conflicts.push(coverageConflict);
      }

      return conflicts;
    } catch (error: any) {
      logger.error('Error detecting conflicts:', error.message);
      throw error;
    }
  }

  /**
   * Check for overlapping shifts
   */
  private async checkOverlappingShifts(
    tenantId: string,
    userId: string,
    scheduledStart: Date,
    scheduledEnd: Date
  ) {
    try {
      const overlappingShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          userId,
          status: { in: ['SCHEDULED', 'ACTIVE', 'COMPLETED'] },
          OR: [
            {
              scheduledStart: { lt: scheduledEnd },
              scheduledEnd: { gt: scheduledStart },
            },
          ],
        },
      });

      if (overlappingShifts.length > 0) {
        return {
          type: 'OVERLAP',
          severity: 'ERROR',
          message: `Staff has ${overlappingShifts.length} overlapping shift(s)`,
          conflictingShifts: overlappingShifts.map(s => ({
            id: s.id,
            scheduledStart: s.scheduledStart,
            scheduledEnd: s.scheduledEnd,
          })),
          details: {
            requestedStart: scheduledStart,
            requestedEnd: scheduledEnd,
          },
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Error checking overlapping shifts:', error.message);
      throw error;
    }
  }

  /**
   * Check staff availability
   */
  private async checkAvailability(
    tenantId: string,
    userId: string,
    scheduledDate: Date,
    scheduledStart: Date,
    scheduledEnd: Date
  ) {
    try {
      const staff = await prisma.user.findUnique({
        where: { id: userId },
        select: { availability: true },
      });

      if (!staff?.availability) {
        return null; // No availability constraints
      }

      const dayOfWeek = scheduledDate.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayOfWeek] as keyof typeof staff.availability;

      const dayAvailability = (staff.availability as any)[dayName];

      if (!dayAvailability?.available) {
        return {
          type: 'UNAVAILABLE',
          severity: 'WARNING',
          message: `Staff is marked unavailable on ${dayName}`,
          details: {
            dayOfWeek: dayName,
            availability: dayAvailability,
          },
        };
      }

      // Check time windows
      if (dayAvailability.startTime && dayAvailability.endTime) {
        const [availStartHour, availStartMin] = dayAvailability.startTime.split(':').map(Number);
        const [availEndHour, availEndMin] = dayAvailability.endTime.split(':').map(Number);

        const shiftStartMinutes = scheduledStart.getHours() * 60 + scheduledStart.getMinutes();
        const shiftEndMinutes = scheduledEnd.getHours() * 60 + scheduledEnd.getMinutes();
        const availStartMinutes = availStartHour * 60 + availStartMin;
        const availEndMinutes = availEndHour * 60 + availEndMin;

        if (shiftStartMinutes < availStartMinutes || shiftEndMinutes > availEndMinutes) {
          return {
            type: 'UNAVAILABLE',
            severity: 'WARNING',
            message: `Shift falls outside staff's available hours (${dayAvailability.startTime}-${dayAvailability.endTime})`,
            details: {
              availableWindow: { startTime: dayAvailability.startTime, endTime: dayAvailability.endTime },
              requestedShift: { startTime: scheduledStart, endTime: scheduledEnd },
            },
          };
        }
      }

      return null;
    } catch (error: any) {
      logger.error('Error checking availability:', error.message);
      throw error;
    }
  }

  /**
   * Check for overtime (40+ hours per week)
   */
  private async checkOvertime(
    tenantId: string,
    userId: string,
    scheduledDate: Date,
    scheduledStart: Date,
    scheduledEnd: Date
  ) {
    try {
      // Get start of week
      const dayOfWeek = scheduledDate.getDay();
      const weekStart = new Date(scheduledDate);
      weekStart.setDate(scheduledDate.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Get all shifts for the week
      const weekShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          userId,
          status: { in: ['SCHEDULED', 'ACTIVE', 'COMPLETED'] },
          scheduledDate: {
            gte: weekStart,
            lte: weekEnd,
          },
        },
      });

      // Calculate current week hours
      let weekHours = 0;
      weekShifts.forEach(shift => {
        if (shift.hoursWorked) {
          weekHours += shift.hoursWorked.toNumber();
        }
      });

      // Add proposed shift hours
      const proposedHours = (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60);
      const totalWithProposed = weekHours + proposedHours;

      if (totalWithProposed > 40) {
        return {
          type: 'OVERTIME',
          severity: 'WARNING',
          message: `Shift would cause overtime (${totalWithProposed.toFixed(1)} total hours this week)`,
          details: {
            currentWeekHours: weekHours.toFixed(1),
            proposedHours: proposedHours.toFixed(1),
            totalWithProposed: totalWithProposed.toFixed(1),
            overtimeHours: (totalWithProposed - 40).toFixed(1),
            weekStart,
            weekEnd,
          },
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Error checking overtime:', error.message);
      throw error;
    }
  }

  /**
   * Check coverage requirements
   */
  private async checkCoverageRequirements(
    tenantId: string,
    roleAssigned: string,
    scheduledDate: Date,
    scheduledStart: Date,
    scheduledEnd: Date
  ) {
    try {
      const dayOfWeek = scheduledDate.getDay();

      // Get coverage requirement for this role and day
      const requirement = await prisma.coverageRequirement.findFirst({
        where: {
          tenantId,
          roleRequired: roleAssigned,
          OR: [
            { dayOfWeek: null }, // All days
            { dayOfWeek }, // Specific day
          ],
        },
      });

      if (!requirement) {
        return null; // No requirement set
      }

      // Count how many are scheduled for this role during this time
      const scheduledStaff = await prisma.shift.findMany({
        where: {
          tenantId,
          roleAssigned,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          scheduledDate: { equals: scheduledDate },
          OR: [
            {
              scheduledStart: { lt: scheduledEnd },
              scheduledEnd: { gt: scheduledStart },
            },
          ],
        },
      });

      if (scheduledStaff.length >= requirement.minimumStaff) {
        return null; // Coverage requirement met
      }

      // If removing this shift would cause understaffing, warn
      if (scheduledStaff.length - 1 < requirement.minimumStaff) {
        return {
          type: 'UNDERSTAFFED',
          severity: 'INFO',
          message: `Adding this shift meets coverage requirement (${scheduledStaff.length}/${requirement.minimumStaff} ${roleAssigned}s)`,
          details: {
            currentStaffed: scheduledStaff.length - 1,
            requirement: requirement.minimumStaff,
            roleRequired: roleAssigned,
          },
        };
      }

      return null;
    } catch (error: any) {
      logger.error('Error checking coverage requirements:', error.message);
      throw error;
    }
  }

  /**
   * Log a conflict in the database
   */
  async logConflict(
    tenantId: string,
    userId: string,
    shiftId: string,
    conflictType: string,
    conflictDetails: any
  ) {
    try {
      const conflict = await prisma.shiftConflict.create({
        data: {
          tenantId,
          userId,
          shiftId,
          conflictType,
          conflictDetails,
        },
      });

      logger.warn(`⚠️ Conflict logged: ${conflictType} for user ${userId}`);

      return conflict;
    } catch (error: any) {
      logger.error('Error logging conflict:', error.message);
      throw error;
    }
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(conflictId: string, resolution: string) {
    try {
      const conflict = await prisma.shiftConflict.update({
        where: { id: conflictId },
        data: {
          isResolved: true,
          resolution,
        },
      });

      logger.info(`✅ Conflict resolved: ${conflictId}`);

      return conflict;
    } catch (error: any) {
      logger.error('Error resolving conflict:', error.message);
      throw error;
    }
  }

  /**
   * Get unresolved conflicts for a tenant
   */
  async getUnresolvedConflicts(tenantId: string, userId?: string) {
    try {
      const where: any = {
        tenantId,
        isResolved: false,
      };

      if (userId) {
        where.userId = userId;
      }

      const conflicts = await prisma.shiftConflict.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return conflicts;
    } catch (error: any) {
      logger.error('Error fetching unresolved conflicts:', error.message);
      throw error;
    }
  }
}

export const conflictDetectionService = new ConflictDetectionService();
