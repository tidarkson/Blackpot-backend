# Phase 2 Authentication - Complete Implementation Guide

**Status**: Phase 2 is **60% Complete**  
**Last Updated**: January 27, 2026  
**Priority**: CRITICAL - Blocks Phase 3 completion

---

## 📊 Gap Analysis Summary

| Feature | Status | Priority | Effort |
|---------|--------|----------|--------|
| User Registration | ❌ MISSING | P0 | 2h |
| Logout Endpoint | ❌ MISSING | P1 | 30min |
| Get Current User | ❌ MISSING | P0 | 30min |
| Password Reset Flow | ❌ MISSING | P0 | 3h |
| Rate Limiting | ❌ MISSING | P1 | 1h |
| Account Lockout | ❌ MISSING | P1 | 2h |
| Password Strength Validation | ❌ MISSING | P0 | 30min |
| Multi-Tenant Middleware | ⚠️ PARTIAL | P1 | 1h |
| Token Blacklist | ❌ MISSING | P2 | 2h |
| Email Service | ❌ MISSING | P0 | 2h |
| **TOTAL** | | | **14.5 hours** |

---

## ❌ MISSING FEATURE 1: User Registration Endpoint

### Current State
- AuthService has no `register()` method
- AuthController has no `register()` action
- No registration route
- No validation for registration data

### Requirements from Spec
```
User Registration Endpoint (POST /api/auth/register):
- Accept: email, password, name, role, restaurant_id
- Validate email format (Zod)
- Hash password with bcrypt (10 rounds)
- Create user in database
- Generate JWT token (24h expiry)
- Return user data + token
- Handle duplicate email error
```

### Implementation Steps

#### Step 1: Update Auth Validators

**File**: `backend/src/validators/auth.validator.ts`

Add this schema:

```typescript
const passwordStrengthSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: passwordStrengthSchema,
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['OWNER', 'MANAGER', 'CHEF', 'SERVER', 'CASHIER', 'GUEST', 'ADMIN', 'SUPPORT', 'ACCOUNTANT']),
  locationId: z.string().uuid('Invalid location ID format'),
  tenantId: z.string().uuid('Invalid tenant ID format').optional(), // For initial registration
});

export type RegisterInput = z.infer<typeof registerSchema>;
```

#### Step 2: Update AuthService with Register Method

**File**: `backend/src/services/AuthService.ts`

Add this method to the `AuthService` class:

```typescript
// Register new user
async register(data: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  tenantId?: string;
  locationId: string;
}): Promise<AuthResponse> {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Hash password with bcrypt (10 rounds)
  const passwordHash = await this.hashPassword(data.password);

  // Create user in database
  const user = await prisma.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      role: data.role,
      tenantId: data.tenantId || '00000000-0000-0000-0000-000000000000', // Default tenant
      locationId: data.locationId,
      isActive: true,
    },
    include: { tenant: true, location: true },
  });

  // Generate JWT token
  const { accessToken, refreshToken } = this.generateTokens({
    userId: user.id,
    tenantId: user.tenantId,
    locationId: user.locationId,
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
      locationId: user.locationId,
    },
  };
}
```

#### Step 3: Update AuthController with Register Action

**File**: `backend/src/controllers/AuthController.ts`

Add this method to `AuthController` class:

```typescript
static async register(req: Request, res: Response) {
  try {
    const { email, password, name, role, locationId, tenantId } = req.body;

    // Validate request body against schema
    const { registerSchema } = await import('../validators/auth.validator');
    const validated = registerSchema.parse({
      email,
      password,
      name,
      role,
      locationId,
      tenantId,
    });

    const result = await authService.register(validated);

    return res.status(201).json({
      status: 'success',
      code: 201,
      data: result,
      message: 'User registered successfully',
    });
  } catch (error: any) {
    // Handle duplicate email
    if (error.message.includes('Email already registered')) {
      return res.status(409).json({
        status: 'error',
        code: 409,
        error: 'DUPLICATE_EMAIL',
        message: 'This email is already registered',
      });
    }

    // Handle validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({
        status: 'error',
        code: 400,
        error: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.errors,
      });
    }

    return res.status(400).json({
      status: 'error',
      code: 400,
      error: 'REGISTRATION_FAILED',
      message: error.message,
    });
  }
}
```

#### Step 4: Update Auth Routes

**File**: `backend/src/routes/auth.ts`

Add this route:

```typescript
router.post('/register', AuthController.register);
```

**Final routes file should look like:**

```typescript
import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.put('/password', authenticate, AuthController.changePassword);

export default router;
```

