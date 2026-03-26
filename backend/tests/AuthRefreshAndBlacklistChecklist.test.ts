import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { AuthController } from '../src/controllers/AuthController';
import { authenticate } from '../src/middleware/auth';
import { AuthService } from '../src/services/AuthService';
import { TokenBlacklistService } from '../src/services/TokenBlacklistService';
import { config } from '../src/config/environment';

describe('Auth Refresh + Blacklist Checklist', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const accessToken = 'access-token-1';
  const refreshToken1 = 'refresh-token-1';
  const refreshToken2 = 'refresh-token-2';
  const refreshTokenExpired = 'refresh-token-expired';

  const state = {
    blacklistedAccess: new Set<string>(),
    revokedRefresh: new Set<string>(),
  };

  const userPayload = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    locationId: 'loc-1',
    role: 'STAFF' as any,
    email: 'user@test.com',
  };

  let app: express.Express;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    state.blacklistedAccess.clear();
    state.revokedRefresh.clear();

    jest.spyOn(AuthService.prototype, 'login').mockResolvedValue({
      accessToken,
      refreshToken: refreshToken1,
      user: {
        id: 'user-1',
        email: 'user@test.com',
        name: 'User',
        role: 'STAFF' as any,
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      },
    });

    jest.spyOn(AuthService.prototype, 'verifyToken').mockImplementation((token: string) => {
      if (token === accessToken) {
        return userPayload as any;
      }
      throw new Error('Invalid token');
    });

    jest.spyOn(AuthService.prototype, 'getTokenRemainingLifetime').mockImplementation((token: string) => {
      if (token === accessToken) return 900;
      if (token === refreshToken1 || token === refreshToken2) return 86400;
      return 0;
    });

    jest.spyOn(AuthService.prototype, 'refreshAccessToken').mockImplementation(async (token: string) => {
      if (token === refreshTokenExpired) {
        throw new Error('Refresh token has expired');
      }

      return {
        accessToken: `new-access-for-${token}`,
        refreshToken: token === refreshToken1 ? refreshToken2 : `rotated-${token}`,
        rememberMe: true,
      };
    });

    jest
      .spyOn(TokenBlacklistService.prototype, 'blacklistToken')
      .mockImplementation(async (token: string) => {
        state.blacklistedAccess.add(token);
      });

    jest
      .spyOn(TokenBlacklistService.prototype, 'isBlacklisted')
      .mockImplementation(async (token: string) => state.blacklistedAccess.has(token));

    jest
      .spyOn(TokenBlacklistService.prototype, 'revokeRefreshToken')
      .mockImplementation(async (token: string) => {
        state.revokedRefresh.add(token);
      });

    jest
      .spyOn(TokenBlacklistService.prototype, 'isRefreshTokenRevoked')
      .mockImplementation(async (token: string) => state.revokedRefresh.has(token));

    app = express();
    app.use(express.json());

    app.post('/auth/login', AuthController.login);
    app.post('/auth/refresh', AuthController.refreshToken);
    app.post('/auth/logout', authenticate, AuthController.logout);
    app.get('/auth/protected', authenticate, (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('POST /auth/refresh with valid refresh token -> 200 + new accessToken', async () => {
    const response = await request(app)
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken1}`])
      .expect(200);

    expect(response.body.status).toBe('success');
    expect(response.body.data.accessToken).toBe(`new-access-for-${refreshToken1}`);
  });

  test('POST /auth/refresh with expired token -> 401', async () => {
    const response = await request(app)
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshTokenExpired}`])
      .expect(401);

    expect(response.body.status).toBe('error');
    expect(response.body.error).toBe('INVALID_REFRESH_TOKEN');
  });

  test('Login, logout, use same token -> 401 (token blacklisted)', async () => {
    const loginResponse = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'Password123!' })
      .expect(200);

    expect(loginResponse.body.data.accessToken).toBe(accessToken);

    await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const protectedResponse = await request(app)
      .get('/auth/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(protectedResponse.body.error).toBe('INVALID_TOKEN');
  });

  test('Login with remember_me -> cookie maxAge is 30 days', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'Password123!', remember_me: true })
      .expect(200);

    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const refreshCookie = cookieList.find((cookie: string) => cookie.startsWith('refreshToken='));
    expect(refreshCookie).toContain('Max-Age=2592000');
  });

  test('Cookie flags include httpOnly + secure in production', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'user@test.com', password: 'Password123!' })
      .expect(200);

    const setCookieHeader = response.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const cookieList = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    const refreshCookie = cookieList.find((cookie: string) => cookie.startsWith('refreshToken='));
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('Secure');
  });

  test('Refresh token rotation -> second call with old refresh token fails', async () => {
    const firstRefresh = await request(app)
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken1}`])
      .expect(200);

    expect(firstRefresh.body.data.accessToken).toBe(`new-access-for-${refreshToken1}`);

    const secondWithOldToken = await request(app)
      .post('/auth/refresh')
      .set('Cookie', [`refreshToken=${refreshToken1}`])
      .expect(401);

    expect(secondWithOldToken.body.error).toBe('INVALID_REFRESH_TOKEN');
  });
});
