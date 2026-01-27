import { UserRole } from '@prisma/client';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  locationId: string;
  role: UserRole;
  email: string;
}

export interface AuthRequest {
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