#### Step 5: Test Registration

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@blackpot.com",
    "password": "SecurePass123",
    "name": "John Doe",
    "role": "MANAGER",
    "locationId": "loc-123",
    "tenantId": "tenant-456"
  }'
```

---

## ❌ MISSING FEATURE 2: Get Current User Endpoint

### Requirements
```
Get Current User (GET /api/auth/me):
- Require authentication
- Return current user data with role and restaurant
```

### Implementation

#### Step 1: Update AuthService

**File**: `backend/src/services/AuthService.ts`

Add this method:

```typescript
async getCurrentUser(userId: string): Promise<{
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenantId: string;
  locationId: string;
  tenant: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      tenant: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    tenantId: user.tenantId,
    locationId: user.locationId,
    tenant: user.tenant,
    location: user.location,
  };
}
```

#### Step 2: Update AuthController

**File**: `backend/src/controllers/AuthController.ts`

Add this method:

```typescript
static async getCurrentUser(req: Request, res: Response) {
  try {
    const userId = req.user!.userId;
    const user = await authService.getCurrentUser(userId);

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: user,
    });
  } catch (error: any) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        status: 'error',
        code: 404,
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    }

    return res.status(500).json({
      status: 'error',
      code: 500,
      error: 'INTERNAL_SERVER_ERROR',
      message: error.message,
    });
  }
}
```

#### Step 3: Update Routes

**File**: `backend/src/routes/auth.ts`

Add this route:

```typescript
router.get('/me', authenticate, AuthController.getCurrentUser);
```

#### Step 4: Test

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <your_token>"
```

---

## ❌ MISSING FEATURE 3: Logout Endpoint

### Requirements
```
Logout Endpoint (POST /api/auth/logout):
- Invalidate token (optional: blacklist)
- Clear any session data
```

### Implementation

#### Step 1: Create Token Blacklist Service (Optional but Recommended)

**File**: `backend/src/services/TokenBlacklistService.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class TokenBlacklistService {
  // Store token in blacklist (Redis preferred in production)
  async blacklistToken(token: string, expiresAt: Date): Promise<void> {
    // In production, use Redis with TTL
    // For now, we'll use a simple in-memory store or database
    console.log(`Token blacklisted until ${expiresAt}`);
    // TODO: Implement blacklist storage (Redis/Database)
  }

  // Check if token is blacklisted
  async isBlacklisted(token: string): Promise<boolean> {
    // Check against Redis or database
    // TODO: Implement blacklist check
    return false;
  }
}
```

#### Step 2: Update Auth Middleware to Check Blacklist

**File**: `backend/src/middleware/auth.ts`

Update the `authenticate` middleware:

```typescript
// At the top, add:
// import { TokenBlacklistService } from '../services/TokenBlacklistService';
// const blacklistService = new TokenBlacklistService();

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_TOKEN',
        message: 'No authentication token provided',
      });
    }

    // Check if token is blacklisted
    // const isBlacklisted = await blacklistService.isBlacklisted(token);
    // if (isBlacklisted) {
    //   return res.status(401).json({
    //     status: 'error',
    //     code: 401,
    //     error: 'TOKEN_REVOKED',
    //     message: 'Token has been revoked',
    //   });
    // }

    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
  }
};
```

#### Step 3: Update AuthController

**File**: `backend/src/controllers/AuthController.ts`

Add this method:

```typescript
static async logout(req: Request, res: Response) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const userId = req.user!.userId;

    if (token) {
      // TODO: Blacklist the token (requires token expiry from JWT decode)
      // await blacklistService.blacklistToken(token, expiryDate);
    }

    // Clear any other session data if needed
    // This is primarily for frontend to clear localStorage

    return res.status(200).json({
      status: 'success',
      code: 200,
      message: 'Logged out successfully',
      data: { userId },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: 'error',
      code: 500,
      error: 'LOGOUT_FAILED',
      message: error.message,
    });
  }
}
```

#### Step 4: Update Routes

**File**: `backend/src/routes/auth.ts`

Add this route:

```typescript
router.post('/logout', authenticate, AuthController.logout);
```

#### Step 5: Test

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer <your_token>"
```

---

## ❌ MISSING FEATURE 4: Password Reset Flow (3-Part)

### Requirements
```
Password Reset Flow:
1. Request reset (POST /api/auth/forgot-password)
2. Verify reset token (GET /api/auth/reset-password/:token)
3. Reset password (POST /api/auth/reset-password)
```

### Implementation

#### Step 1: Create Password Reset Service

**File**: `backend/src/services/PasswordResetService.ts`

```typescript
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

