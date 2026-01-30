import { Request, Response } from 'express';
import { UserService } from '../services/UserService';

const userService = new UserService();

export class UserController {
  static async listUsers(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;
      const users = await userService.getAllUsers(tenantId);
      return res.json({ status: 'success', data: users });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  static async getUser(req: Request, res: Response) {
    try {
      const user = await userService.getUserById(req.params.userId as string);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  static async createUser(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;
      const user = await userService.createUser(tenantId, req.body);
      return res.status(201).json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const user = await userService.updateUser(req.params.userId as string, req.body);
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  static async getUsersByTenant(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;
      const users = await userService.getAllUsers(tenantId);
      return res.json({ status: 'success', data: users });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }
}
