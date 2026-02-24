import { Request } from 'express';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../utils/redisClient';
import { 
  SessionData, 
  generateSessionFingerprint, 
  validateSessionFingerprint,
  getSessionTimeout 
} from '../config/session.config';
import {
  SessionInfo,
  SessionMetadata,
  SessionValidationResult,
  SessionStats,
} from '../types/session';
import { config } from '../config/environment';
import logger from '../config/logger';

const prisma = new PrismaClient();

/**
 * Session Service
 * Manages Redis-backed session operations including:
 * - Session creation and validation
 * - Concurrent session limits
 * - Session refresh (sliding window)
 * - Session cleanup
 */
export class SessionService {
  private readonly SESSION_KEY_PREFIX = 'session:';
  private readonly USER_SESSIONS_PREFIX = 'user:sessions:';
  private readonly MAX_CONCURRENT_SESSIONS = 3;

  /**
   * Create a new session for user login
   * Enforces concurrent session limits
   */
  public async createSession(
    req: Request,
    userId: string,
    restaurantId: string,
    role: string,
    email: string,
    rememberMe: boolean = false
  ): Promise<void> {
    try {
      // Generate session fingerprint for security
      const fingerprint = generateSessionFingerprint(req);
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      const currentTime = Date.now();

      // Set session data in Express session
      // Check if req.session exists (may be undefined if session middleware isn't initialized)
      if (!req.session) {
        throw new Error('Session middleware not initialized. Cannot create session.');
      }

      (req as any).session.user_id = userId;
      (req as any).session.restaurant_id = restaurantId;
      (req as any).session.role = role;
      (req as any).session.email = email;
      (req as any).session.login_time = currentTime;
      (req as any).session.last_activity = currentTime;
      (req as any).session.ip_address = ipAddress;
      (req as any).session.fingerprint = fingerprint;
      (req as any).session.rememberMe = rememberMe;

      // Handle concurrent session limits
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const existingSessions = await redisClient.hgetall(sessionLimitKey);

      // If max sessions exceeded, remove oldest session
      if (Object.keys(existingSessions).length >= this.MAX_CONCURRENT_SESSIONS) {
        let oldestSessionId = '';
        let oldestTime = Infinity;

        for (const [sessionId, sessionData] of Object.entries(existingSessions)) {
          const data = JSON.parse(sessionData as string);
          if (data.login_time < oldestTime) {
            oldestTime = data.login_time;
            oldestSessionId = sessionId;
          }
        }

        if (oldestSessionId) {
          await redisClient.hdel(sessionLimitKey, oldestSessionId);
          logger.info(`Session limit exceeded. Removed oldest session for user ${userId}`);
        }
      }

      // Store session metadata in Redis for tracking
      const sessionMetadata = {
        login_time: currentTime,
        ip_address: ipAddress,
        fingerprint,
        rememberMe,
      };

      await redisClient.hset(
        sessionLimitKey,
        (req as any).sessionID,
        JSON.stringify(sessionMetadata)
      );

      // Set expiration on concurrent sessions tracker
      const sessionTimeout = getSessionTimeout(rememberMe);
      await redisClient.expire(sessionLimitKey, Math.floor(sessionTimeout / 1000));

      // Update user's last login
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
        },
      });

      logger.info(`Session created for user ${userId}`);
    } catch (error) {
      logger.error('Error creating session:', error);
      throw new Error(`Failed to create session: ${error}`);
    }
  }

  /**
   * Validate session on every request
   * Checks fingerprint and enforces sliding window timeout
   */
  async validateSession(req: Request, rememberMe?: boolean): Promise<boolean> {
    try {
      // Check if session middleware is initialized
      if (!req.session) {
        logger.warn('Session middleware not initialized. Cannot validate session.');
        return false;
      }

      if (!(req as any).session?.user_id) {
        return false;
      }

      const storedFingerprint = (req as any).session.fingerprint;
      const currentFingerprint = generateSessionFingerprint(req);

      // Validate session fingerprint (strict mode for production)
      const strictMode = config.NODE_ENV === 'production';
      if (!validateSessionFingerprint(currentFingerprint, storedFingerprint, strictMode)) {
        logger.warn(
          `Session fingerprint mismatch for user ${(req as any).session.user_id}. Possible hijacking attempt.`
        );
        return false;
      }

      // Update last activity timestamp (sliding window)
      (req as any).session.last_activity = Date.now();
      (req as any).session.touch();

      // Update in Redis
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${(req as any).session.user_id}`;
      const sessionId = (req as any).sessionID;
      const sessionMetadata = {
        login_time: (req as any).session.login_time,
        ip_address: (req as any).session.ip_address,
        fingerprint: (req as any).session.fingerprint,
        rememberMe: (req as any).session.rememberMe,
      };

      await redisClient.hset(
        sessionLimitKey,
        sessionId,
        JSON.stringify(sessionMetadata)
      );

      // Extend TTL on the session tracking key (sliding window)
      const shouldRemember = rememberMe !== undefined ? rememberMe : (req as any).session.rememberMe;
      const sessionTimeout = getSessionTimeout(shouldRemember);
      await redisClient.expire(sessionLimitKey, Math.floor(sessionTimeout / 1000));

      return true;
    } catch (error) {
      logger.error('Error validating session:', error);
      return false;
    }
  }

  /**
   * Clear session on logout
   * Removes from both Express session and Redis
   */
  async clearSession(req: Request): Promise<void> {
    try {
      // Check if session exists before accessing it
      if (!req.session) {
        logger.warn('Session middleware not initialized. Cannot clear session.');
        return;
      }

      const userId = (req as any).session.user_id;

      if (userId) {
        // Remove from user's concurrent sessions
        const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
        await redisClient.hdel(sessionLimitKey, (req as any).sessionID);

        logger.info(`Session cleared for user ${userId}`);
      }

      // Destroy Express session
      (req as any).session.destroy((err: any) => {
        if (err) {
          logger.error('Error destroying session:', err);
        }
      });
    } catch (error) {
      logger.error('Error clearing session:', error);
      throw new Error(`Failed to clear session: ${error}`);
    }
  }

  /**
   * Invalidate all sessions for a user
   * Used when password is changed or security action required
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    try {
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessions = await redisClient.hgetall(sessionLimitKey);

      // Delete all session records from Redis
      for (const sessionId of Object.keys(sessions)) {
        // Delete the actual session data
        await redisClient.del(`session:${sessionId}`);
      }

      // Clear the user's session tracking
      await redisClient.del(sessionLimitKey);

      logger.info(`All sessions invalidated for user ${userId}`);
    } catch (error) {
      logger.error('Error invalidating user sessions:', error);
      throw new Error(`Failed to invalidate sessions: ${error}`);
    }
  }

  /**
   * Extend session expiration (sliding window)
   * Called on each authenticated request
   */
  async extendSession(req: Request, rememberMe?: boolean): Promise<void> {
    try {
      // Check if session middleware is initialized
      if (!req.session) {
        logger.warn('Session middleware not initialized. Cannot extend session.');
        return;
      }

      if (!(req as any).session?.user_id) {
        return;
      }

      const shouldRemember = rememberMe !== undefined ? rememberMe : (req as any).session.rememberMe;
      const sessionTimeout = getSessionTimeout(shouldRemember);

      // Update session timeout
      (req as any).session.cookie.maxAge = sessionTimeout;

      // Extend TTL in Redis for the session tracking key
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${(req as any).session.user_id}`;
      await redisClient.expire(sessionLimitKey, Math.floor(sessionTimeout / 1000));

      // Re-save to update expiration
      (req as any).session.save((err: any) => {
        if (err) {
          logger.error('Error extending session:', err);
        }
      });
    } catch (error) {
      logger.error('Error extending session:', error);
    }
  }

  /**
   * Get all active sessions for a user
   * Returns list of devices/sessions currently active
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${userId}`;
      const sessions = await redisClient.hgetall(sessionLimitKey);

      return Object.entries(sessions)
        .map(([sessionId, metadata]) => {
          const data = JSON.parse(metadata as string) as SessionMetadata;
          return {
            sessionId,
            loginTime: new Date(data.login_time),
            ipAddress: data.ip_address,
            rememberMe: data.rememberMe,
          };
        })
        .sort((a: SessionInfo, b: SessionInfo) => b.loginTime.getTime() - a.loginTime.getTime());
    } catch (error) {
      logger.error('Error retrieving user sessions:', error);
      return [];
    }
  }

  /**
   * Revoke a specific session by ID
   * Useful for "logout from other devices" feature
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    try {
      const sessionLimitKey = `${this.USER_SESSIONS_PREFIX}${userId}`;

      // Remove from session tracking
      await redisClient.hdel(sessionLimitKey, sessionId);

      // Delete the actual session from Redis
      await redisClient.del(`session:${sessionId}`);

      logger.info(`Session ${sessionId} revoked for user ${userId}`);
    } catch (error) {
      logger.error('Error revoking session:', error);
      throw new Error(`Failed to revoke session: ${error}`);
    }
  }

  /**
   * Cleanup expired sessions from Redis
   * Called periodically by job scheduler
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      // Redis automatically expires keys based on TTL
      // This is a utility function if manual cleanup is needed
      logger.info('Session cleanup completed');
      return 0;
    } catch (error) {
      logger.error('Error cleaning up sessions:', error);
      throw new Error(`Failed to cleanup sessions: ${error}`);
    }
  }

  /**
   * Get session statistics
   * Useful for monitoring and debugging
   */
  async getSessionStats(): Promise<SessionStats> {
    try {
      // This is approximate - counts user session keys
      const keys = await redisClient.keys(`${this.USER_SESSIONS_PREFIX}*`);
      const activeSessions = await redisClient.keys('session:*');
      const totalSessions = activeSessions.length;

      return {
        activeSessions: keys.length,
        totalUsers: keys.length, // Approximate
      };
    } catch (error) {
      logger.error('Error getting session stats:', error);
      return { activeSessions: 0, totalUsers: 0 };
    }
  }

  /**
   * Validate session IP address (optional security feature)
   */
  validateSessionIP(storedIP: string, currentIP: string, enabled: boolean = false): boolean {
    if (!enabled) return true;
    return storedIP === currentIP;
  }
}

export const sessionService = new SessionService();
export default sessionService;
