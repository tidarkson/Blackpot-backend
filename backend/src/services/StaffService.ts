import { PrismaClient, UserRole, StaffPosition, Shift, LeaveRequest, User } from '@prisma/client';
import { Decimal } from 'decimal.js';
import logger from '../config/logger';
import { AuthService } from './AuthService';
import { shiftService } from './ScheduleService';
import { socketService } from './SocketService';
import { CreateStaffRequest, UpdateStaffRequest, ListStaffFilters, AvailabilitySchema } from '../validators/staff.validator';

const prisma = new PrismaClient();
const authService = new AuthService();

interface CreateStaffInput {
  email: string;
  name: string;
  role: UserRole;
  positions: StaffPosition[];
  hourlyRate?: number;
  phone?: string;
  locationId?: string;
}

/**
 * StaffService
 * 
 * Comprehensive staff management including:
 * - CRUD operations for staff members
 * - Availability tracking and updates
 * - Staff filtering and searches
 * - Staff deactivation and reactivation
 * - Availability validation
 * - Shift assignment and management
 * - Leave request handling
 */
export class StaffService {
  constructor(private prismaInstance?: PrismaClient) {
    if (prismaInstance) {
      // Use injected Prisma instance (for testing)
    }
  }

  private getPrisma(): PrismaClient {
    return this.prismaInstance || prisma;
  }
  /**
   * Create a new staff member with default availability
   */
  async createStaffMember(tenantId: string, input: CreateStaffInput): Promise<User> {
    const db = this.getPrisma();
    
    // Default availability: all days available
    const defaultAvailability = {
      monday: { available: true, startTime: '09:00', endTime: '17:00' },
      tuesday: { available: true, startTime: '09:00', endTime: '17:00' },
      wednesday: { available: true, startTime: '09:00', endTime: '17:00' },
      thursday: { available: true, startTime: '09:00', endTime: '17:00' },
      friday: { available: true, startTime: '09:00', endTime: '17:00' },
      saturday: { available: true, startTime: '10:00', endTime: '22:00' },
      sunday: { available: false },
    };

    const user = await db.user.create({
      data: {
        tenantId,
        email: input.email,
        name: input.name,
        role: input.role,
        positions: input.positions,
        hourlyRate: input.hourlyRate ? new Decimal(input.hourlyRate) : undefined,
        phone: input.phone,
        availability: defaultAvailability,
        passwordHash: 'hashed_password', // Placeholder - should be properly hashed
        isActive: true,
        locationId: input.locationId,
      },
    });

    logger.info(`✅ Staff member created: ${input.name}`);
    return user;
  }

  /**
   * Set availability for a staff member by day of week
   */
  async setAvailability(userId: string, availability: Record<string, any>): Promise<User> {
    const db = this.getPrisma();
    
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Staff member not found');
    }

    // Merge with existing availability
    const currentAvail = (user.availability as Record<string, any>) || {};
    const updatedAvailability = {
      ...currentAvail,
      ...availability,
    };

    return db.user.update({
      where: { id: userId },
      data: {
        availability: updatedAvailability,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Set availability exception for a specific date range
   */
  async setAvailabilityException(
    userId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date,
    isAvailable: boolean,
    reason?: string
  ): Promise<any> {
    const db = this.getPrisma();
    
    // Create an exception for each day in the range
    const exception = await db.staffAvailabilityException.create({
      data: {
        userId,
        tenantId,
        dateOfException: startDate,
        isAvailable,
        startTime: startDate,
        endTime: endDate,
        reason,
      },
    });

    return exception;
  }

  /**
   * Get available staff for a specific date, optionally filtered by role
   */
  async getAvailableStaff(
    tenantId: string,
    date: Date,
    position?: StaffPosition
  ): Promise<User[]> {
    const db = this.getPrisma();
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      date.getDay()
    ];

    // Get all staff for this tenant
    let staffMembers = await db.user.findMany({
      where: {
        tenantId,
        role: UserRole.STAFF,
        isActive: true,
      },
    });

    // Filter by position if specified
    if (position) {
      staffMembers = staffMembers.filter((staff) => staff.positions.includes(position));
    }

    // Filter by availability
    const availableStaff: User[] = [];

    for (const staff of staffMembers) {
      const isAvailable = await this.checkAvailability(staff.id, date);
      if (isAvailable) {
        availableStaff.push(staff);
      }
    }

    return availableStaff;
  }

  /**
   * Check if a staff member is available on a specific date
   */
  async checkAvailability(userId: string, date: Date): Promise<boolean> {
    const db = this.getPrisma();
    
    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) return false;

    // Check for leave requests
    const leaveRequest = await db.leaveRequest.findFirst({
      where: {
        userId,
        startDate: { lte: date },
        endDate: { gte: date },
        status: 'APPROVED',
      },
    });

    if (leaveRequest) {
      return false;
    }

    // Check for availability exceptions
    const exception = await db.staffAvailabilityException.findFirst({
      where: {
        userId,
        dateOfException: {
          lte: date,
          gte: date,
        },
      },
    });

    if (exception) {
      return exception.isAvailable;
    }

    // Check regular availability by day of week
    const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
      date.getDay()
    ];
    const availability = (user.availability as Record<string, any>) || {};
    const dayAvailability = availability[dayOfWeek];

    if (dayAvailability && dayAvailability.available === false) {
      return false;
    }

    return true;
  }

