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
}