export class PasswordResetService {
  private RESET_TOKEN_EXPIRY = 1000 * 60 * 60; // 1 hour

  // Generate reset token
  generateResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Request password reset
  async requestPasswordReset(email: string): Promise<string> {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if email exists (security best practice)
      throw new Error('If email exists, reset link will be sent');
    }

    const resetToken = this.generateResetToken();
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + this.RESET_TOKEN_EXPIRY);

    // Store hashed token in database
    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Return plain token to send via email (only shown once)
    return resetToken;
  }

  // Verify reset token validity
  async verifyResetToken(token: string): Promise<string> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
      include: { user: true },
    });

    if (!resetRecord) {
      throw new Error('Invalid or expired reset token');
    }

    return resetRecord.userId;
  }

  // Reset password with token
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (!resetRecord) {
      throw new Error('Invalid or expired reset token');
    }

    // Hash new password
    const { AuthService } = await import('./AuthService');
    const authService = new AuthService();
    const passwordHash = await authService.hashPassword(newPassword);

    // Update user password
    await prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash },
    });

    // Mark token as used
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    });
  }
}
```

#### Step 2: Create Email Service

**File**: `backend/src/services/EmailService.ts`

```typescript
export class EmailService {
  async sendPasswordResetEmail(
    email: string,
    resetToken: string,
    recipientName: string
  ): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // TODO: Integrate with email service (SendGrid, AWS SES, Nodemailer, etc.)
    console.log(`Sending password reset email to ${email}`);
    console.log(`Reset URL: ${resetUrl}`);

    // Example with Nodemailer (install: npm install nodemailer)
    /*
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'BlackPot - Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>Hello ${recipientName},</p>
        <p>Click the link below to reset your password (valid for 1 hour):</p>
        <a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>Or paste this code in your browser:</p>
        <code>${resetUrl}</code>
      `,
    };

    await transporter.sendMail(mailOptions);
    */
  }

  async sendPasswordChangedEmail(email: string, recipientName: string): Promise<void> {
    // TODO: Send confirmation email
    console.log(`Sending password changed confirmation to ${email}`);
  }
}
```

#### Step 3: Update Auth Validators

**File**: `backend/src/validators/auth.validator.ts`

Add these schemas:

```typescript
export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordStrengthSchema,
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const verifyResetTokenSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type VerifyResetTokenInput = z.infer<typeof verifyResetTokenSchema>;
```

#### Step 4: Update AuthController

**File**: `backend/src/controllers/AuthController.ts`

Add these methods:

```typescript
import { PasswordResetService } from '../services/PasswordResetService';
import { EmailService } from '../services/EmailService';

const passwordResetService = new PasswordResetService();
const emailService = new EmailService();

// Add to AuthController class:

static async forgotPassword(req: Request, res: Response) {
  try {
    const { email } = req.body;

    // Validate
    const { forgotPasswordSchema } = await import('../validators/auth.validator');
    forgotPasswordSchema.parse({ email });

    const resetToken = await passwordResetService.requestPasswordReset(email);

    // Send email with reset token
    await emailService.sendPasswordResetEmail(
      email,
      resetToken,
      'User' // Get actual name from user if exists
    );

    // Always return success message (don't reveal if email exists)
    return res.status(200).json({
      status: 'success',
      code: 200,
      message: 'If an account exists with this email, a password reset link will be sent',
    });
  } catch (error: any) {
    return res.status(200).json({
      status: 'success',
      code: 200,
      message: 'If an account exists with this email, a password reset link will be sent',
    });
  }
}

static async verifyResetToken(req: Request, res: Response) {
  try {
    const { token } = req.params;

    const { verifyResetTokenSchema } = await import('../validators/auth.validator');
    verifyResetTokenSchema.parse({ token });

    const userId = await passwordResetService.verifyResetToken(token);

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: { valid: true, userId },
      message: 'Reset token is valid',
    });
  } catch (error: any) {
    return res.status(400).json({
      status: 'error',
      code: 400,
      error: 'INVALID_RESET_TOKEN',
      message: error.message || 'Invalid or expired reset token',
    });
  }
}