  /**
   * Assign a staff member to a shift
   */
  async assignShift(shiftId: string, userId: string, tenantId: string): Promise<Shift> {
    const db = this.getPrisma();
    
    const shift = await db.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw new Error('Shift not found');
    }

    const user = await db.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('Staff member not found');
    }

    // Validate role matches
    const roleMatches = this.validateRoleMatch(user.positions, shift.roleAssigned);
    if (!roleMatches) {
      throw new Error(`Staff member does not have required role: ${shift.roleAssigned}`);
    }

    // Update shift with staff assignment
    return db.shift.update({
      where: { id: shiftId },
      data: {
        userId,
        status: 'SCHEDULED',
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Validate if staff member's positions match shift requirement
   */
  validateRoleMatch(staffPositions: StaffPosition[], requiredRole: string): boolean {
    const roleMap: Record<string, StaffPosition> = {
      SERVER: StaffPosition.SERVER,
      HOST: StaffPosition.HOST,
      CHEF: StaffPosition.CHEF,
      BARTENDER: StaffPosition.BARTENDER,
      SOMMELIER: StaffPosition.SOMMELIER,
      CASHIER: StaffPosition.CASHIER,
      DISHWASHER: StaffPosition.DISHWASHER,
    };

    const requiredPosition = roleMap[requiredRole];
    return staffPositions.includes(requiredPosition);
  }

  /**
   * Get shift conflicts for a staff member
   */
  async getShiftConflicts(userId: string, tenantId: string): Promise<any[]> {
    const db = this.getPrisma();
    
    const conflicts = await db.shiftConflict.findMany({
      where: {
        userId,
        tenantId,
        isResolved: false,
      },
    });

    return conflicts;
  }

  /**
   * Request leave for a staff member
   */
  async requestLeave(
    userId: string,
    tenantId: string,
    startDate: Date,
    endDate: Date,
    reason?: string
  ): Promise<LeaveRequest> {
    const db = this.getPrisma();
    
    // Check for overlapping leaves
    const overlappingLeaves = await db.leaveRequest.findMany({
      where: {
        userId,
        tenantId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    if (overlappingLeaves.length > 0) {
      logger.warn(`Leave request overlaps with existing requests for user ${userId}`);
    }

    const leaveRequest = await db.leaveRequest.create({
      data: {
        userId,
        tenantId,
        startDate,
        endDate,
        reason,
        status: 'PENDING',
      },
    });

    // Notify manager
    const managers = await db.user.findMany({
      where: {
        tenantId,
        role: UserRole.MANAGER,
      },
    });

    for (const manager of managers) {
      await db.notification.create({
        data: {
          tenantId,
          userId: manager.id,
          type: 'LEAVE_REQUEST',
          message: `Staff member ${userId} has requested leave from ${startDate.toDateString()} to ${endDate.toDateString()}`,
        },
      });
    }

    logger.info(`📋 Leave request created for staff ${userId}`);
    return leaveRequest;
  }

  /**
   * Check for consecutive leave conflicts
   */
  async checkLeaveConflicts(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<LeaveRequest[]> {
    const db = this.getPrisma();
    
    const conflicts = await db.leaveRequest.findMany({
      where: {
        userId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
        status: { in: ['PENDING', 'APPROVED'] },
      },
    });

    return conflicts;
  }

  /**
   * Approve a leave request
   */
  async approveLeave(leaveRequestId: string, approverId: string, tenantId: string): Promise<LeaveRequest> {
    const db = this.getPrisma();
    
    const leaveRequest = await db.leaveRequest.findUnique({
      where: { id: leaveRequestId },
    });

    if (!leaveRequest) {
      throw new Error('Leave request not found');
    }

    // Update leave request status
    const approved = await db.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: 'APPROVED',
        approvedBy: approverId,
        approvedAt: new Date(),
      },
    });

    // Mark staff as unavailable for the period
    await this.setAvailabilityException(
      leaveRequest.userId,
      tenantId,
      leaveRequest.startDate,
      leaveRequest.endDate,
      false,
      `Approved leave: ${leaveRequest.reason}`
    );

    // Remove or mark conflicting shifts as cancelled
    const conflictingShifts = await db.shift.findMany({
      where: {
        userId: leaveRequest.userId,
        scheduledDate: {
          gte: leaveRequest.startDate,
          lte: leaveRequest.endDate,
        },
      },
    });

    for (const shift of conflictingShifts) {
      await db.shift.update({
        where: { id: shift.id },
        data: {
          status: 'CANCELLED',
          updatedAt: new Date(),
        },
      });

      // Log conflict
      await db.shiftConflict.create({
        data: {
          userId: leaveRequest.userId,
          tenantId,
          shiftId: shift.id,
          conflictType: 'UNAVAILABLE',
          conflictDetails: {
            reason: 'Cancelled due to approved leave',
            leaveRequestId,
          },
        },
      });
    }

    // Notify staff member
    await db.notification.create({
      data: {
        tenantId,
        userId: leaveRequest.userId,
        type: 'LEAVE_APPROVED',
        message: `Your leave request from ${leaveRequest.startDate.toDateString()} to ${leaveRequest.endDate.toDateString()} has been approved.`,
      },
    });

    logger.info(`✅ Leave request approved for staff ${leaveRequest.userId}`);
    return approved;
  }

  /**
   * Reject a leave request
   */
  async rejectLeave(leaveRequestId: string, approverId: string, reason?: string): Promise<LeaveRequest> {
    const db = this.getPrisma();
    
    const rejected = await db.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: 'REJECTED',
        approvedBy: approverId,
        rejectionReason: reason,
      },
    });

    logger.info(`❌ Leave request rejected`);
    return rejected;
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

  async clockInStaff(staffId: string, tenantId: string) {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const activeShift = await prisma.shift.findFirst({
      where: {
        tenantId,
        userId: staffId,
        status: 'ACTIVE',
      },
      orderBy: { scheduledStart: 'desc' },
    });

    if (activeShift) {
      return {
        shiftId: activeShift.id,
      };
    }

    const scheduledShift = await prisma.shift.findFirst({
      where: {
        tenantId,
        userId: staffId,
        status: 'SCHEDULED',
        scheduledDate: {
          gte: startOfToday,
          lte: endOfToday,
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    if (!scheduledShift) {
      throw new Error('No scheduled shift found for this staff member today');
    }

    await shiftService.clockIn(scheduledShift.id, tenantId);

    const staff = await prisma.user.findFirst({
      where: {
        id: staffId,
        tenantId,
      },
      select: {
        locationId: true,
      },
    });

    return {
      shiftId: scheduledShift.id,
      locationId: staff?.locationId || undefined,
    };
  }

  async clockOutStaff(staffId: string, tenantId: string) {
    const activeShift = await prisma.shift.findFirst({
      where: {
        tenantId,
        userId: staffId,
        status: 'ACTIVE',
      },
      orderBy: { scheduledStart: 'desc' },
    });

    if (!activeShift) {
      throw new Error('No active shift found for this staff member');
    }

    await shiftService.clockOut(activeShift.id, tenantId);

    return {
      shiftId: activeShift.id,
    };
  }

  async startBreak(staffId: string, tenantId: string) {
    socketService.emitStaffStatusUpdated(tenantId, staffId, 'ON_BREAK');

    return {
      staffId,
      status: 'ON_BREAK',
    };
  }

  async endBreak(staffId: string, tenantId: string) {
    socketService.emitStaffStatusUpdated(tenantId, staffId, 'CLOCKED_IN');

    return {
      staffId,
      status: 'CLOCKED_IN',
    };
  }

  /**
   * Helper: Map staff role to UserRole
   */
  private mapStaffRoleToUserRole(staffRole: string): UserRole {
    const roleMap: { [key: string]: UserRole } = {
      SERVER: UserRole.STAFF,
      COOK: UserRole.STAFF,
      MANAGER: UserRole.MANAGER,
      HOST: UserRole.STAFF,
      BARTENDER: UserRole.STAFF,
      SOMMELIER: UserRole.STAFF,
      DISHWASHER: UserRole.STAFF,
    };

    return roleMap[staffRole] || UserRole.STAFF;
  }
}

export const staffService = new StaffService();
