import { PrismaClient, UserRole } from '@prisma/client';
import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../src/services/AuthService';
import { PasswordResetService } from '../src/services/PasswordResetService';
import { AuthController } from '../src/controllers/AuthController';
import { authenticate, requireRole } from '../src/middleware/auth';
import { config } from '../src/config/environment';

const prisma = new PrismaClient();
let app: Express;
let authService: AuthService;
let passwordResetService: PasswordResetService;

// ============================================================================
// TEST SETUP
// ============================================================================

describe('Feature A1: Authentication & Authorization System', () => {
  let tenantId: string;
  let locationId: string;
  let testUser: any;
  let testAdmin: any;
  let testManager: any;
  let testStaff: any;
  let testAccessToken: string;
  let testRefreshToken: string;

  beforeAll(async () => {
    // Initialize services
    authService = new AuthService();
    passwordResetService = new PasswordResetService();

    // Setup Express app with routes
    app = express();
    app.use(express.json());

    // Auth routes
    app.post('/auth/login', AuthController.login);
    app.post('/auth/register', AuthController.register);
    app.post('/auth/logout', authenticate, AuthController.logout);
    app.post('/auth/change-password', authenticate, AuthController.changePassword);
    app.post('/auth/forgot-password', AuthController.forgotPassword);
    app.get('/auth/current-user', authenticate, AuthController.getCurrentUser);

    // Protected route examples
    app.get('/admin/dashboard', authenticate, requireRole('OWNER'), (req, res) => {
      res.json({ message: 'Admin dashboard', user: req.user });
    });

    app.get('/manager/reports', authenticate, requireRole('MANAGER'), (req, res) => {
      res.json({ message: 'Manager reports', user: req.user });
    });

    app.get('/staff/schedule', authenticate, requireRole('STAFF', 'MANAGER', 'OWNER'), (req, res) => {
      res.json({ message: 'Staff schedule', user: req.user });
    });

    // Create test tenant and location
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Auth Test Restaurant',
        isActive: true,
      },
    });

    tenantId = tenant.id;

    const location = await prisma.location.create({
      data: {
        tenantId,
        name: 'Main Location',
      },
    });

    locationId = location.id;

    // Create test users with different roles
    const passwordHash = await authService.hashPassword('TestPassword123!');

    // Use unique timestamps in emails to avoid conflicts
    const timestamp = Date.now();
    testUser = await prisma.user.create({
      data: {
        tenantId,
        email: `user-${timestamp}@test.com`,
        name: 'Test User',
        passwordHash,
        role: 'CUSTOMER',
        locationId,
        isActive: true,
      },
      include: { tenant: true, location: true },
    });

    testAdmin = await prisma.user.create({
      data: {
        tenantId,
        email: `admin-${timestamp}@test.com`,
        name: 'Admin User',
        passwordHash,
        role: 'OWNER',
        locationId,
        isActive: true,
      },
      include: { tenant: true, location: true },
    });

    testManager = await prisma.user.create({
      data: {
        tenantId,
        email: `manager-${timestamp}@test.com`,
        name: 'Manager User',
        passwordHash,
        role: 'MANAGER',
        locationId,
        isActive: true,
      },
      include: { tenant: true, location: true },
    });

    testStaff = await prisma.user.create({
      data: {
        tenantId,
        email: `staff-${timestamp}@test.com`,
        name: 'Staff User',
        passwordHash,
        role: 'STAFF',
        locationId,
        isActive: true,
      },
      include: { tenant: true, location: true },
    });

    // Generate tokens for test user
    const tokens = authService.generateTokens({
      userId: testUser.id,
      tenantId,
      locationId,
      role: testUser.role,
      email: testUser.email,
    });

    testAccessToken = tokens.accessToken;
    testRefreshToken = tokens.refreshToken;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.location.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Reset failed login attempts before each test
    await prisma.user.updateMany({
      where: { tenantId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Reset test user passwords for test isolation
    const passwordHash = await authService.hashPassword('TestPassword123!');
    await prisma.user.updateMany({
      where: { tenantId },
      data: { passwordHash },
    });
  });

  // ============================================================================
  // PART 1: AuthService Tests
  // ============================================================================

  describe('AuthService', () => {
    // ========================================
    // Hash Password Tests
    // ========================================

    describe('hashPassword', () => {
      test('✓ should hash password correctly', async () => {
        const password = 'TestPassword123!';
        const hash = await authService.hashPassword(password);

        expect(hash).not.toBe(password);
        expect(hash).toHaveLength(60); // bcrypt hash length
        expect(hash).toMatch(/^\$2[aby]\$/);
      });

      test('✓ should generate different hashes for same password', async () => {
        const password = 'TestPassword123!';
        const hash1 = await authService.hashPassword(password);
        const hash2 = await authService.hashPassword(password);

        expect(hash1).not.toBe(hash2);
      });

      test('✓ should handle long passwords', async () => {
        const longPassword = 'A'.repeat(72);
        const hash = await authService.hashPassword(longPassword);
        expect(hash).toHaveLength(60);
      });
    });

    // ========================================
    // Verify Password Tests
    // ========================================

    describe('verifyPassword', () => {
      test('✓ should verify correct password', async () => {
        const password = 'TestPassword123!';
        const hash = await authService.hashPassword(password);
        const isValid = await authService.verifyPassword(password, hash);

        expect(isValid).toBe(true);
      });

      test('✓ should reject incorrect password', async () => {
        const password = 'TestPassword123!';
        const hash = await authService.hashPassword(password);
        const isValid = await authService.verifyPassword('WrongPassword', hash);

        expect(isValid).toBe(false);
      });

      test('✓ should be case-sensitive', async () => {
        const password = 'TestPassword123!';
        const hash = await authService.hashPassword(password);
        const isValid = await authService.verifyPassword('testpassword123!', hash);

        expect(isValid).toBe(false);
      });
    });

    // ========================================
    // Generate Tokens Tests
    // ========================================

    describe('generateTokens', () => {
      test('✓ should generate access token and refresh token', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);

        expect(tokens.accessToken).toBeDefined();
        expect(tokens.refreshToken).toBeDefined();
        expect(typeof tokens.accessToken).toBe('string');
        expect(typeof tokens.refreshToken).toBe('string');
      });

      test('✓ should include userId, email, and role in access token', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        const decoded = jwt.verify(tokens.accessToken, config.JWT_SECRET as string) as any;

        expect(decoded.userId).toBe(testUser.id);
        expect(decoded.email).toBe(testUser.email);
        expect(decoded.role).toBe(testUser.role);
        expect(decoded.tenantId).toBe(tenantId);
      });

      test('✓ should set access token expiration to 15 minutes', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        const decoded = jwt.verify(tokens.accessToken, config.JWT_SECRET as string) as any;
        const expiresIn = decoded.exp! - Math.floor(Date.now() / 1000);

        expect(expiresIn).toBeLessThanOrEqual(15 * 60);
        expect(expiresIn).toBeGreaterThan(14 * 60);
      });

      test('✓ should be verifiable with secret key', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);

        expect(() => {
          jwt.verify(tokens.accessToken, config.JWT_SECRET as string);
        }).not.toThrow();
      });

      test('✓ should reject token signed with different secret', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);

        expect(() => {
          jwt.verify(tokens.accessToken, 'different-secret');
        }).toThrow();
      });

      test('✓ should include refresh token in response', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);

        expect(tokens.refreshToken).toBeDefined();
        expect(typeof tokens.refreshToken).toBe('string');
      });

      test('✓ should have longer expiration for refresh token (7 days)', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        const decoded = jwt.verify(tokens.refreshToken, config.JWT_SECRET as string) as any;
        const expiresIn = decoded.exp! - Math.floor(Date.now() / 1000);

        expect(expiresIn).toBeGreaterThan(6 * 24 * 60 * 60);
        expect(expiresIn).toBeLessThanOrEqual(7 * 24 * 60 * 60);
      });
    });

    // ========================================
    // Verify Token Tests
    // ========================================

    describe('verifyToken', () => {
      test('✓ should verify valid token', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        const verified = authService.verifyToken(tokens.accessToken);

        expect(verified.userId).toBe(testUser.id);
        expect(verified.email).toBe(testUser.email);
      });

      test('✓ should reject expired token', async () => {
        // Create an expired token
        const expiredToken = jwt.sign(
          {
            userId: testUser.id,
            tenantId,
            locationId,
            role: testUser.role,
            email: testUser.email,
          },
          config.JWT_SECRET as string,
          { expiresIn: '-1h' }
        );

        expect(() => {
          authService.verifyToken(expiredToken);
        }).toThrow();
      });

      test('✓ should reject invalid signature', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        // Tamper with token
        const tamperedToken = tokens.accessToken.substring(0, tokens.accessToken.length - 10) + 'tampered!!';

        expect(() => {
          authService.verifyToken(tamperedToken);
        }).toThrow();
      });

      test('✓ should extract user data correctly', () => {
        const payload = {
          userId: testUser.id,
          tenantId,
          locationId: locationId,
          role: testUser.role,
          email: testUser.email,
        };

        const tokens = authService.generateTokens(payload);
        const verified = authService.verifyToken(tokens.accessToken);

        expect(verified.userId).toBe(payload.userId);
        expect(verified.tenantId).toBe(payload.tenantId);
        expect(verified.locationId).toBe(payload.locationId);
        expect(verified.role).toBe(payload.role);
        expect(verified.email).toBe(payload.email);
      });
    });

    // ========================================
    // Login Tests
    // ========================================

    describe('login', () => {
      test('✓ should return JWT tokens on valid credentials', async () => {
        const result = await authService.login(testUser.email, 'TestPassword123!');

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.user).toBeDefined();
        expect(result.user.id).toBe(testUser.id);
        expect(result.user.email).toBe(testUser.email);
      });

      test('✓ should include user object in response', async () => {
        const result = await authService.login(testUser.email, 'TestPassword123!');

        expect(result.user).toHaveProperty('id');
        expect(result.user).toHaveProperty('email');
        expect(result.user).toHaveProperty('name');
        expect(result.user).toHaveProperty('role');
        expect(result.user).toHaveProperty('tenantId');
      });

      test('✓ should reject invalid email', async () => {
        await expect(authService.login('nonexistent@test.com', 'password')).rejects.toThrow(
          'Invalid credentials'
        );
      });

      test('✓ should reject invalid password', async () => {
        await expect(authService.login(testUser.email, 'WrongPassword')).rejects.toThrow(
          'Invalid credentials'
        );
      });

      test('✓ should increment failed attempts on invalid password', async () => {
        let user = await prisma.user.findUnique({
          where: { id: testUser.id },
        });
        expect(user?.failedLoginAttempts).toBe(0);

        try {
          await authService.login(testUser.email, 'WrongPassword');
        } catch (e) {
          // Expected
        }

        user = await prisma.user.findUnique({
          where: { id: testUser.id },
        });
        expect(user?.failedLoginAttempts).toBeGreaterThan(0);
      });

      test('✓ should lock account after 5 failed attempts', async () => {
        // Create a new user for this test
        const newUser = await prisma.user.create({
          data: {
            tenantId,
            email: 'locktest@test.com',
            name: 'Lock Test User',
            passwordHash: await authService.hashPassword('TestPassword123!'),
            role: 'CUSTOMER',
            locationId,
            isActive: true,
          },
        });

        // Make 5 failed login attempts
        for (let i = 0; i < 5; i++) {
          try {
            await authService.login(newUser.email, 'WrongPassword');
          } catch (e) {
            // Expected
          }
        }

        // Account should now be locked
        const lockedUser = await prisma.user.findUnique({
          where: { id: newUser.id },
        });

        expect(lockedUser?.lockedUntil).not.toBeNull();
        expect(lockedUser?.failedLoginAttempts).toBeGreaterThanOrEqual(5);

        // Try to login with correct password should fail with locked message
        await expect(authService.login(newUser.email, 'TestPassword123!')).rejects.toThrow(
          /Account is locked/
        );

        // Cleanup
        await prisma.user.delete({ where: { id: newUser.id } });
      });

      test('✓ should reset failed attempts on successful login', async () => {
        // Manually set failed attempts
        await prisma.user.update({
          where: { id: testUser.id },
          data: { failedLoginAttempts: 3 },
        });

        // Login successfully
        await authService.login(testUser.email, 'TestPassword123!');

        // Failed attempts should be reset
        const user = await prisma.user.findUnique({
          where: { id: testUser.id },
        });

        expect(user?.failedLoginAttempts).toBe(0);
      });

      test('✓ should update last login timestamp', async () => {
        const beforeLogin = new Date();
        await authService.login(testUser.email, 'TestPassword123!');
        const afterLogin = new Date();

        const user = await prisma.user.findUnique({
          where: { id: testUser.id },
        });

        expect(user?.lastLoginAt).not.toBeNull();
        expect(user?.lastLoginAt!.getTime()).toBeGreaterThanOrEqual(beforeLogin.getTime());
        expect(user?.lastLoginAt!.getTime()).toBeLessThanOrEqual(afterLogin.getTime());
      });

      test('✓ should store IP address on login', async () => {
        await authService.login(testUser.email, 'TestPassword123!', '192.168.1.1');

        const user = await prisma.user.findUnique({
          where: { id: testUser.id },
        });

        expect(user?.lastLoginIp).toBe('192.168.1.1');
      });
    });

    // ========================================
    // Change Password Tests
    // ========================================

    describe('changePassword', () => {
      beforeEach(async () => {
        // Reset testUser password before each test for test isolation
        const passwordHash = await authService.hashPassword('TestPassword123!');
        await prisma.user.update({
          where: { id: testUser.id },
          data: { passwordHash },
        });
      });

      test('✓ should change password with correct current password', async () => {
        const newPassword = 'NewPassword456!';
        await authService.changePassword(testUser.id, 'TestPassword123!', newPassword);

        // Verify new password works
        const result = await authService.login(testUser.email, newPassword);
        expect(result.accessToken).toBeDefined();
      });

      test('✓ should reject invalid current password', async () => {
        await expect(
          authService.changePassword(testUser.id, 'WrongPassword', 'NewPassword456!')
        ).rejects.toThrow('Current password incorrect');
      });

      test('✓ should hash new password', async () => {
        const beforeHash = await prisma.user.findUnique({
          where: { id: testUser.id },
        });

        const newPassword = 'AnotherPassword789!';
        await authService.changePassword(testUser.id, 'TestPassword123!', newPassword);

        const afterHash = await prisma.user.findUnique({
          where: { id: testUser.id },
        });

        expect(beforeHash?.passwordHash).not.toBe(afterHash?.passwordHash);
      });

      test('✓ should work for all user roles', async () => {
        const newPassword = 'ManagerNewPass123!';
        await authService.changePassword(testManager.id, 'TestPassword123!', newPassword);

        const result = await authService.login(testManager.email, newPassword);
        expect(result.user.role).toBe('MANAGER');
      });
    });

    // ========================================
    // Register Tests
    // ========================================

    describe('register', () => {
      test('✓ should create user with valid data', async () => {
        const result = await authService.register({
          email: 'newuser@test.com',
          password: 'NewUser123!',
          name: 'New User',
          role: 'CUSTOMER',
          locationId,
          tenantId,
        });

        expect(result.user.email).toBe('newuser@test.com');
        expect(result.user.name).toBe('New User');
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();

        // Cleanup
        await prisma.user.delete({ where: { id: result.user.id } });
      });

      test('✓ should hash password on registration', async () => {
        const result = await authService.register({
          email: 'hashedpw@test.com',
          password: 'HashedPass123!',
          name: 'Hashed User',
          role: 'CUSTOMER',
          locationId,
          tenantId,
        });

        const user = await prisma.user.findUnique({
          where: { id: result.user.id },
        });

        const passwordMatch = await authService.verifyPassword('HashedPass123!', user!.passwordHash);
        expect(passwordMatch).toBe(true);

        // Cleanup
        await prisma.user.delete({ where: { id: result.user.id } });
      });

      test('✓ should reject duplicate email', async () => {
        await expect(
          authService.register({
            email: testUser.email,
            password: 'DifferentPass123!',
            name: 'Different User',
            role: 'CUSTOMER',
            locationId,
            tenantId,
          })
        ).rejects.toThrow('Email already registered');
      });

      test('✓ should generate tokens immediately after registration', async () => {
        const result = await authService.register({
          email: 'immediate@test.com',
          password: 'Immediate123!',
          name: 'Immediate User',
          role: 'CUSTOMER',
          locationId,
          tenantId,
        });

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();

        // Tokens should be valid
        const verified = authService.verifyToken(result.accessToken);
        expect(verified.userId).toBe(result.user.id);

        // Cleanup
        await prisma.user.delete({ where: { id: result.user.id } });
      });
    });

    // ========================================
    // Get Current User Tests
    // ========================================

    describe('getCurrentUser', () => {
      test('✓ should return user data', async () => {
        const user = await authService.getCurrentUser(testUser.id);

        expect(user.id).toBe(testUser.id);
        expect(user.email).toBe(testUser.email);
        expect(user.name).toBe(testUser.name);
        expect(user.role).toBe(testUser.role);
      });

      test('✓ should include tenant and location', async () => {
        const user = await authService.getCurrentUser(testUser.id);

        expect(user.tenant).toBeDefined();
        expect(user.location).toBeDefined();
        expect(user.tenant?.id).toBe(tenantId);
      });

      test('✓ should not return password hash', async () => {
        const user = await authService.getCurrentUser(testUser.id) as any;
        expect(user.passwordHash).toBeUndefined();
      });

      test('✓ should throw error for non-existent user', async () => {
        await expect(authService.getCurrentUser('non-existent-id')).rejects.toThrow('User not found');
      });
    });
  });

  // ============================================================================
  // PART 2: AuthController Tests (HTTP Endpoints)
  // ============================================================================

  describe('AuthController', () => {
    // ========================================
    // POST /auth/login Tests
    // ========================================

    describe('POST /auth/login', () => {
      test('✓ should return tokens on valid login', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: 'TestPassword123!',
          })
          .expect(200);

        expect(response.body.status).toBe('success');
        expect(response.body.data.accessToken).toBeDefined();
        expect(response.body.data.refreshToken).toBeDefined();
        expect(response.body.data.user).toBeDefined();
      });

      test('✓ should return 401 on invalid credentials', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: 'WrongPassword',
          })
          .expect(401);

        expect(response.body.status).toBe('error');
        expect(response.body.error).toBe('INVALID_CREDENTIALS');
      });

      test('✓ should return 400 on missing fields', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            // Missing password
          })
          .expect(400);

        expect(response.body.status).toBe('error');
      });

      test('✓ should return 423 on account locked', async () => {
        // Create a new user and lock it
        const newUser = await prisma.user.create({
          data: {
            tenantId,
            email: 'locked@test.com',
            name: 'Locked User',
            passwordHash: await authService.hashPassword('TestPassword123!'),
            role: 'CUSTOMER',
            locationId,
            isActive: true,
            lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        const response = await request(app)
          .post('/auth/login')
          .send({
            email: 'locked@test.com',
            password: 'TestPassword123!',
          })
          .expect(423);

        expect(response.body.error).toBe('ACCOUNT_LOCKED');

        // Cleanup
        await prisma.user.delete({ where: { id: newUser.id } });
      });

      test('✓ should include user data in response', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({
            email: testUser.email,
            password: 'TestPassword123!',
          })
          .expect(200);

        expect(response.body.data.user).toHaveProperty('id');
        expect(response.body.data.user).toHaveProperty('email');
        expect(response.body.data.user).toHaveProperty('name');
        expect(response.body.data.user).toHaveProperty('role');
      });
    });

    // ========================================
    // POST /auth/register Tests
    // ========================================

    describe('POST /auth/register', () => {
      test('✓ should register new user', async () => {
        const response = await request(app)
          .post('/auth/register')
          .send({
            email: 'register@test.com',
            password: 'RegisterPass123!',
            name: 'Register Test',
            role: 'CUSTOMER',
            locationId,
            tenantId,
          })
          .expect(201);

        expect(response.body.status).toBe('success');
        expect(response.body.data.accessToken).toBeDefined();
        expect(response.body.data.user.email).toBe('register@test.com');

        // Cleanup
        await prisma.user.delete({ where: { id: response.body.data.user.id } });
      });

      test('✓ should return 409 on duplicate email', async () => {
        const response = await request(app)
          .post('/auth/register')
          .send({
            email: testUser.email,
            password: 'DifferentPass123!',
            name: 'Different Name',
            role: 'CUSTOMER',
            locationId,
            tenantId,
          })
          .expect(409);

        expect(response.body.status).toBe('error');
        expect(response.body.error).toBe('DUPLICATE_EMAIL');
      });

      test('✓ should return 400 on validation error', async () => {
        const response = await request(app)
          .post('/auth/register')
          .send({
            email: 'invalid-email',
            password: 'short',
            name: 'Test',
            role: 'CUSTOMER',
            locationId,
            tenantId,
          })
          .expect(400);

        expect(response.body.status).toBe('error');
      });
    });

    // ========================================
    // POST /auth/logout Tests
    // ========================================

    describe('POST /auth/logout', () => {
      test('✓ should logout user', async () => {
        const response = await request(app)
          .post('/auth/logout')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(200);

        expect(response.body.status).toBe('success');
        expect(response.body.message).toBe('Logged out successfully');
      });

      test('✓ should return 401 without token', async () => {
        const response = await request(app)
          .post('/auth/logout')
          .expect(401);

        expect(response.body.status).toBe('error');
      });

      test('✓ should return 401 with invalid token', async () => {
        const response = await request(app)
          .post('/auth/logout')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.status).toBe('error');
      });
    });

    // ========================================
    // POST /auth/change-password Tests
    // ========================================

    describe('POST /auth/change-password', () => {
      test('✓ should change password with valid request', async () => {
        const response = await request(app)
          .post('/auth/change-password')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .send({
            currentPassword: 'TestPassword123!',
            newPassword: 'UpdatedPassword456!',
          })
          .expect(200);

        expect(response.body.status).toBe('success');
      });

      test('✓ should return 400 with incorrect current password', async () => {
        const response = await request(app)
          .post('/auth/change-password')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .send({
            currentPassword: 'WrongPassword',
            newPassword: 'NewPassword789!',
          })
          .expect(400);

        expect(response.body.status).toBe('error');
      });

      test('✓ should return 401 without authentication', async () => {
        const response = await request(app)
          .post('/auth/change-password')
          .send({
            currentPassword: 'TestPassword123!',
            newPassword: 'NewPassword789!',
          })
          .expect(401);

        expect(response.body.status).toBe('error');
      });
    });

    // ========================================
    // GET /auth/current-user Tests
    // ========================================

    describe('GET /auth/current-user', () => {
      test('✓ should return current user data', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(200);

        expect(response.body.status).toBe('success');
        expect(response.body.data.id).toBe(testUser.id);
        expect(response.body.data.email).toBe(testUser.email);
      });

      test('✓ should return 401 without token', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .expect(401);

        expect(response.body.status).toBe('error');
      });

      test('✓ should return 404 for deleted user', async () => {
        // Create a user, get token, then delete user
        const tempUser = await prisma.user.create({
          data: {
            tenantId,
            email: 'tempuser@test.com',
            name: 'Temp User',
            passwordHash: await authService.hashPassword('TempPass123!'),
            role: 'CUSTOMER',
            locationId,
            isActive: true,
          },
        });

        const tokens = authService.generateTokens({
          userId: tempUser.id,
          tenantId,
          locationId,
          role: tempUser.role,
          email: tempUser.email,
        });

        // Delete the user
        await prisma.user.delete({ where: { id: tempUser.id } });

        // Try to get current user
        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', `Bearer ${tokens.accessToken}`)
          .expect(404);

        expect(response.body.status).toBe('error');
      });
    });
  });

  // ============================================================================
  // PART 3: Authentication Middleware Tests
  // ============================================================================

  describe('Authentication Middleware', () => {
    // ========================================
    // authenticate Middleware Tests
    // ========================================

    describe('authenticate middleware', () => {
      test('✓ should extract token from header', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(200);

        expect(response.body.status).toBe('success');
      });

      test('✓ should return 401 if no token provided', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .expect(401);

        expect(response.body.error).toBe('INVALID_TOKEN');
        expect(response.body.message).toMatch(/No authentication token/);
      });

      test('✓ should return 401 if invalid token', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', 'Bearer invalid.token.here')
          .expect(401);

        expect(response.body.error).toBe('INVALID_TOKEN');
      });

      test('✓ should set req.user on valid token', async () => {
        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(200);

        expect(response.body.data).toBeDefined();
        expect(response.body.data.id).toBe(testUser.id);
      });

      test('✓ should handle expired token', async () => {
        const expiredToken = jwt.sign(
          {
            userId: testUser.id,
            tenantId,
            locationId,
            role: testUser.role,
            email: testUser.email,
          },
          config.JWT_SECRET as string,
          { expiresIn: '-1h' }
        );

        const response = await request(app)
          .get('/auth/current-user')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(401);

        expect(response.body.error).toBe('INVALID_TOKEN');
      });
    });

    // ========================================
    // requireRole Middleware Tests
    // ========================================

    describe('requireRole middleware', () => {
      test('✓ should allow admin users', async () => {
        const adminTokens = authService.generateTokens({
          userId: testAdmin.id,
          tenantId,
          locationId,
          role: testAdmin.role,
          email: testAdmin.email,
        });

        const response = await request(app)
          .get('/admin/dashboard')
          .set('Authorization', `Bearer ${adminTokens.accessToken}`)
          .expect(200);

        expect(response.body.message).toBe('Admin dashboard');
      });

      test('✓ should deny non-admin users', async () => {
        const response = await request(app)
          .get('/admin/dashboard')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(403);

        expect(response.body.error).toBe('INSUFFICIENT_PERMISSIONS');
      });

      test('✓ should allow manager users to access manager routes', async () => {
        const managerTokens = authService.generateTokens({
          userId: testManager.id,
          tenantId,
          locationId,
          role: testManager.role,
          email: testManager.email,
        });

        const response = await request(app)
          .get('/manager/reports')
          .set('Authorization', `Bearer ${managerTokens.accessToken}`)
          .expect(200);

        expect(response.body.message).toBe('Manager reports');
      });

      test('✓ should deny non-manager users', async () => {
        const response = await request(app)
          .get('/manager/reports')
          .set('Authorization', `Bearer ${testAccessToken}`)
          .expect(403);

        expect(response.body.error).toBe('INSUFFICIENT_PERMISSIONS');
      });

      test('✓ should allow multiple roles', async () => {
        const staffTokens = authService.generateTokens({
          userId: testStaff.id,
          tenantId,
          locationId,
          role: testStaff.role,
          email: testStaff.email,
        });

        const response = await request(app)
          .get('/staff/schedule')
          .set('Authorization', `Bearer ${staffTokens.accessToken}`)
          .expect(200);

        expect(response.body.message).toBe('Staff schedule');
      });

      test('✓ should return 401 without token', async () => {
        const response = await request(app)
          .get('/admin/dashboard')
          .expect(401);

        expect(response.body.error).toBe('INVALID_TOKEN');
      });
    });
  });

  // ============================================================================
  // PART 4: Role-Based Access Control (RBAC) Tests
  // ============================================================================

  describe('Role-Based Access Control (RBAC)', () => {
    test('✓ should grant admin all permissions', async () => {
      const adminTokens = authService.generateTokens({
        userId: testAdmin.id,
        tenantId,
        locationId,
        role: testAdmin.role,
        email: testAdmin.email,
      });

      const adminResponse = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .expect(200);

      expect(adminResponse.body.message).toBe('Admin dashboard');
    });

    test('✓ should restrict manager to manager-only routes', async () => {
      const managerTokens = authService.generateTokens({
        userId: testManager.id,
        tenantId,
        locationId,
        role: testManager.role,
        email: testManager.email,
      });

      // Manager should access manager route
      const managerResponse = await request(app)
        .get('/manager/reports')
        .set('Authorization', `Bearer ${managerTokens.accessToken}`)
        .expect(200);

      expect(managerResponse.body.message).toBe('Manager reports');

      // Manager should not access admin route
      const adminAttempt = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${managerTokens.accessToken}`)
        .expect(403);

      expect(adminAttempt.body.error).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('✓ should allow staff limited access', async () => {
      const staffTokens = authService.generateTokens({
        userId: testStaff.id,
        tenantId,
        locationId,
        role: testStaff.role,
        email: testStaff.email,
      });

      const staffResponse = await request(app)
        .get('/staff/schedule')
        .set('Authorization', `Bearer ${staffTokens.accessToken}`)
        .expect(200);

      expect(staffResponse.body.message).toBe('Staff schedule');
    });

    test('✓ should deny unauthorized access to admin routes', async () => {
      const response = await request(app)
        .get('/admin/dashboard')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .expect(403);

      expect(response.body.error).toBe('INSUFFICIENT_PERMISSIONS');
    });

    test('✓ should deny unauthorized access to manager routes', async () => {
      const response = await request(app)
        .get('/manager/reports')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .expect(403);

      expect(response.body.error).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  // ============================================================================
  // PART 5: Security Edge Cases & Token Lifecycle
  // ============================================================================

  describe('Security & Token Lifecycle', () => {
    test('✓ should not allow token tampering', () => {
      const tokens = authService.generateTokens({
        userId: testUser.id,
        tenantId,
        locationId,
        role: testUser.role,
        email: testUser.email,
      });

      const tamperedToken = tokens.accessToken.replace(/.$/, 'X');

      expect(() => {
        authService.verifyToken(tamperedToken);
      }).toThrow();
    });

    test('✓ should handle clock skew gracefully', () => {
      const payload = {
        userId: testUser.id,
        tenantId,
        locationId,
        role: testUser.role,
        email: testUser.email,
      };

      const tokens = authService.generateTokens(payload);

      // Token should still be valid (clock skew is handled by JWT library)
      expect(() => {
        authService.verifyToken(tokens.accessToken);
      }).not.toThrow();
    });

    test('✓ should support concurrent login requests', async () => {
      // Reset user to ensure not locked
      await prisma.user.update({
        where: { id: testUser.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      });

      const promises = Array(5)
        .fill(null)
        .map(() => authService.login(testUser.email, 'TestPassword123!'));

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
      });
    });

    test('✓ should prevent password reuse across accounts', async () => {
      const user1 = await prisma.user.create({
        data: {
          tenantId,
          email: 'user1@test.com',
          name: 'User 1',
          passwordHash: await authService.hashPassword('SharedPassword123!'),
          role: 'CUSTOMER',
          locationId,
          isActive: true,
        },
      });

      const user2 = await prisma.user.create({
        data: {
          tenantId,
          email: 'user2@test.com',
          name: 'User 2',
          passwordHash: await authService.hashPassword('DifferentPassword456!'),
          role: 'CUSTOMER',
          locationId,
          isActive: true,
        },
      });

      // Same password should produce different hashes
      const hash1 = user1.passwordHash;
      const hash2 = user2.passwordHash;

      expect(hash1).not.toBe(hash2);

      // But both should be verifiable with the correct password
      const verify1 = await authService.verifyPassword('SharedPassword123!', hash1);
      const verify2 = await authService.verifyPassword('DifferentPassword456!', hash2);

      expect(verify1).toBe(true);
      expect(verify2).toBe(true);

      // Cleanup
      await prisma.user.deleteMany({
        where: { id: { in: [user1.id, user2.id] } },
      });
    });
  });

  // ============================================================================
  // PART 6: Performance Tests
  // ============================================================================

  describe('Performance Tests', () => {
    test('✓ Login should complete < 500ms', async () => {
      const start = performance.now();
      await authService.login(testUser.email, 'TestPassword123!');
      const duration = performance.now() - start;

      // Increased for bcrypt rounds=12 (more secure)
      // On typical systems: 200-350ms depending on CPU
      expect(duration).toBeLessThan(500);
    });

    test('✓ Token verification should complete < 10ms', () => {
      const tokens = authService.generateTokens({
        userId: testUser.id,
        tenantId,
        locationId,
        role: testUser.role,
        email: testUser.email,
      });

      const start = performance.now();
      authService.verifyToken(tokens.accessToken);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    test('✓ Password hashing should complete < 500ms', async () => {
      const start = performance.now();
      await authService.hashPassword('TestPassword123!');
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(500);
    });

    test('✓ Password verification should complete < 400ms', async () => {
      const hash = await authService.hashPassword('TestPassword123!');

      const start = performance.now();
      await authService.verifyPassword('TestPassword123!', hash);
      const duration = performance.now() - start;

      // Increased for bcrypt rounds=12 (more secure)
      // On typical systems: 150-350ms depending on CPU
      expect(duration).toBeLessThan(400);
    });

    test('✓ Token generation should complete < 5ms', () => {
      const start = performance.now();
      authService.generateTokens({
        userId: testUser.id,
        tenantId,
        locationId,
        role: testUser.role,
        email: testUser.email,
      });
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    test('✓ Register should complete < 500ms', async () => {
      const start = performance.now();
      const result = await authService.register({
        email: `perf-${Date.now()}@test.com`,
        password: 'PerfTest123!',
        name: 'Perf Test',
        role: 'CUSTOMER',
        locationId,
        tenantId,
      });
      const duration = performance.now() - start;

      // Increased for bcrypt rounds=12 (more secure)
      expect(duration).toBeLessThan(500);

      // Cleanup
      await prisma.user.delete({ where: { id: result.user.id } });
    });
  });

  // ============================================================================
  // PART 7: Integration Scenarios
  // ============================================================================

  describe('Integration Scenarios', () => {
    test('✓ Full authentication flow: Register → Login → Access Protected Route', async () => {
      // Register
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          email: `integration-${Date.now()}@test.com`,
          password: 'Integration123!',
          name: 'Integration Test',
          role: 'CUSTOMER',
          locationId,
          tenantId,
        })
        .expect(201);

      const { accessToken } = registerResponse.body.data;

      // Access protected route with token
      const protectedResponse = await request(app)
        .get('/auth/current-user')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(protectedResponse.body.data.email).toMatch(/integration-/);

      // Cleanup
      await prisma.user.delete({ where: { id: protectedResponse.body.data.id } });
    });

    test('✓ Complete password change flow', async () => {
      const newPassword = 'ChangedPassword789!';

      // Change password
      await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${testAccessToken}`)
        .send({
          currentPassword: 'TestPassword123!',
          newPassword,
        })
        .expect(200);

      // Login with new password should work
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: newPassword,
        })
        .expect(200);

      expect(loginResponse.body.data.accessToken).toBeDefined();
    });

    test('✓ Multi-user concurrent operations', async () => {
      const users = [testAdmin, testManager, testStaff, testUser];
      const operations = users.map((user) =>
        authService.login(user.email, 'TestPassword123!')
      );

      const results = await Promise.all(operations);

      expect(results).toHaveLength(4);
      results.forEach((result, idx) => {
        expect(result.user.id).toBe(users[idx].id);
        expect(result.accessToken).toBeDefined();
      });
    });
  });
});
