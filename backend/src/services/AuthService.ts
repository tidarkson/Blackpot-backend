import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { JWTPayload, AuthResponse } from '../types/auth';

const prisma = new PrismaClient();

export class AuthService {
  // Hash password
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  // Verify password
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate tokens
  generateTokens(payload: Omit<JWTPayload, 'tenantId'> & { tenantId: string }): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRY,
    } as any);

    const refreshToken = jwt.sign(
      { userId: payload.userId, tenantId: payload.tenantId },
      config.JWT_SECRET,
      { expiresIn: config.REFRESH_TOKEN_EXPIRY } as any
    );

    return { accessToken, refreshToken };
  }

  // Verify token
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET as any) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Login
  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true, location: true },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordMatch = await this.verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      throw new Error('Invalid credentials');
    }

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
        role: user.role,
        tenantId: user.tenantId,
        locationId: user.locationId || '',
      },
    };
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const passwordMatch = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!passwordMatch) throw new Error('Current password incorrect');

    const hashedPassword = await this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });
  }
}