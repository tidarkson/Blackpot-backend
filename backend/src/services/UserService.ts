import { PrismaClient, UserRole, Prisma } from '@prisma/client';
import { AuthService } from './AuthService';

const prisma = new PrismaClient();
const authService = new AuthService();

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  locationId?: string;
  phone?: string;
  hourlyRate?: number;
  hireDate?: Date;
}

export interface UpdateUserInput {
  name?: string;
  role?: UserRole;
  isActive?: boolean;
  phone?: string;
  hourlyRate?: number;
  hireDate?: Date;
}

export class UserService {
  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   * Requirements: min 8 chars, 1 uppercase, 1 number
   */
  private validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    return { valid: true };
  }

  /**
   * Get all users for a tenant
   */
  async getAllUsers(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        phone: true,
        hourlyRate: true,
      },
    });
  }

  /**
   * Get user by ID - excludes password hash
   * Enforces tenant isolation
   */
  async getUserById(userId: string, tenantId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        locationId: true,
        createdAt: true,
        updatedAt: true,
        phone: true,
        hourlyRate: true,
        hireDate: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Enforce tenant isolation
    if (tenantId && user.tenantId !== tenantId) {
      throw new Error('Access denied: User does not belong to your tenant');
    }

    return user;
  }

  /**
   * Create new user with validation
   * Checks: email format, password strength, duplicate emails, tenant isolation
   */
  async createUser(tenantId: string, data: CreateUserInput) {
    // Validate email format
    if (!this.isValidEmail(data.email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    const passwordValidation = this.validatePasswordStrength(data.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Hash password
    const passwordHash = await authService.hashPassword(data.password);

    try {
      const user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name,
          passwordHash,
          role: data.role ?? UserRole.STAFF,
          tenantId,
          locationId: data.locationId,
          isActive: true,
          phone: data.phone,
          hourlyRate: data.hourlyRate,
          hireDate: data.hireDate,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          tenantId: true,
          locationId: true,
          createdAt: true,
          phone: true,
          hourlyRate: true,
        },
      });

      // Log user creation for audit
      await this.logActivity(tenantId, 'USER_CREATED', `User ${user.email} created`, user.id);

      return user;
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  /**
   * Update user - prevents password updates and privilege escalation
   */
  async updateUser(userId: string, data: UpdateUserInput, tenantId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Enforce tenant isolation
    if (tenantId && user.tenantId !== tenantId) {
      throw new Error('Access denied: User does not belong to your tenant');
    }

    // Prevent updating to OWNER role (privilege escalation check)
    if (data.role === UserRole.OWNER) {
      throw new Error('Cannot update user to OWNER role via this endpoint');
    }

    // Validate email uniqueness if email update attempted
    if (data.role && data.role !== user.role) {
      // Log role change for audit
      await this.logActivity(
        user.tenantId,
        'USER_ROLE_UPDATED',
        `User role changed from ${user.role} to ${data.role}`,
        userId
      );
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        role: data.role,
        isActive: data.isActive,
        phone: data.phone,
        hourlyRate: data.hourlyRate,
        hireDate: data.hireDate,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        locationId: true,
        createdAt: true,
        updatedAt: true,
        phone: true,
        hourlyRate: true,
      },
    });

    return updated;
  }

  /**
   * Deactivate user
   * Marks as inactive but keeps data for audit trail
   */
  async deactivateUser(userId: string, tenantId?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (tenantId && user.tenantId !== tenantId) {
      throw new Error('Access denied: User does not belong to your tenant');
    }

    // Prevent login after deactivation
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        lockedUntil: null, // Clear any account lock
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        role: true,
      },
    });

    // Log deactivation for audit
    await this.logActivity(
      user.tenantId,
      'USER_DEACTIVATED',
      `User ${user.email} deactivated`,
      userId
    );

    return updated;
  }

  /**
   * Change user password
   * Validates current password and new password strength
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const passwordMatch = await authService.verifyPassword(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      throw new Error('Current password is incorrect');
    }

    // Validate new password strength
    const passwordValidation = this.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.message);
    }

    // Prevent reusing old password
    const sameAsOld = await authService.verifyPassword(newPassword, user.passwordHash);
    if (sameAsOld) {
      throw new Error('New password cannot be the same as current password');
    }

    const hashedPassword = await authService.hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashedPassword,
        failedLoginAttempts: 0, // Reset on successful password change
        lockedUntil: null,
      },
    });

    // Invalidate existing tokens by logging activity
    await this.logActivity(user.tenantId, 'PASSWORD_CHANGED', `User password changed`, userId);

    return { message: 'Password changed successfully' };
  }

  /**
   * Log activity for audit trail
   */
  private async logActivity(tenantId: string, action: string, details: string, userId?: string) {
    try {
      await prisma.activityLog.create({
        data: {
          tenantId,
          entity: 'USER',
          action,
          metadata: { details },
          userId,
        },
      });
    } catch (error) {
      // Log silently - don't fail if audit logging fails
      console.error('Failed to log activity:', error);
    }
  }
}