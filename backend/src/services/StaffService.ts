import { PrismaClient, UserRole } from '@prisma/client';
import { Decimal } from 'decimal.js';
import logger from '../config/logger';
import { AuthService } from './AuthService';
import { CreateStaffRequest, UpdateStaffRequest, ListStaffFilters, AvailabilitySchema } from '../validators/staff.validator';

const prisma = new PrismaClient();
const authService = new AuthService();

/**
 * StaffService
 * 
 * Comprehensive staff management including:
 * - CRUD operations for staff members
 * - Availability tracking and updates
 * - Staff filtering and searches
 * - Staff deactivation and reactivation
 * - Availability validation
 */
export class StaffService {
  /**
   * Create a new staff member
   */
  async createStaff(tenantId: string, data: CreateStaffRequest) {
    try {
      // Hash password
      const passwordHash = await authService.hashPassword(data.password);

      // Map staff role to UserRole
      const userRole = this.mapStaffRoleToUserRole(data.role);

      // Validate availability if provided
      if (data.availability) {
        AvailabilitySchema.parse(data.availability);
      }

      const staff = await prisma.user.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash,
          role: userRole,
          tenantId,
          locationId: data.locationId,
          phone: data.phone,
          hourlyRate: data.hourlyRate ? new Decimal(data.hourlyRate) : undefined,
          hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
          availability: (data.availability as any) || null,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          hourlyRate: true,
          hireDate: true,
          availability: true,
          isActive: true,
          createdAt: true,
        },
      });

      logger.info(`✅ Staff member created: ${data.name} (${data.role})`);

      return staff;
    } catch (error: any) {
      logger.error('Error creating staff:', error.message);
      throw error;
    }
  }

  /**
   * Get all staff for a tenant
   */
  async getAllStaff(tenantId: string, filters?: ListStaffFilters) {
    try {
      const where: any = {
        tenantId,
        isActive: true,
      };

      // Apply filters
      if (filters?.role) {
        where.role = this.mapStaffRoleToUserRole(filters.role);
      }

      if (filters?.locationId) {
        where.locationId = filters.locationId;
      }

      if (filters?.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters?.search) {
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      // Build sort
      const orderBy: any = {};
      if (filters?.sortBy) {
        orderBy[filters.sortBy] = filters?.sortOrder || 'asc';
      } else {
        orderBy.name = 'asc';
      }

      const staff = await prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          hourlyRate: true,
          hireDate: true,
          availability: true,
          isActive: true,
          createdAt: true,
          shifts: {
            where: { status: 'ACTIVE' },
            select: { id: true, scheduledDate: true },
          },
        },
        orderBy,
        take: filters?.limit || 20,
        skip: filters?.offset || 0,
      });

      return staff;
    } catch (error: any) {
      logger.error('Error fetching staff:', error.message);
      throw error;
    }
  }

  /**
   * Get a single staff member
   */
  async getStaffById(staffId: string, tenantId: string) {
    try {
      const staff = await prisma.user.findFirst({
        where: {
          id: staffId,
          tenantId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          hourlyRate: true,
          hireDate: true,
          availability: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          shifts: {
            select: {
              id: true,
              scheduledDate: true,
              scheduledStart: true,
              scheduledEnd: true,
              roleAssigned: true,
              status: true,
            },
            orderBy: { scheduledDate: 'desc' },
            take: 10,
          },
        },
      });

      if (!staff) {
        throw new Error('Staff member not found');
      }

      return staff;
    } catch (error: any) {
      logger.error('Error fetching staff:', error.message);
      throw error;
    }
  }

  /**
   * Update staff member
   */
  async updateStaff(staffId: string, tenantId: string, data: UpdateStaffRequest) {
    try {
      // Validate availability if provided
      if (data.availability) {
        AvailabilitySchema.parse(data.availability);
      }

      const updateData: any = {};

      if (data.email) updateData.email = data.email;
      if (data.name) updateData.name = data.name;
      if (data.role) updateData.role = this.mapStaffRoleToUserRole(data.role);
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.hourlyRate !== undefined) {
        updateData.hourlyRate = data.hourlyRate ? BigInt(Math.round(data.hourlyRate * 100)) : null;
      }
      if (data.hireDate !== undefined) updateData.hireDate = data.hireDate ? new Date(data.hireDate) : null;
      if (data.availability !== undefined) updateData.availability = data.availability;
      if (data.isActive !== undefined) updateData.isActive = data.isActive;

      const staff = await prisma.user.update({
        where: { id: staffId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          hourlyRate: true,
          hireDate: true,
          availability: true,
          isActive: true,
          updatedAt: true,
        },
      });

      logger.info(`✅ Staff member updated: ${staff.name}`);

      return staff;
    } catch (error: any) {
      logger.error('Error updating staff:', error.message);
      throw error;
    }
  }

  /**
   * Deactivate staff member
   */
  async deactivateStaff(staffId: string, tenantId: string) {
    try {
      const staff = await prisma.user.update({
        where: { id: staffId },
        data: { isActive: false },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      logger.info(`❌ Staff member deactivated: ${staff.name}`);

      return staff;
    } catch (error: any) {
      logger.error('Error deactivating staff:', error.message);
      throw error;
    }
  }

  /**
   * Reactivate staff member
   */
  async reactivateStaff(staffId: string, tenantId: string) {
    try {
      const staff = await prisma.user.update({
        where: { id: staffId },
        data: { isActive: true },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      logger.info(`✅ Staff member reactivated: ${staff.name}`);

      return staff;
    } catch (error: any) {
      logger.error('Error reactivating staff:', error.message);
      throw error;
    }
  }

  /**
   * Update staff availability
   */
  async updateAvailability(staffId: string, tenantId: string, availability: any) {
    try {
      // Validate availability structure
      AvailabilitySchema.parse(availability);

      const staff = await prisma.user.update({
        where: { id: staffId },
        data: { availability },
        select: {
          id: true,
          name: true,
          availability: true,
        },
      });

      logger.info(`📅 Availability updated for: ${staff.name}`);

      return staff;
    } catch (error: any) {
      logger.error('Error updating availability:', error.message);
      throw error;
    }
  }

  /**
   * Get staff availability
   */
  async getAvailability(staffId: string, tenantId: string) {
    try {
      const staff = await prisma.user.findFirst({
        where: {
          id: staffId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          availability: true,
        },
      });

      if (!staff) {
        throw new Error('Staff member not found');
      }

      return staff;
    } catch (error: any) {
      logger.error('Error fetching availability:', error.message);
      throw error;
    }
  }

  /**
   * Bulk update staff operations
   */
  async bulkUpdateStaff(tenantId: string, staffIds: string[], action: string, metadata?: any) {
    try {
      if (action === 'ACTIVATE') {
        await prisma.user.updateMany({
          where: {
            id: { in: staffIds },
            tenantId,
          },
          data: { isActive: true },
        });
      } else if (action === 'DEACTIVATE') {
        await prisma.user.updateMany({
          where: {
            id: { in: staffIds },
            tenantId,
          },
          data: { isActive: false },
        });
      } else if (action === 'REASSIGN_LOCATION' && metadata?.locationId) {
        await prisma.user.updateMany({
          where: {
            id: { in: staffIds },
            tenantId,
          },
          data: { locationId: metadata.locationId },
        });
      }

      logger.info(`✅ Bulk action '${action}' completed for ${staffIds.length} staff`);

      return { staffCount: staffIds.length, action };
    } catch (error: any) {
      logger.error('Error bulk updating staff:', error.message);
      throw error;
    }
  }

  /**
   * Check if staff is available for a time slot
   */
  async isStaffAvailable(staffId: string, tenantId: string, date: Date, startTime: string, endTime: string) {
    try {
      const staff = await prisma.user.findFirst({
        where: { id: staffId, tenantId },
        select: { availability: true },
      });

      if (!staff || !staff.availability) {
        return true; // No availability constraints set
      }

      const dayOfWeek = date.getDay();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayName = dayNames[dayOfWeek] as keyof typeof staff.availability;

      const dayAvailability = (staff.availability as any)[dayName];

      if (!dayAvailability || !dayAvailability.available) {
        return false; // Staff not available on this day
      }

      if (dayAvailability.startTime && dayAvailability.endTime) {
        // Check if shift falls within available hours
        const [availStartHour, availStartMin] = dayAvailability.startTime.split(':').map(Number);
        const [availEndHour, availEndMin] = dayAvailability.endTime.split(':').map(Number);

        const [shiftStartHour, shiftStartMin] = startTime.split(':').map(Number);
        const [shiftEndHour, shiftEndMin] = endTime.split(':').map(Number);

        const shiftStartMinutes = shiftStartHour * 60 + shiftStartMin;
        const shiftEndMinutes = shiftEndHour * 60 + shiftEndMin;
        const availStartMinutes = availStartHour * 60 + availStartMin;
        const availEndMinutes = availEndHour * 60 + availEndMin;

        if (shiftStartMinutes < availStartMinutes || shiftEndMinutes > availEndMinutes) {
          return false; // Shift outside available hours
        }
      }

      return true; // Staff is available
    } catch (error: any) {
      logger.error('Error checking staff availability:', error.message);
      throw error;
    }
  }

  /**
   * Get staff performance metrics
   */
  async getStaffMetrics(staffId: string, tenantId: string, startDate: Date, endDate: Date) {
    try {
      const shifts = await prisma.shift.findMany({
        where: {
          userId: staffId,
          tenantId,
          scheduledDate: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: ['COMPLETED', 'ACTIVE'] },
        },
        include: {
          tips: true,
          clockIns: true,
        },
      });

      const totalShifts = shifts.length;
      const totalHours = shifts.reduce((sum, shift) => sum + (shift.hoursWorked?.toNumber() || 0), 0);
      const totalTips = shifts.reduce((sum, shift) => {
        const tipSum = shift.tips.reduce((s: any, t: any) => s + (t.amount?.toNumber() || 0), 0);
        return sum + tipSum;
      }, 0);

      return {
        staffId,
        totalShifts,
        totalHours,
        totalTips,
        averageHoursPerShift: totalShifts > 0 ? totalHours / totalShifts : 0,
        averageTipsPerShift: totalShifts > 0 ? totalTips / totalShifts : 0,
        period: { startDate, endDate },
      };
    } catch (error: any) {
      logger.error('Error fetching staff metrics:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Map staff role to UserRole
   */
  private mapStaffRoleToUserRole(staffRole: string): UserRole {
    const roleMap: { [key: string]: UserRole } = {
      SERVER: UserRole.SERVER,
      COOK: UserRole.CHEF,
      MANAGER: UserRole.MANAGER,
      HOST: UserRole.HOST,
      BARTENDER: UserRole.BARTENDER,
      SOMMELIER: UserRole.SOMMELIER,
      DISHWASHER: UserRole.DISHWASHER,
    };

    return roleMap[staffRole] || UserRole.SERVER;
  }
}

export const staffService = new StaffService();
