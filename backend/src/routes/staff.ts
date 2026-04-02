import { Router, Request, Response } from 'express';
import { staffController } from '../controllers/StaffController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Staff Management Routes
 * All routes require authentication and tenant isolation
 */

/**
 * POST /api/staff
 * Create a new staff member
 * RBAC: MANAGER, OWNER
 */
router.post('/', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.createStaff(req, res)
);

/**
 * GET /api/staff
 * Get all staff members
 * Query params: role, locationId, isActive, search, sortBy, sortOrder, limit, offset
 * RBAC: MANAGER, OWNER, SUPERVISOR
 */
router.get('/', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.getAllStaff(req, res)
);

/**
 * GET /api/staff/:staffId
 * Get staff details
 * RBAC: MANAGER, OWNER, SUPERVISOR (can view own)
 */
router.get('/:staffId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.getStaffById(req, res)
);

/**
 * PUT /api/staff/:staffId
 * Update staff member
 * RBAC: MANAGER, OWNER
 */
router.put('/:staffId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.updateStaff(req, res)
);

/**
 * DELETE /api/staff/:staffId
 * Deactivate staff member (soft delete)
 * RBAC: MANAGER, OWNER
 */
router.delete('/:staffId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.deleteStaff(req, res)
);

/**
 * POST /api/staff/:staffId/reactivate
 * Reactivate a deactivated staff member
 * RBAC: MANAGER, OWNER
 */
router.post('/:staffId/reactivate', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.reactivateStaff(req, res)
);

/**
 * GET /api/staff/:staffId/availability
 * Get staff availability
 * RBAC: MANAGER, OWNER, SUPERVISOR (can view own)
 */
router.get('/:staffId/availability', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.getAvailability(req, res)
);

/**
 * PUT /api/staff/:staffId/availability
 * Update staff availability
 * RBAC: MANAGER, OWNER, SELF
 */
router.put('/:staffId/availability', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.updateAvailability(req, res)
);

/**
 * POST /api/staff/:staffId/clock-in
 * Clock in staff member using today's scheduled shift
 */
router.post('/:staffId/clock-in', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.clockIn(req, res)
);

/**
 * POST /api/staff/:staffId/clock-out
 * Clock out staff member from active shift
 */
router.post('/:staffId/clock-out', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.clockOut(req, res)
);

/**
 * POST /api/staff/:staffId/break/start
 * Start break for staff member
 */
router.post('/:staffId/break/start', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.startBreak(req, res)
);

/**
 * POST /api/staff/:staffId/break/end
 * End break for staff member
 */
router.post('/:staffId/break/end', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.endBreak(req, res)
);

/**
 * GET /api/staff/:staffId/metrics
 * Get staff performance metrics
 * Query params: startDate, endDate
 * RBAC: MANAGER, OWNER
 */
router.get('/:staffId/metrics', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.getStaffMetrics(req, res)
);

/**
 * POST /api/staff/bulk
 * Bulk staff operations (activate, deactivate, reassign)
 * Body: { staffIds: string[], action: string, metadata?: any }
 * RBAC: MANAGER, OWNER
 */
router.post('/bulk', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  staffController.bulkUpdateStaff(req, res)
);

export default router;