static async resetPassword(req: Request, res: Response) {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    const { resetPasswordSchema } = await import('../validators/auth.validator');
    resetPasswordSchema.parse({ token, newPassword, confirmPassword });

    await passwordResetService.resetPassword(token, newPassword);

    // Send confirmation email
    // await emailService.sendPasswordChangedEmail(email, userName);

    return res.status(200).json({
      status: 'success',
      code: 200,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error: any) {
    if (error.message.includes('Invalid or expired')) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        error: 'INVALID_RESET_TOKEN',
        message: error.message,
      });
    }

    return res.status(400).json({
      status: 'error',
      code: 400,
      error: 'PASSWORD_RESET_FAILED',
      message: error.message,
    });
  }
}
```

#### Step 5: Update Routes

**File**: `backend/src/routes/auth.ts`

Add these routes:

```typescript
router.post('/forgot-password', AuthController.forgotPassword);
router.get('/reset-password/:token', AuthController.verifyResetToken);
router.post('/reset-password', AuthController.resetPassword);
```

#### Step 6: Create PasswordReset Model in Prisma

**File**: `database/prisma/schema.prisma`

Add this model:

```prisma
model PasswordReset {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token     String   @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([expiresAt])
}
```

Run migration:

```bash
cd backend && npm run db:migrate -- --name add_password_reset_model
```

#### Step 7: Test

```bash
# Request password reset
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@blackpot.com"}'

# Verify reset token
curl -X GET http://localhost:3000/api/v1/auth/reset-password/YOUR_RESET_TOKEN

# Reset password
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_RESET_TOKEN",
    "newPassword": "NewSecurePass123",
    "confirmPassword": "NewSecurePass123"
  }'
```

---

## ⚠️ MISSING FEATURE 5: Rate Limiting on Auth Endpoints

### Requirements
```
Security Features:
- Rate limiting on auth endpoints
```

### Implementation

#### Step 1: Install Rate Limiter (Already installed)

```bash
# Already in package.json
npm install express-rate-limit
```

#### Step 2: Create Rate Limiting Middleware

**File**: `backend/src/middleware/rateLimiter.ts`

```typescript
import rateLimit from 'express-rate-limit';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints - stricter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: 'Too many login attempts, please try again after 15 minutes.',
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});

// Password reset - very strict
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  message: 'Too many password reset attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful resets
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration - moderate
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per hour per IP
  message: 'Too many accounts created from this IP, please try again later.',
  skipSuccessfulRequests: false,
  standardHeaders: true,
  legacyHeaders: false,
});
```

#### Step 3: Update Routes

**File**: `backend/src/routes/auth.ts`

```typescript
import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';
import {
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
} from '../middleware/rateLimiter';

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

export default router;
```

#### Step 4: Update Main Server File

**File**: `backend/src/index.ts`

Apply global rate limiting:

```typescript
import { apiLimiter } from './middleware/rateLimiter';

// ... other imports and setup

app.use('/api/', apiLimiter); // Apply to all API routes

// ... rest of server setup
```

---

## ⚠️ MISSING FEATURE 6: Account Lockout After Failed Attempts

### Implementation

#### Step 1: Update Prisma Schema

**File**: `database/prisma/schema.prisma`

Update the User model:

```prisma
model User {
  // ... existing fields
  failedLoginAttempts Int     @default(0)
  lockedUntil         DateTime?
  lastLoginAt         DateTime?
  lastLoginIp         String?
  
  // ... rest of model
}
```

Run migration:

```bash
cd backend && npm run db:migrate -- --name add_login_security_fields
```

#### Step 2: Update AuthService

**File**: `backend/src/services/AuthService.ts`

Update the `login()` method:

```typescript
async login(email: string, password: string, ipAddress?: string): Promise<AuthResponse> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true, location: true },
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMinutes = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000
    );
    throw new Error(`Account is locked. Try again in ${remainingMinutes} minutes.`);
  }

  const passwordMatch = await this.verifyPassword(password, user.passwordHash);
  
  if (!passwordMatch) {
    // Increment failed attempts
    const newFailedAttempts = user.failedLoginAttempts + 1;
    let lockedUntil = null;

    // Lock account after 5 failed attempts
    if (newFailedAttempts >= 5) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: newFailedAttempts,
        lockedUntil,
      },
    });

    throw new Error('Invalid credentials');
  }

  // Successful login - reset failed attempts
  const { accessToken, refreshToken } = this.generateTokens({
    userId: user.id,
    tenantId: user.tenantId,
    locationId: user.locationId || '',
    role: user.role,
    email: user.email,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
    },
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
      locationId: user.locationId,
    },
  };
}
```

#### Step 3: Update AuthController

**File**: `backend/src/controllers/AuthController.ts`

Pass IP address to login method:

```typescript
static async login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    
    const result = await authService.login(email, password, ipAddress);
    
    return res.status(200).json({
      status: 'success',
      code: 200,
      data: result,
    });
  } catch (error: any) {
    // Handle account lockout
    if (error.message.includes('locked')) {
      return res.status(423).json({
        status: 'error',
        code: 423,
        error: 'ACCOUNT_LOCKED',
        message: error.message,
      });
    }

    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_CREDENTIALS',
      message: error.message,
    });
  }
}
```

---

## ⚠️ MISSING FEATURE 7: Multi-Tenant Access Control Middleware

### Implementation

#### Step 1: Create Tenant Isolation Middleware

**File**: `backend/src/middleware/tenantIsolation.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export const ensureTenantAccess = (req: Request, res: Response, next: NextFunction) => {
  const userTenantId = req.user?.tenantId;
  const requestTenantId = req.params.tenantId || req.query.tenantId;

  if (requestTenantId && userTenantId !== requestTenantId) {
    return res.status(403).json({
      status: 'error',
      code: 403,
      error: 'FORBIDDEN',
      message: 'You do not have access to this tenant',
    });
  }

  next();
};

