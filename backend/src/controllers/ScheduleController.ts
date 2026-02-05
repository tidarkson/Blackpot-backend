import { Request, Response } from 'express';
import { shiftService } from '../services/ScheduleService';
import { conflictDetectionService } from '../services/ConflictDetectionService';
import { createScheduleSchema, updateScheduleSchema, scheduleFiltersSchema, clockInSchema, clockOutSchema, copyPreviousWeekSchema, weekScheduleQuerySchema } from '../validators/schedule.validator';

/**
 * ScheduleController
 * 
 * Handles all schedule/shift management endpoints
 * - CRUD operations for shifts
 * - Clock in/out functionality
 * - Week-view schedules
 * - Conflict detection
 */
export class ScheduleController {
  async createSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = createScheduleSchema.parse(req.body);

      // Detect conflicts before creating
      const conflicts = await conflictDetectionService.detectConflicts(
        tenantId,
        data.userId,
        new Date(data.scheduledDate),
        new Date(`${data.scheduledDate.substring(0, 10)}T${data.scheduledStart}:00`),
        new Date(`${data.scheduledDate.substring(0, 10)}T${data.scheduledEnd}:00`),
        data.roleAssigned
      );

      const shift = await shiftService.createShift(tenantId, data);

      // Log any conflicts
      if (conflicts.length > 0) {
        for (const conflict of conflicts) {
          await conflictDetectionService.logConflict(tenantId, data.userId, shift.id, conflict.type, conflict);
        }
      }

      res.status(201).json({
        status: 'success',
        data: shift,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        message: 'Shift created' + (conflicts.length > 0 ? ' with warnings' : ' successfully'),
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Failed to create shift',
      });
    }
  }

  async getAllSchedules(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const filters = scheduleFiltersSchema.parse(req.query);

      const shifts = await shiftService.getAllShifts(tenantId, filters);

      res.json({
        status: 'success',
        data: shifts,
        total: shifts.length,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message || 'Failed to fetch schedules',
      });
    }
  }

  async getScheduleById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { shiftId } = req.params as { shiftId: string };

      const shift = await shiftService.getShiftById(shiftId, tenantId);

      res.json({
        status: 'success',
        data: shift,
      });
    } catch (error: any) {
      res.status(error.message?.includes('not found') ? 404 : 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async updateSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { shiftId } = req.params as { shiftId: string };
      const data = updateScheduleSchema.parse(req.body);

      const shift = await shiftService.updateShift(shiftId, tenantId, data);

      res.json({
        status: 'success',
        data: shift,
        message: 'Shift updated successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async deleteSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { shiftId } = req.params as { shiftId: string };

      const shift = await shiftService.deleteShift(shiftId, tenantId);

      res.json({
        status: 'success',
        data: shift,
        message: 'Shift deleted successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async getWeekSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };

      if (!date) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required query parameter: date',
        });
        return;
      }

      const weekSchedule = await shiftService.getWeekSchedule(tenantId, new Date(date));

      res.json({
        status: 'success',
        data: weekSchedule,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async getActiveShifts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;

      const shifts = await shiftService.getActiveShifts(tenantId);

      res.json({
        status: 'success',
        data: shifts,
        total: shifts.length,
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
      const { shiftId } = req.params as { shiftId: string };
      const { notes } = req.body as { notes?: string };

      const clockInRecord = await shiftService.clockIn(shiftId, tenantId, notes);

      res.status(201).json({
        status: 'success',
        data: clockInRecord,
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
      const { shiftId } = req.params as { shiftId: string };
      const { breakMinutes, notes } = req.body as { breakMinutes?: number; notes?: string };

      const shift = await shiftService.clockOut(shiftId, tenantId, breakMinutes, notes);

      res.json({
        status: 'success',
        data: shift,
        message: 'Clocked out successfully',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async copyPreviousWeek(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = copyPreviousWeekSchema.parse(req.body);

      const result = await shiftService.copyPreviousWeek(tenantId, new Date(data.startDate));

      res.status(201).json({
        status: 'success',
        data: result,
        message: `${result.newShifts.length} shifts copied successfully`,
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async bulkCreateSchedules(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { shifts } = req.body as { shifts: any[] };

      if (!shifts || !Array.isArray(shifts)) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required field: shifts array',
        });
        return;
      }

      const created = await shiftService.bulkCreateShifts(tenantId, shifts);

      res.status(201).json({
        status: 'success',
        data: created,
        message: `${created.length} shifts created successfully`,
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message,
      });
    }
  }

  async getShiftConflicts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { shiftId } = req.params as { shiftId: string };

      const conflicts = await conflictDetectionService.getUnresolvedConflicts(tenantId, shiftId);

      res.json({
        status: 'success',
        data: conflicts,
        total: conflicts.length,
      });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({
        status: 'error',
        message: error.message,
      });
    }
  }
}

export const scheduleController = new ScheduleController();
