import { Router, Request, Response } from 'express';
import { scheduleController } from '../controllers/ScheduleController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Schedule/Shift Management Routes
 * All routes require authentication and tenant isolation
 */

/**
 * POST /api/schedules
 * Create a new shift/schedule
 * Body: { userId, scheduledDate, scheduledStart, scheduledEnd, roleAssigned, sectionAssigned?, breakMinutes?, notes? }
 * RBAC: MANAGER, OWNER
 */
router.post('/', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.createSchedule(req, res)
);

/**
 * GET /api/schedules
 * Get all shifts with filtering
 * Query params: userId, roleAssigned, sectionAssigned, status, startDate, endDate, sortBy, sortOrder, limit, offset
 * RBAC: MANAGER, OWNER, SUPERVISOR (filtered by location)
 */
router.get('/', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.getAllSchedules(req, res)
);

/**
 * GET /api/schedules/:shiftId
 * Get shift details
 * RBAC: MANAGER, OWNER, SUPERVISOR (assigned staff)
 */
router.get('/:shiftId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.getScheduleById(req, res)
);

/**
 * PUT /api/schedules/:shiftId
 * Update shift
 * RBAC: MANAGER, OWNER
 */
router.put('/:shiftId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.updateSchedule(req, res)
);

/**
 * DELETE /api/schedules/:shiftId
 * Cancel/Delete shift
 * RBAC: MANAGER, OWNER
 */
router.delete('/:shiftId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.deleteSchedule(req, res)
);

/**
 * GET /api/schedules/week/:date
 * Get week schedule
 * Query params: roleFilter?
 * RBAC: All authenticated users
 */
router.get('/week/:date', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.getWeekSchedule(req, res)
);

/**
 * GET /api/schedules/active
 * Get currently active shifts
 * RBAC: MANAGER, OWNER
 */
router.get('/active', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.getActiveShifts(req, res)
);

/**
 * POST /api/schedules/:shiftId/clock-in
 * Clock in for a shift
 * Body: { shiftId, notes? }
 * RBAC: Staff, MANAGER, OWNER
 */
router.post('/:shiftId/clock-in', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.clockIn(req, res)
);

/**
 * POST /api/schedules/:shiftId/clock-out
 * Clock out from a shift
 * Body: { shiftId, breakMinutes?, notes? }
 * RBAC: Staff, MANAGER, OWNER
 */
router.post('/:shiftId/clock-out', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.clockOut(req, res)
);

/**
 * POST /api/schedules/copy-previous-week
 * Copy previous week's schedule
 * Body: { startDate, ignoreConflicts? }
 * RBAC: MANAGER, OWNER
 */
router.post('/copy-previous-week', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.copyPreviousWeek(req, res)
);

/**
 * POST /api/schedules/bulk
 * Bulk create shifts
 * Body: { schedules: CreateScheduleRequest[] }
 * RBAC: MANAGER, OWNER
 */
router.post('/bulk', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.bulkCreateSchedules(req, res)
);

/**
 * GET /api/schedules/:shiftId/conflicts
 * Get conflicts for a shift
 * RBAC: MANAGER, OWNER
 */
router.get('/:shiftId/conflicts', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  scheduleController.getShiftConflicts(req, res)
);

export default router;