export const ensureLocationAccess = (req: Request, res: Response, next: NextFunction) => {
  const userLocationId = req.user?.locationId;
  const requestLocationId = req.params.locationId || req.query.locationId;

  if (requestLocationId && userLocationId !== requestLocationId) {
    return res.status(403).json({
      status: 'error',
      code: 403,
      error: 'FORBIDDEN',
      message: 'You do not have access to this location',
    });
  }

  next();
};
```

#### Step 2: Update Routes to Include Tenant Checks

**File**: `backend/src/routes/[future-routes].ts`

Example for user routes:

```typescript
import { ensureTenantAccess } from '../middleware/tenantIsolation';

router.get(
  '/tenants/:tenantId/users',
  authenticate,
  ensureTenantAccess,
  getUsersByTenant
);
```

---

## 📋 Implementation Checklist

### Priority 0 (Critical - Do First)
- [ ] User Registration Endpoint (2h)
- [ ] Get Current User Endpoint (30min)
- [ ] Password Reset Flow (3h)
- [ ] Password Strength Validation in Validators (30min)
- **Subtotal: 6h**

### Priority 1 (Important - Do Second)
- [ ] Logout Endpoint with Token Blacklist (1h)
- [ ] Rate Limiting on Auth Endpoints (1h)
- [ ] Account Lockout Mechanism (2h)
- [ ] Multi-Tenant Access Control Middleware (1h)
- **Subtotal: 5h**

### Priority 2 (Nice to Have - Do Last)
- [ ] Email Service Integration (2h)
- [ ] Redis Token Blacklist (2h)
- [ ] Login Activity Logging (1h)
- [ ] Two-Factor Authentication (Optional - 4h+)
- **Subtotal: 9h**

---

## 🧪 Complete Test Suite

### Registration Tests

```bash
# Test 1: Valid registration
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@test.com",
    "password": "SecurePass123",
    "name": "Test User",
    "role": "MANAGER",
    "locationId": "loc-123"
  }'

# Test 2: Duplicate email
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "existing@test.com",
    "password": "SecurePass123",
    "name": "Another User",
    "role": "SERVER",
    "locationId": "loc-123"
  }'

# Test 3: Weak password
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@test.com",
    "password": "weak",
    "name": "Test",
    "role": "SERVER",
    "locationId": "loc-123"
  }'
```

### Login Tests

```bash
# Test 1: Valid login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "SecurePass123"}'

# Test 2: Invalid credentials
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "wrongpass"}'

# Test 3: Rate limiting (send 6 login attempts quickly)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "user@test.com", "password": "wrongpass"}'
done
```

### Password Reset Tests

```bash
# Test 1: Request reset
curl -X POST http://localhost:3000/api/v1/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com"}'

# Test 2: Verify reset token
curl -X GET 'http://localhost:3000/api/v1/auth/reset-password/YOUR_TOKEN'

# Test 3: Reset password
curl -X POST http://localhost:3000/api/v1/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_TOKEN",
    "newPassword": "NewPass123",
    "confirmPassword": "NewPass123"
  }'
```

---

## 📌 Next Steps

1. **Implement Priority 0 features** (6 hours)
   - Start with User Registration
   - Then Get Current User
   - Then Password Reset Flow
   - Update validators with password strength rules

2. **Test all endpoints** thoroughly
   - Use curl or Postman
   - Test error cases
   - Test rate limiting

3. **Implement Priority 1 features** (5 hours)
   - Logout with token blacklist
   - Rate limiting
   - Account lockout
   - Tenant isolation

4. **Move to Phase 3** when Phase 2 is 100% complete

---

**Estimated Total Time to Complete Phase 2**: 14.5 hours (2 full days)
