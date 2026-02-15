import 'express-session';

/**
 * Extend Express-Session to include custom session properties
 */
declare global {
  namespace Express {
    interface Session {
      // User information
      user_id?: string;
      restaurant_id?: string;
      role?: string;
      email?: string;

      // Session metadata
      login_time?: number;
      last_activity?: number;
      ip_address?: string;
      fingerprint?: string;
      rememberMe?: boolean;
      deviceId?: string;

      // Session control
      isValid?: boolean;
      touch?: () => void;
    }
  }
}

/**
 * Session metadata for tracking concurrent sessions
 */
export interface SessionMetadata {
  login_time: number;
  ip_address: string;
  fingerprint: string;
  rememberMe: boolean;
}

/**
 * Session info returned from getUserSessions
 */
export interface SessionInfo {
  sessionId: string;
  loginTime: Date;
  ipAddress: string;
  rememberMe: boolean;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  userId?: string;
}

/**
 * Session creation options
 */
export interface SessionCreateOptions {
  rememberMe?: boolean;
  deviceName?: string;
}

/**
 * Session statistics
 */
export interface SessionStats {
  activeSessions: number;
  totalUsers: number;
}

export default {};
