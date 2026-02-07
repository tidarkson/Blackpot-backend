import { Response } from 'express';
import { UserService } from '../services/UserService';
import { AuthRequest } from '../types/auth';

const userService = new UserService();

export class UserController {
  /**
   * List all users for the current tenant (manager/owner only)
   */
  static async listUsers(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      // Check authorization (manager/owner only)
      if (!['MANAGER', 'OWNER'].includes(req.user.role)) {
        return res.status(403).json({ status: 'error', message: 'Insufficient permissions' });
      }

      const tenantId = req.user.tenantId;
      const users = await userService.getAllUsers(tenantId);
      return res.json({ status: 'success', data: users });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Get user details by ID
   */
  static async getUser(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      const userId = (req.params.id || req.params.userId) as string;
      const tenantId = req.user.tenantId;

      // Check authorization: user can view own profile or manager/owner can view any
      if (req.user.userId !== userId && !['MANAGER', 'OWNER'].includes(req.user.role)) {
        return res
          .status(403)
          .json({ status: 'error', message: 'Cannot access other users profile' });
      }

      const user = await userService.getUserById(userId, tenantId);
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ status: 'error', message: error.message });
      }
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Create new user (admin/owner only)
   */
  static async createUser(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      // Check authorization (owner only for user creation)
      if (req.user.role !== 'OWNER') {
        return res.status(403).json({ status: 'error', message: 'Only owners can create users' });
      }

      const tenantId = req.user.tenantId;
      const { email, name, password, role, locationId, phone, hourlyRate, hireDate } = req.body;

      // Validate required fields
      if (!email || !name || !password || !role) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Missing required fields: email, name, password, role' });
      }

      const user = await userService.createUser(tenantId, {
        email,
        name,
        password,
        role,
        locationId,
        phone,
        hourlyRate,
        hireDate: hireDate ? new Date(hireDate) : undefined,
      });

      return res.status(201).json({ status: 'success', data: user });
    } catch (error: any) {
      if (error.message.includes('Invalid email')) {
        return res.status(400).json({ status: 'error', message: error.message });
      }
      if (error.message.includes('Password')) {
        return res.status(400).json({ status: 'error', message: error.message });
      }
      if (error.message.includes('already exists')) {
        return res.status(409).json({ status: 'error', message: error.message });
      }
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Update user
   * Users can update own profile, admins can update any user
   */
  static async updateUser(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      const userId = (req.params.id || req.params.userId) as string;
      const tenantId = req.user.tenantId;

      // Check authorization
      if (req.user.userId !== userId && req.user.role !== 'OWNER') {
        return res
          .status(403)
          .json({ status: 'error', message: 'Can only update your own profile' });
      }

      const { name, role, isActive, phone, hourlyRate, hireDate } = req.body;

      const user = await userService.updateUser(
        userId,
        {
          name,
          role,
          isActive,
          phone,
          hourlyRate,
          hireDate: hireDate ? new Date(hireDate) : undefined,
        },
        tenantId
      );

      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ status: 'error', message: error.message });
      }
      if (error.message.includes('Cannot update')) {
        return res.status(400).json({ status: 'error', message: error.message });
      }
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Deactivate user (admin/owner only)
   */
  static async deactivateUser(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      // Check authorization
      if (!['OWNER'].includes(req.user.role)) {
        return res
          .status(403)
          .json({ status: 'error', message: 'Only owners can deactivate users' });
      }

      const userId = (req.params.id || req.params.userId) as string;
      const tenantId = req.user.tenantId;

      const user = await userService.deactivateUser(userId, tenantId);
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }
      if (error.message.includes('Access denied')) {
        return res.status(403).json({ status: 'error', message: error.message });
      }
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Change password
   */
  static async changePassword(req: AuthRequest, res: Response) {
    try {
      // Check authentication
      if (!req.user) {
        return res.status(401).json({ status: 'error', message: 'Not authenticated' });
      }

      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ status: 'error', message: 'Missing required fields' });
      }

      await userService.changePassword(req.user.userId, currentPassword, newPassword);
      return res.json({ status: 'success', message: 'Password changed successfully' });
    } catch (error: any) {
      if (error.message.includes('incorrect')) {
        return res.status(401).json({ status: 'error', message: error.message });
      }
      if (error.message.includes('Password')) {
        return res.status(400).json({ status: 'error', message: error.message });
      }
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * Get all users by tenant (kept for backwards compatibility)
   */
  static async getUsersByTenant(req: AuthRequest, res: Response) {
    return UserController.listUsers(req, res);
  }
}
