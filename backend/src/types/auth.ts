import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  locationId: string;
  role: UserRole;
  email: string;
}

export interface AuthRequest extends Request {
  tenantId?: string;
  userId?: string;
  user?: JWTPayload;
  body: any;
  params: any;
  query: any;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
    locationId: string;
  };
}

export interface PasswordResetRequest {
  email: string;
  newPassword: string;
  resetToken?: string;
}