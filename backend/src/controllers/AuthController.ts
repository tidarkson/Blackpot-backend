import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const authService = new AuthService();

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      
      return res.status(200).json({
        status: 'success',
        code: 200,
        data: result,
      });
    } catch (error: any) {
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
}