import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import { authLimiter, registrationLimiter, passwordResetLimiter } from '../middleware/rateLimiter';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { UserController } from '../controllers/UserController';

const router = express.Router();

// Rate limited routes
router.post('/register', registrationLimiter, AuthController.register);
router.post('/login', authLimiter, AuthController.login);
router.post('/forgot-password', passwordResetLimiter, AuthController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, AuthController.resetPassword);

// Standard auth routes
router.get('/me', authenticate, AuthController.getCurrentUser);
router.post('/logout', authenticate, AuthController.logout);
router.put('/password', authenticate, AuthController.changePassword);
router.get('/reset-password/:token', AuthController.verifyResetToken);

// Update Routes to Include Tenant Checks
router.get('/tenants/:tenantId/users', authenticate, ensureTenantAccess, UserController.getUsersByTenant);
export default router;
