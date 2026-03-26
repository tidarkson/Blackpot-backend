import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authLimiter, registrationLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { UserController } from '../controllers/UserController';

const router = express.Router();

/**
 * ✅ ACCEPTANCE CRITERIA: Authentication Endpoints with Rate Limiting
 * All sensitive authentication endpoints are protected with strict rate limits
 * Premium accounts have 3x higher limits
 */

/**
 * POST /api/auth/register
 * Rate Limit: 3 per hour per IP
 * Rationale: Prevent spam account creation
 * Premium: 9 per hour
 */
router.post('/register', registrationLimiter, AuthController.register);

/**
 * POST /api/auth/login
 * Rate Limit: 5 attempts per 15 minutes per IP
 * Rationale: Prevent brute force password guessing
 * Premium: 15 per 15 minutes
 * Skip on Success: Yes (successful logins don't count)
 */
router.post('/login', authLimiter, AuthController.login);

/**
 * POST /api/auth/refresh
 * Exchange valid refresh token for a new access token
 */
router.post('/refresh', AuthController.refreshToken);

/**
 * POST /api/auth/forgot-password
 * Rate Limit: 3 attempts per hour per IP
 * Rationale: Prevent email flooding/account takeover attempts
 * Premium: 9 per hour
 */
router.post('/forgot-password', passwordResetLimiter, AuthController.forgotPassword);

/**
 * POST /api/auth/reset-password
 * Rate Limit: 3 attempts per hour per token
 * Rationale: Prevent password reset token enumeration
 * Premium: 9 per hour
 * Skip on Success: Yes
 */
router.post('/reset-password', passwordResetLimiter, AuthController.resetPassword);

// Standard auth routes (no rate limiting - protected by previous limits)
/**
 * GET /api/auth/me
 * Get current authenticated user info
 * Requires: Valid JWT token
 */
router.get('/me', authenticate, AuthController.getCurrentUser);

/**
 * POST /api/auth/logout
 * Logout current user and invalidate session
 * Requires: Valid JWT token
 */
router.post('/logout', authenticate, AuthController.logout);

/**
 * PUT /api/auth/password
 * Change password for authenticated user
 * Requires: Valid JWT token
 */
router.put('/password', authenticate, AuthController.changePassword);

/**
 * GET /api/auth/reset-password/:token
 * Verify reset token validity
 * Public endpoint - no authentication required
 */
router.get('/reset-password/:token', AuthController.verifyResetToken);

/**
 * GET /api/auth/sessions
 * Get all active sessions for current user
 * Requires: Valid JWT token
 * Response: Array of sessions with login time, IP, and device info
 */
router.get('/sessions', authenticate, AuthController.getActiveSessions);

/**
 * DELETE /api/auth/sessions/:sessionId
 * Revoke a specific session (logout from specific device)
 * Requires: Valid JWT token
 * Params: sessionId - Session ID to revoke
 */
router.delete('/sessions/:sessionId', authenticate, AuthController.revokeSession);

/**
 * POST /api/auth/sessions/logout-all-other
 * Logout all other sessions for current user
 * Requires: Valid JWT token
 * Use case: User found unauthorized login, wants to secure account
 */
router.post('/sessions/logout-all-other', authenticate, AuthController.logoutAllOtherSessions);

export default router;
