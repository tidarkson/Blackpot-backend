import { PrismaClient, StaffPosition, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { JWTPayload, AuthResponse } from '../types/auth';

const prisma = new PrismaClient();

type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve';
type PermissionMap = Record<string, Record<PermissionAction, boolean>>;

export class AuthService {
    private readonly defaultPermissionsByRole: Record<string, PermissionMap> = {
      OWNER: {
        refunds: { view: true, create: true, edit: true, delete: true, approve: true },
        menu_items: { view: true, create: true, edit: true, delete: true, approve: true },
        tax_settings: { view: true, create: true, edit: true, delete: true, approve: true },
        payroll: { view: true, create: true, edit: true, delete: true, approve: true },
        roles_perms: { view: true, create: true, edit: true, delete: true, approve: true },
      },
      MANAGER: {
        refunds: { view: true, create: true, edit: true, delete: false, approve: true },
        menu_items: { view: true, create: true, edit: true, delete: true, approve: true },
        tax_settings: { view: true, create: false, edit: true, delete: false, approve: true },
        payroll: { view: true, create: false, edit: true, delete: false, approve: true },
        roles_perms: { view: true, create: true, edit: true, delete: false, approve: true },
      },
      SUPERVISOR: {
        refunds: { view: true, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: true, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: true, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: true, create: false, edit: false, delete: false, approve: false },
      },
      STAFF: {
        refunds: { view: true, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: false, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
      },
      SERVER: {
        refunds: { view: true, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: false, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
      },
      KITCHEN: {
        refunds: { view: false, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: true, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: false, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
      },
      HOST: {
        refunds: { view: false, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: false, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
      },
      CASHIER: {
        refunds: { view: true, create: false, edit: false, delete: false, approve: false },
        menu_items: { view: true, create: false, edit: false, delete: false, approve: false },
        tax_settings: { view: false, create: false, edit: false, delete: false, approve: false },
        payroll: { view: false, create: false, edit: false, delete: false, approve: false },
        roles_perms: { view: false, create: false, edit: false, delete: false, approve: false },
      },
    };

    private mapClientRole(role: UserRole, positions: StaffPosition[]): string {
      if (role === UserRole.STAFF) {
        if (positions.includes(StaffPosition.CHEF)) return 'KITCHEN';
        if (positions.includes(StaffPosition.HOST)) return 'HOST';
        if (positions.includes(StaffPosition.CASHIER)) return 'CASHIER';
        if (positions.includes(StaffPosition.SERVER)) return 'SERVER';
        return 'STAFF';
      }

      return role;
    }

    private getEffectiveRoleName(user: {
      role: UserRole;
      positions: StaffPosition[];
      customRoleName: string | null;
    }): string {
      if (user.customRoleName) {
        return user.customRoleName;
      }

      return this.mapClientRole(user.role, user.positions);
    }

    private getDefaultPermissions(roleName: string): PermissionMap {
      const byRole = this.defaultPermissionsByRole[roleName.toUpperCase()];
      return byRole ?? this.defaultPermissionsByRole.STAFF;
    }

    private async getResolvedPermissions(tenantId: string, roleName: string): Promise<PermissionMap> {
      const persisted = await prisma.rolePermission.findFirst({
        where: {
          tenantId,
          roleName,
          deletedAt: null,
        },
      });

      if (persisted?.permissions) {
        return persisted.permissions as PermissionMap;
      }

      return this.getDefaultPermissions(roleName);
    }

    private mapRegistrationRole(inputRole: string): {
      role: UserRole;
      positions: StaffPosition[];
      clientRole: string;
    } {
      const normalized = inputRole.toUpperCase();

      if (normalized === 'SERVER') {
        return { role: UserRole.STAFF, positions: [StaffPosition.SERVER], clientRole: 'SERVER' };
      }

      if (normalized === 'KITCHEN') {
        return { role: UserRole.STAFF, positions: [StaffPosition.CHEF], clientRole: 'KITCHEN' };
      }

      if (normalized === 'HOST') {
        return { role: UserRole.STAFF, positions: [StaffPosition.HOST], clientRole: 'HOST' };
      }

      if (normalized === 'CASHIER') {
        return { role: UserRole.STAFF, positions: [StaffPosition.CASHIER], clientRole: 'CASHIER' };
      }

      if (normalized === 'OWNER') {
        return { role: UserRole.OWNER, positions: [], clientRole: 'OWNER' };
      }

      if (normalized === 'MANAGER') {
        return { role: UserRole.MANAGER, positions: [], clientRole: 'MANAGER' };
      }

      if (normalized === 'SUPERVISOR') {
        return { role: UserRole.SUPERVISOR, positions: [], clientRole: 'SUPERVISOR' };
      }

      if (normalized === 'CUSTOMER') {
        return { role: UserRole.CUSTOMER, positions: [], clientRole: 'CUSTOMER' };
      }

      return { role: UserRole.STAFF, positions: [], clientRole: 'STAFF' };
    }

  // Bcrypt rounds for hashing - balance between security and performance
  // Higher values = more secure but slower (use 10-12)
  private readonly BCRYPT_ROUNDS = 12;

  /**
   * Hash password using bcrypt
   * @param password - Plain text password to hash
   * @returns Promise<string> - Hashed password
   */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  /**
   * Verify password against hash
   * @param password - Plain text password to verify
   * @param hash - Hashed password from database
   * @returns Promise<boolean> - True if password matches
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT access and refresh tokens
   * @param payload - JWT payload with user data
   * @returns Object with accessToken and refreshToken
   */
  generateTokens(
    payload: Omit<JWTPayload, 'tenantId'> & { tenantId: string },
    rememberMe: boolean = false
  ): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRY,
    } as any);

    const refreshToken = jwt.sign(
      { userId: payload.userId, tenantId: payload.tenantId, rememberMe },
      config.JWT_SECRET,
      { expiresIn: config.REFRESH_TOKEN_EXPIRY } as any
    );

    return { accessToken, refreshToken };
  }

  /**
   * Verify JWT token
   * @param token - JWT token to verify
   * @returns JWTPayload - Decoded token data
   * @throws Error if token is invalid or expired
   */
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET as any) as JWTPayload;
    } catch (error: any) {
      // Log the specific JWT error for debugging
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token has expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token signature');
      }
      throw new Error('Invalid token');
    }
  }

  /**
   * Verify refresh token and rotate access/refresh token pair.
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
  }> {
    if (!refreshToken) {
      throw new Error('No refresh token provided');
    }

    let decoded: jwt.JwtPayload;
    try {
      decoded = jwt.verify(refreshToken, config.JWT_SECRET as any) as jwt.JwtPayload;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token has expired');
      }
      throw new Error('Invalid refresh token');
    }

    const userId = decoded.userId as string | undefined;
    const tenantId = decoded.tenantId as string | undefined;

    if (!userId || !tenantId) {
      throw new Error('Invalid refresh token payload');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: true, location: true },
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }

    const rememberMe = decoded.rememberMe === true;

    const tokens = this.generateTokens(
      {
        userId: user.id,
        tenantId: user.tenantId,
        locationId: user.locationId || '',
        role: user.role,
        email: user.email,
      },
      rememberMe
    );

    return {
      ...tokens,
      rememberMe,
    };
  }

  /**
   * Get remaining token lifetime in seconds for Redis TTL operations.
   */
  getTokenRemainingLifetime(token: string): number {
    const decoded = jwt.decode(token) as jwt.JwtPayload | null;
    if (!decoded?.exp) return 0;

    const nowSeconds = Math.floor(Date.now() / 1000);
    return Math.max(decoded.exp - nowSeconds, 0);
  }

  /**
   * Authenticate user with email and password
   * @param email - User email
   * @param password - User password
   * @param ipAddress - Optional IP address for audit logging
   * @returns Promise<AuthResponse> - Auth tokens and user data
   * @throws Error if credentials invalid or account locked
   */
  async login(email: string, password: string, ipAddress?: string): Promise<AuthResponse> {
    // Validate email format
    if (!email || !this.isValidEmail(email)) {
      throw new Error('Invalid email address');
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { tenant: true, location: true },
    });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      throw new Error('Invalid credentials');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new Error(`Account is locked. Try again in ${remainingMinutes} minutes.`);
    }

    // Verify password
    const passwordMatch = await this.verifyPassword(password, user.passwordHash);

    if (!passwordMatch) {
      // Increment failed attempts
      const newFailedAttempts = user.failedLoginAttempts + 1;
      let lockedUntil = null;

      // Lock account after 5 failed attempts for 15 minutes
      if (newFailedAttempts >= 5) {
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newFailedAttempts,
          lockedUntil,
        },
      });

      throw new Error('Invalid credentials');
    }

    // Successful login - generate tokens and reset failed attempts
    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      locationId: user.locationId || '',
      role: user.role,
      email: user.email,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress || null,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: this.mapClientRole(user.role, user.positions),
        tenantId: user.tenantId,
        locationId: user.locationId || '',
      },
    };
  }

  /**
   * Change user password
   * @param userId - User ID
   * @param currentPassword - Current password for verification
   * @param newPassword - New password
   * @throws Error if user not found or current password incorrect
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!userId || !currentPassword || !newPassword) {
      throw new Error('Missing required fields');
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const passwordMatch = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!passwordMatch) throw new Error('Current password incorrect');

    // Prevent reusing the same password
    const sameAsOld = await this.verifyPassword(newPassword, user.passwordHash);
    if (sameAsOld) {
      throw new Error('New password cannot be the same as current password');
    }

    const hashedPassword = await this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });
  }

  /**
   * Register new user
   * @param data - User registration data
   * @returns Promise<AuthResponse> - Auth tokens and user data
   * @throws Error if email already registered or validation fails
   */
  async register(data: {
    email: string;
    password: string;
    name: string;
    role: string;
    tenantId?: string;
    locationId?: string;
  }): Promise<AuthResponse> {
        const roleMapping = this.mapRegistrationRole(data.role);

        let tenantId = data.tenantId;
        if (!tenantId) {
          const firstTenant = await prisma.tenant.findFirst({
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });

          if (!firstTenant) {
            throw new Error('No tenant available for signup. Please contact an administrator.');
          }

          tenantId = firstTenant.id;
        }

        let locationId = data.locationId;
        if (!locationId) {
          const firstLocation = await prisma.location.findFirst({
            where: { tenantId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });

          locationId = firstLocation?.id;
        }

    // Validate input
    if (!data.email || !this.isValidEmail(data.email)) {
      throw new Error('Invalid email address');
    }
    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Name is required');
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password
    const passwordHash = await this.hashPassword(data.password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name.trim(),
        passwordHash,
        role: roleMapping.role,
        positions: roleMapping.positions,
        tenantId,
        locationId,
        isActive: true,
      },
      include: { tenant: true, location: true },
    });

    // Generate tokens
    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      locationId: user.locationId || '',
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: roleMapping.clientRole,
        tenantId: user.tenantId,
        locationId: user.locationId || '',
      },
    };
  }

  /**
   * Get current user data
   * @param userId - User ID
   * @returns Promise with user data including tenant and location
   * @throws Error if user not found
   */
  async getCurrentUser(userId: string): Promise<{
    id: string;
    email: string;
    name: string;
    role: string;
    tenantId: string;
    locationId: string;
    tenant: { id: string; name: string } | null;
    location: { id: string; name: string } | null;
    permissions: PermissionMap;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const roleName = this.getEffectiveRoleName(user);
    const permissions = await this.getResolvedPermissions(user.tenantId, roleName);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: this.mapClientRole(user.role, user.positions),
      tenantId: user.tenantId,
      locationId: user.locationId || '',
      tenant: user.tenant,
      location: user.location,
      permissions,
    };
  }

  /**
   * Validate email format
   * @param email - Email to validate
   * @returns boolean - True if email is valid
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
