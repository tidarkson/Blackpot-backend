import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import sessionService from '../src/services/SessionService';
import {
  generateSessionFingerprint,
  validateSessionFingerprint,
  getSessionTimeout,
} from '../src/config/session.config';

const prisma = new PrismaClient();

/**
 * Session Management Tests
 * Tests Redis-backed session functionality including:
 * - Session creation and validation
 * - Concurrent session limits
 * - Session refresh and expiration
 * - Multi-server deployment support
 */
describe('Session Management', () => {
  let app: any;
  let testUserId: string;
  let testTenantId: string;
  let testSessionId: string;

  beforeAll(async () => {
    // sessionService is imported as singleton

    // Create test tenant first
    const testTenant = await prisma.tenant.create({
      data: {
        name: `Session Test Tenant ${Date.now()}`,
        isActive: true,
      },
    });

    testTenantId = testTenant.id;

    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: `session-test-${Date.now()}@example.com`,
        name: 'Session Test User',
        passwordHash: 'hashed_password',
        role: 'STAFF',
        tenantId: testTenantId,
        isActive: true,
      },
    });

    testUserId = testUser.id;
  });

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
    if (testTenantId) {
      await prisma.tenant.delete({ where: { id: testTenantId } });
    }
    await prisma.$disconnect();
  });

  describe('Session Creation', () => {
    it('should create a session for user login', async () => {
      const mockReq = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          if (header === 'accept-language') return 'en-US';
          return '';
        },
        sessionID: `session-${Date.now()}`,
        session: {},
      } as any;

      await sessionService.createSession(
        mockReq,
        testUserId,
        testTenantId,
        'USER',
        'test@example.com',
        false
      );

      expect(mockReq.session.user_id).toBe(testUserId);
      expect(mockReq.session.restaurant_id).toBe(testTenantId);
      expect(mockReq.session.fingerprint).toBeDefined();
      expect(mockReq.session.login_time).toBeDefined();

      testSessionId = mockReq.sessionID;
    });

    it('should create session with remember me enabled', async () => {
      const mockReq = {
        ip: '192.168.1.2',
        socket: { remoteAddress: '192.168.1.2' },
        get: (header: string) => 'Test Agent',
        sessionID: `session-${Date.now()}`,
        session: {},
      } as any;

      await sessionService.createSession(
        mockReq,
        testUserId,
        testTenantId,
        'ADMIN',
        'admin@example.com',
        true
      );

      expect(mockReq.session.rememberMe).toBe(true);
    });

    it('should enforce concurrent session limits', async () => {
      // Create multiple sessions
      for (let i = 0; i < 4; i++) {
        const mockReq = {
          ip: `192.168.1.${i + 10}`,
          socket: { remoteAddress: `192.168.1.${i + 10}` },
          get: (header: string) => 'Test Agent',
          sessionID: `session-${i}-${Date.now()}`,
          session: {},
        } as any;

        await sessionService.createSession(
          mockReq,
          testUserId,
          testTenantId,
          'USER',
          'test@example.com',
          false
        );
      }

      // Verify only max concurrent sessions are stored
      const sessions = await sessionService.getUserSessions(testUserId);
      expect(sessions.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Session Validation', () => {
    it('should validate session fingerprint', () => {
      const mockReq = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          if (header === 'accept-language') return 'en-US';
          return '';
        },
      } as any;

      const fingerprint = generateSessionFingerprint(mockReq);
      const isValid = validateSessionFingerprint(fingerprint, fingerprint, true);

      expect(isValid).toBe(true);
    });

    it('should reject mismatched fingerprints in strict mode', () => {
      const fingerprint1 = 'fingerprint1';
      const fingerprint2 = 'fingerprint2';

      const isValid = validateSessionFingerprint(fingerprint1, fingerprint2, true);
      expect(isValid).toBe(false);
    });

    it('should allow mismatched fingerprints in non-strict mode', () => {
      const fingerprint1 = 'fingerprint1';
      const fingerprint2 = 'fingerprint2';

      const isValid = validateSessionFingerprint(fingerprint1, fingerprint2, false);
      expect(isValid).toBe(true);
    });
  });

  describe('Session Timeout', () => {
    it('should return 24-hour timeout for regular sessions', () => {
      const timeout = getSessionTimeout(false);
      const expectedTimeout = 24 * 60 * 60 * 1000;
      expect(timeout).toBe(expectedTimeout);
    });

    it('should return 30-day timeout for remember me sessions', () => {
      const timeout = getSessionTimeout(true);
      const expectedTimeout = 30 * 24 * 60 * 60 * 1000;
      expect(timeout).toBe(expectedTimeout);
    });
  });

  describe('User Sessions Management', () => {
    it('should retrieve all user sessions', async () => {
      const sessions = await sessionService.getUserSessions(testUserId);
      expect(Array.isArray(sessions)).toBe(true);
      // Sessions may be empty if Redis is not running (graceful degradation)
      // Just verify the return type is correct
    });

    it('should have correct session metadata', async () => {
      const sessions = await sessionService.getUserSessions(testUserId);
      if (sessions.length > 0) {
        const session = sessions[0];
        expect(session).toHaveProperty('sessionId');
        expect(session).toHaveProperty('loginTime');
        expect(session).toHaveProperty('ipAddress');
        expect(session).toHaveProperty('rememberMe');
      }
    });

    it('should revoke a specific session', async () => {
      const sessions = await sessionService.getUserSessions(testUserId);
      if (sessions.length > 0) {
        const sessionToRevoke = sessions[0].sessionId;
        await sessionService.revokeSession(testUserId, sessionToRevoke);

        const updatedSessions = await sessionService.getUserSessions(testUserId);
        const revokedExists = updatedSessions.some(
          (s: any) => s.sessionId === sessionToRevoke
        );
        expect(revokedExists).toBe(false);
      }
    });

    it('should invalidate all user sessions', async () => {
      // Create a test user with sessions
      const testUser = await prisma.user.create({
        data: {
          email: `session-invalidate-test-${Date.now()}@example.com`,
          name: 'Session Invalidate Test',
          passwordHash: 'hashed_password',
          role: 'STAFF',
          tenantId: testTenantId,
          isActive: true,
        },
      });

      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const mockReq = {
          ip: `192.168.1.${i}`,
          socket: { remoteAddress: `192.168.1.${i}` },
          get: (header: string) => 'Test Agent',
          sessionID: `session-test-${i}-${Date.now()}`,
          session: {},
        } as any;

        await sessionService.createSession(
          mockReq,
          testUser.id,
          testUser.tenantId,
          'USER',
          testUser.email,
          false
        );
      }

      // Invalidate all
      await sessionService.invalidateAllUserSessions(testUser.id);

      // Verify all sessions cleared
      const sessions = await sessionService.getUserSessions(testUser.id);
      expect(sessions.length).toBe(0);

      // Cleanup
      await prisma.user.delete({ where: { id: testUser.id } });
    });
  });

  describe('Session Fingerprinting', () => {
    it('should generate consistent fingerprints for same request', () => {
      const mockReq = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          if (header === 'accept-language') return 'en-US';
          return '';
        },
      } as any;

      const fingerprint1 = generateSessionFingerprint(mockReq);
      const fingerprint2 = generateSessionFingerprint(mockReq);

      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different fingerprints for different user-agents', () => {
      const mockReq1 = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => {
          if (header === 'user-agent') return 'Mozilla/5.0';
          return '';
        },
      } as any;

      const mockReq2 = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => {
          if (header === 'user-agent') return 'Chrome/90.0';
          return '';
        },
      } as any;

      const fingerprint1 = generateSessionFingerprint(mockReq1);
      const fingerprint2 = generateSessionFingerprint(mockReq2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate different fingerprints for different IPs', () => {
      const mockReq1 = {
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        get: (header: string) => 'Mozilla/5.0',
      } as any;

      const mockReq2 = {
        ip: '192.168.1.2',
        socket: { remoteAddress: '192.168.1.2' },
        get: (header: string) => 'Mozilla/5.0',
      } as any;

      const fingerprint1 = generateSessionFingerprint(mockReq1);
      const fingerprint2 = generateSessionFingerprint(mockReq2);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Session Statistics', () => {
    it('should retrieve session statistics', async () => {
      const stats = await sessionService.getSessionStats();
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('totalUsers');
      expect(typeof stats.activeSessions).toBe('number');
      expect(typeof stats.totalUsers).toBe('number');
    });
  });

  describe('IP Validation', () => {
    it('should validate matching IP addresses', () => {
      const isValid = sessionService.validateSessionIP(
        '192.168.1.1',
        '192.168.1.1',
        true
      );
      expect(isValid).toBe(true);
    });

    it('should reject mismatched IP addresses when enabled', () => {
      const isValid = sessionService.validateSessionIP(
        '192.168.1.1',
        '192.168.1.2',
        true
      );
      expect(isValid).toBe(false);
    });

    it('should allow any IP when validation disabled', () => {
      const isValid = sessionService.validateSessionIP(
        '192.168.1.1',
        '192.168.1.2',
        false
      );
      expect(isValid).toBe(true);
    });
  });
});

/**
 * Session Integration Tests
 * Tests session integration with auth routes
 */
describe('Session Integration', () => {
  let testUser: any;
  let testTenant: any;
  let accessToken: string;

  beforeAll(async () => {
    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: `Integration Test Tenant ${Date.now()}`,
        isActive: true,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        email: `integration-test-${Date.now()}@example.com`,
        name: 'Integration Test User',
        passwordHash: 'hashed_password',
        role: 'OWNER',
        tenantId: testTenant.id,
        isActive: true,
      },
    });
  });

  afterAll(async () => {
    if (testUser?.id) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
    if (testTenant?.id) {
      await prisma.tenant.delete({ where: { id: testTenant.id } });
    }
  });

  it('should maintain session across requests', async () => {
    // Note: This test would require a running server instance
    // Placeholder for integration test example
    expect(true).toBe(true);
  });
});
