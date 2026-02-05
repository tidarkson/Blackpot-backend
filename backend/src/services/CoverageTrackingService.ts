import { PrismaClient } from '@prisma/client';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * CoverageTrackingService
 * 
 * Coverage management and tracking including:
 * - Minimum staff requirement validation
 * - Understaffing detection and alerts
 * - Open shift suggestions
 * - Coverage gap identification
 * - Role-based coverage tracking
 */
export class CoverageTrackingService {
  /**
   * Get coverage requirements for a tenant
   */
  async getCoverageRequirements(tenantId: string, roleRequired?: string) {
    try {
      const where: any = { tenantId };

      if (roleRequired) {
        where.roleRequired = roleRequired;
      }

      const requirements = await prisma.coverageRequirement.findMany({
        where,
        orderBy: [{ roleRequired: 'asc' }, { dayOfWeek: 'asc' }],
      });

      return requirements;
    } catch (error: any) {
      logger.error('Error fetching coverage requirements:', error.message);
      throw error;
    }
  }

  /**
   * Create or update coverage requirement
   */
  async setCoverageRequirement(
    tenantId: string,
    roleRequired: string,
    minimumStaff: number,
    dayOfWeek?: number | null,
    notes?: string
  ) {
    try {
      // If dayOfWeek is provided, upsert with that constraint
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const requirement = await prisma.coverageRequirement.upsert({
          where: {
            tenantId_roleRequired_dayOfWeek: {
              tenantId,
              roleRequired,
              dayOfWeek,
            },
          },
          update: {
            minimumStaff,
            notes,
          },
          create: {
            tenantId,
            roleRequired,
            minimumStaff,
            dayOfWeek,
            notes,
          },
        });

        logger.info(`✅ Coverage requirement set: ${minimumStaff} ${roleRequired}s required`);
        return requirement;
      } else {
        // For null dayOfWeek, we need to find existing or create new
        const existing = await prisma.coverageRequirement.findFirst({
          where: {
            tenantId,
            roleRequired,
            dayOfWeek: null,
          },
        });

        if (existing) {
          const updated = await prisma.coverageRequirement.update({
            where: { id: existing.id },
            data: { minimumStaff, notes },
          });
          logger.info(`✅ Coverage requirement updated: ${minimumStaff} ${roleRequired}s required`);
          return updated;
        } else {
          const created = await prisma.coverageRequirement.create({
            data: {
              tenantId,
              roleRequired,
              minimumStaff,
              dayOfWeek: null,
              notes,
            },
          });
          logger.info(`✅ Coverage requirement created: ${minimumStaff} ${roleRequired}s required`);
          return created;
        }
      }
    } catch (error: any) {
      logger.error('Error setting coverage requirement:', error.message);
      throw error;
    }
  }

  /**
   * Check coverage for a specific date/role/time
   */
  async checkCoverage(
    tenantId: string,
    date: Date,
    roleRequired?: string,
    startTime?: string,
    endTime?: string
  ) {
    try {
      const dayOfWeek = date.getDay();

      // Get applicable requirements
      let requirements = await prisma.coverageRequirement.findMany({
        where: {
          tenantId,
          OR: [
            { dayOfWeek: null }, // All days
            { dayOfWeek }, // Specific day
          ],
        },
      });

      if (roleRequired) {
        requirements = requirements.filter(r => r.roleRequired === roleRequired);
      }

      const coverageStatus: any[] = [];

      for (const requirement of requirements) {
        // Count scheduled staff for this role
        const where: any = {
          tenantId,
          roleAssigned: requirement.roleRequired,
          status: { in: ['SCHEDULED', 'ACTIVE'] },
          scheduledDate: {
            equals: new Date(date.toDateString()),
          },
        };

        // Add time filtering if provided
        if (startTime && endTime) {
          const [startHour, startMin] = startTime.split(':').map(Number);
          const [endHour, endMin] = endTime.split(':').map(Number);

          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;

          // Find shifts that overlap with the time window
          const allShifts = await prisma.shift.findMany(where);

          const overlappingShifts = allShifts.filter(shift => {
            const shiftStartMinutes = shift.scheduledStart.getHours() * 60 + shift.scheduledStart.getMinutes();
            const shiftEndMinutes = shift.scheduledEnd.getHours() * 60 + shift.scheduledEnd.getMinutes();

            return shiftStartMinutes < endMinutes && shiftEndMinutes > startMinutes;
          });

          coverageStatus.push({
            role: requirement.roleRequired,
            requirementMinimum: requirement.minimumStaff,
            staffScheduled: overlappingShifts.length,
            isMetRequirement: overlappingShifts.length >= requirement.minimumStaff,
            shortfall: Math.max(0, requirement.minimumStaff - overlappingShifts.length),
            timeWindow: { startTime, endTime },
          });
        } else {
          const staffCount = await prisma.shift.count(where);

          coverageStatus.push({
            role: requirement.roleRequired,
            requirementMinimum: requirement.minimumStaff,
            staffScheduled: staffCount,
            isMetRequirement: staffCount >= requirement.minimumStaff,
            shortfall: Math.max(0, requirement.minimumStaff - staffCount),
            dayOfWeek: requirement.dayOfWeek,
          });
        }
      }

      return {
        date,
        coverage: coverageStatus,
        isFullyCovered: coverageStatus.every(c => c.isMetRequirement),
        totalShortfall: coverageStatus.reduce((sum, c) => sum + c.shortfall, 0),
      };
    } catch (error: any) {
      logger.error('Error checking coverage:', error.message);
      throw error;
    }
  }

  /**
   * Get understaffed periods
   */
  async getUnderstaffedPeriods(tenantId: string, startDate: Date, endDate: Date) {
    try {
      const understaffed: any[] = [];

      // Get all requirements
      const requirements = await this.getCoverageRequirements(tenantId);

      // Check each day in the range
      const currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();

        for (const requirement of requirements) {
          // Skip if requirement doesn't apply to this day
          if (requirement.dayOfWeek !== null && requirement.dayOfWeek !== dayOfWeek) {
            continue;
          }

          // Count scheduled staff
          const staffCount = await prisma.shift.count({
            where: {
              tenantId,
              roleAssigned: requirement.roleRequired,
              status: { in: ['SCHEDULED', 'ACTIVE'] },
              scheduledDate: {
                equals: new Date(currentDate.toDateString()),
              },
            },
          });

          if (staffCount < requirement.minimumStaff) {
            understaffed.push({
              date: new Date(currentDate),
              role: requirement.roleRequired,
              requirementMinimum: requirement.minimumStaff,
              staffScheduled: staffCount,
              shortfall: requirement.minimumStaff - staffCount,
            });
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return {
        period: { startDate, endDate },
        understaffedPeriods: understaffed,
        totalGaps: understaffed.length,
      };
    } catch (error: any) {
      logger.error('Error getting understaffed periods:', error.message);
      throw error;
    }
  }

  /**
   * Suggest staff to fill open shifts
   */
  async suggestStaffForOpenShift(tenantId: string, roleRequired: string, date: Date, startTime: string, endTime: string) {
    try {
      // Get available staff for this role
      const availableStaff = await prisma.user.findMany({
        where: {
          tenantId,
          isActive: true,
        },
      });

      const [startHour, startMin] = startTime.split(':').map(Number);
      const [endHour, endMin] = endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      const suggestions: any[] = [];

      for (const staff of availableStaff) {
        // Get shifts for this staff on this date
        const staffShifts = await prisma.shift.findMany({
          where: {
            userId: staff.id,
            tenantId,
            scheduledDate: {
              equals: date,
            },
            status: { in: ['SCHEDULED', 'ACTIVE'] },
          },
          select: {
            scheduledStart: true,
            scheduledEnd: true,
          },
        });

        // Check if they have conflicting shifts
        const hasConflict = staffShifts.some(shift => {
          const shiftStartMinutes = shift.scheduledStart.getHours() * 60 + shift.scheduledStart.getMinutes();
          const shiftEndMinutes = shift.scheduledEnd.getHours() * 60 + shift.scheduledEnd.getMinutes();

          return shiftStartMinutes < endMinutes && shiftEndMinutes > startMinutes;
        });

        suggestions.push({
          staffId: staff.id,
          staffName: staff.name,
          email: staff.email,
          phone: staff.phone,
          hourlyRate: staff.hourlyRate,
          hasConflict,
          isAvailable: !hasConflict,
          currentShiftCount: staffShifts.length,
        });
      }

      // Sort by availability (non-conflicting first) then by hourly rate
      suggestions.sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) {
          return a.isAvailable ? -1 : 1;
        }
        return (a.hourlyRate?.toNumber() || 0) - (b.hourlyRate?.toNumber() || 0);
      });

      return {
        openShift: { date, startTime, endTime, roleRequired },
        suggestions,
        availableCount: suggestions.filter(s => s.isAvailable).length,
      };
    } catch (error: any) {
      logger.error('Error suggesting staff:', error.message);
      throw error;
    }
  }

  /**
   * Get coverage summary
   */
  async getCoverageSummary(tenantId: string, date: Date) {
    try {
      const dayOfWeek = date.getDay();

      const requirements = await this.getCoverageRequirements(tenantId);

      const summary: any = {
        date,
        dayOfWeek,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
        requirementsByRole: [],
      };

      for (const requirement of requirements) {
        // Skip if doesn't apply to this day
        if (requirement.dayOfWeek !== null && requirement.dayOfWeek !== dayOfWeek) {
          continue;
        }

        const staffCount = await prisma.shift.count({
          where: {
            tenantId,
            roleAssigned: requirement.roleRequired,
            status: { in: ['SCHEDULED', 'ACTIVE'] },
            scheduledDate: {
              equals: new Date(date.toDateString()),
            },
          },
        });

        summary.requirementsByRole.push({
          role: requirement.roleRequired,
          required: requirement.minimumStaff,
          scheduled: staffCount,
          isMet: staffCount >= requirement.minimumStaff,
          shortfall: Math.max(0, requirement.minimumStaff - staffCount),
        });
      }

      summary.totalMet = summary.requirementsByRole.filter((r: any) => r.isMet).length;
      summary.totalShortfall = summary.requirementsByRole.reduce((sum: number, r: any) => sum + r.shortfall, 0);

      return summary;
    } catch (error: any) {
      logger.error('Error getting coverage summary:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Map role to UserRole
   */
  private mapRoleToUserRole(role: string): string {
    const roleMap: { [key: string]: string } = {
      SERVER: 'SERVER',
      COOK: 'CHEF',
      MANAGER: 'MANAGER',
      HOST: 'HOST',
      BARTENDER: 'BARTENDER',
      SOMMELIER: 'SOMMELIER',
      DISHWASHER: 'DISHWASHER',
      CASHIER: 'CASHIER',
    };

    return roleMap[role] || role;
  }
}

export const coverageTrackingService = new CoverageTrackingService();
