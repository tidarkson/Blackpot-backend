import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { PasswordResetService } from '../services/PasswordResetService';
import { EmailService } from '../services/EmailService';

const passwordResetService = new PasswordResetService();
const emailService = new EmailService();
const authService = new AuthService();

export class AuthController {
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

  static async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      await authService.changePassword(userId, currentPassword, newPassword);

      return res.status(200).json({
        status: 'success',
        code: 200,
        message: 'Password updated successfully',
      });
    } catch (error: any) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        error: 'PASSWORD_UPDATE_FAILED',
        message: error.message,
      });
    }
  }

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
      const token = req.params.token as string;

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
}
