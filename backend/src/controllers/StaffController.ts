import { Request, Response } from 'express';
import { staffService } from '../services/StaffService';
import { createStaffSchema, updateStaffSchema, updateAvailabilitySchema, listStaffFiltersSchema } from '../validators/staff.validator';

/**
 * StaffController
 * 
 * Handles all staff management endpoints
 * - CRUD operations for staff
 * - Availability management
 * - Staff metrics and performance
 */
export class StaffController {
  /**
   * POST /api/staff
   * Create a new staff member
   */
  async createStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;

      // Validate request body
      const data = createStaffSchema.parse(req.body);

      const staff = await staffService.createStaffMember(tenantId, data);

      res.status(201).json({
        status: 'success',
        data: staff,
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Failed to create staff',
      });
    }
  }

  /**
   * GET /api/staff
   * Get all staff members
   */
  async getAllStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;

      // Parse and validate filters
      const filters = listStaffFiltersSchema.parse(req.query);

      const staff = await staffService.getAllStaff(tenantId, filters);

      res.json({
        status: 'success',
        data: staff,
        total: staff.length,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to fetch staff',
      });
    }
  }

  /**
   * GET /api/staff/:staffId
   * Get staff details
   */
  async getStaffById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const staff = await staffService.getStaffById(staffId, tenantId);

      res.json({
        status: 'success',
        data: staff,
      });
    } catch (error: any) {
      res.status(error.message.includes('not found') ? 404 : 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * PUT /api/staff/:staffId
   * Update staff member
   */
  async updateStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      // Validate request body
      const data = updateStaffSchema.parse(req.body);

      const staff = await staffService.updateStaff(staffId, tenantId, data);

      res.json({
        status: 'success',
        data: staff,
        message: 'Staff member updated successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * DELETE /api/staff/:staffId
   * Deactivate staff member
   */
  async deleteStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const staff = await staffService.deactivateStaff(staffId, tenantId);

      res.json({
        status: 'success',
        data: staff,
        message: 'Staff member deactivated',
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * POST /api/staff/:staffId/reactivate
   * Reactivate a staff member
   */
  async reactivateStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const staff = await staffService.reactivateStaff(staffId, tenantId);

      res.json({
        status: 'success',
        data: staff,
        message: 'Staff member reactivated',
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/staff/:staffId/availability
   * Get staff availability
   */
  async getAvailability(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const availability = await staffService.getAvailability(staffId, tenantId);

      res.json({
        status: 'success',
        data: availability,
      });
    } catch (error: any) {
      res.status(error.message.includes('not found') ? 404 : 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * PUT /api/staff/:staffId/availability
   * Update staff availability
   */
  async updateAvailability(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      // Validate request body
      const data = updateAvailabilitySchema.parse(req.body);

      const staff = await staffService.updateAvailability(staffId, tenantId, data.availability);

      res.json({
        status: 'success',
        data: staff,
        message: 'Availability updated successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * POST /api/staff/bulk
   * Bulk staff operations
   */
  async bulkUpdateStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffIds, action, metadata } = req.body as { staffIds: string[]; action: string; metadata?: any };

      if (!staffIds || !Array.isArray(staffIds) || !action) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields: staffIds, action',
        });
        return;
      }

      const result = await staffService.bulkUpdateStaff(tenantId, staffIds, action, metadata);

      res.json({
        status: 'success',
        data: result,
        message: `Bulk action '${action}' completed`,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  /**
   * GET /api/staff/:staffId/metrics
   * Get staff performance metrics
   */
  async getStaffMetrics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

      if (!startDate || !endDate) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required query parameters: startDate, endDate',
        });
        return;
      }

      const metrics = await staffService.getStaffMetrics(
        staffId,
        tenantId,
        new Date(startDate),
        new Date(endDate)
      );

      res.json({
        status: 'success',
        data: metrics,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async clockIn(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const result = await staffService.clockInStaff(staffId, tenantId);

      res.status(201).json({
        status: 'success',
        data: result,
        message: 'Clocked in successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async clockOut(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const result = await staffService.clockOutStaff(staffId, tenantId);

      res.json({
        status: 'success',
        data: result,
        message: 'Clocked out successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async startBreak(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const result = await staffService.startBreak(staffId, tenantId);

      res.status(201).json({
        status: 'success',
        data: result,
        message: 'Break started',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async endBreak(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffId } = req.params as { staffId: string };

      const result = await staffService.endBreak(staffId, tenantId);

      res.status(201).json({
        status: 'success',
        data: result,
        message: 'Break ended',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }
}

export const staffController = new StaffController();
