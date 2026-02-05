import { Router, Request, Response } from 'express';
import { tableController } from '../controllers/TableController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { enforceTableRBAC, enforceTableOwnershipRBAC } from '../middleware/tableRBAC';

const router = Router();

/**
 * Table Management Routes
 * All routes require:
 * - Authentication
 * - Tenant isolation
 * - Role-based access control (RBAC)
 */

// Apply authentication and RBAC to all table routes
router.use(authenticate);
router.use(ensureTenantAccess);
router.use(enforceTableRBAC);
router.use(enforceTableOwnershipRBAC);

// ========================================
// TABLE CRUD OPERATIONS
// ========================================

/**
 * GET /api/tables
 * Get all tables for a location with filtering and pagination
 * Query params: locationId, sectionId, status, shape, capacity, page, pageSize
 * RBAC: All roles can view
 */
router.get('/', (req: Request, res: Response) =>
  tableController.getAllTables(req, res)
);

/**
 * POST /api/tables
 * Create a new table
 * Body: name, capacity, shape, x, y, width, height, sectionId, serverId, locationId
 * RBAC: OWNER, MANAGER
 */
router.post('/', (req: Request, res: Response) =>
  tableController.createTable(req, res)
);

/**
 * GET /api/tables/:tableId
 * Get a specific table by ID with related data
 * RBAC: All roles can view
 */
router.get('/:tableId', (req: Request, res: Response) =>
  tableController.getTableById(req, res)
);

/**
 * PUT /api/tables/:tableId
 * Update table details (name, capacity, shape, position, section, server)
 * Body: name, capacity, shape, x, y, width, height, sectionId, serverId
 * RBAC: OWNER, MANAGER, SUPERVISOR, HOST
 */
router.put('/:tableId', (req: Request, res: Response) =>
  tableController.updateTable(req, res)
);

/**
 * DELETE /api/tables/:tableId
 * Soft delete a table (mark as deleted)
 * RBAC: OWNER, MANAGER
 */
router.delete('/:tableId', (req: Request, res: Response) =>
  tableController.deleteTable(req, res)
);

// ========================================
// TABLE STATUS & FLOOR PLAN
// ========================================

/**
 * PATCH /api/tables/:tableId/status
 * Update table status (AVAILABLE, OCCUPIED, RESERVED, CLEANING, MAINTENANCE)
 * Body: status
 * RBAC: OWNER, MANAGER, SUPERVISOR, HOST, DISHWASHER
 */
router.patch('/:tableId/status', (req: Request, res: Response) =>
  tableController.updateTableStatus(req, res)
);

/**
 * GET /api/tables/floor-plan/view
 * Get floor plan with all tables and coordinates
 * Query params: locationId, sectionId
 * RBAC: All roles can view
 */
router.get('/floor-plan/view', (req: Request, res: Response) =>
  tableController.getFloorPlan(req, res)
);

/**
 * PUT /api/tables/floor-plan/update
 * Batch update table positions on floor plan
 * Body: tables[] { tableId, x, y }
 * RBAC: OWNER, MANAGER
 */
router.put('/floor-plan/update', (req: Request, res: Response) =>
  tableController.updateFloorPlan(req, res)
);

// ========================================
// TABLE OPERATIONS
// ========================================

/**
 * POST /api/tables/:tableId/seat
 * Seat guests at a table (create order)
 * Body: guestCount
 * RBAC: OWNER, MANAGER, SUPERVISOR, SERVER, HOST
 */
router.post('/:tableId/seat', (req: Request, res: Response) =>
  tableController.seatGuests(req, res)
);

/**
 * POST /api/tables/:tableId/clear
 * Clear and clean a table (release and close order)
 * Body: reason (optional)
 * RBAC: OWNER, MANAGER, SUPERVISOR, SERVER, HOST, DISHWASHER
 */
router.post('/:tableId/clear', (req: Request, res: Response) =>
  tableController.clearTable(req, res)
);

/**
 * GET /api/tables/:tableId/current-order
 * Get the active (OPEN) order for a table
 * RBAC: All roles can view
 */
router.get('/:tableId/current-order', (req: Request, res: Response) =>
  tableController.getCurrentOrder(req, res)
);

/**
 * GET /api/tables/:tableId/reservations
 * Get all reservations for a specific table
 * RBAC: OWNER, MANAGER, SUPERVISOR, SERVER, HOST, SOMMELIER
 */
router.get('/:tableId/reservations', (req: Request, res: Response) =>
  tableController.getTableReservations(req, res)
);

// ========================================
// TABLE SECTIONS
// ========================================

/**
 * GET /api/table-sections
 * Get all table sections for tenant
 * RBAC: OWNER, MANAGER, SUPERVISOR, HOST
 */
router.get(
  '/sections/list',
  (req: Request, res: Response) =>
    tableController.getAllSections(req, res)
);

/**
 * POST /api/table-sections
 * Create a new table section
 * Body: name
 * RBAC: OWNER, MANAGER
 */
router.post(
  '/sections/create',
  (req: Request, res: Response) =>
    tableController.createSection(req, res)
);

/**
 * PUT /api/table-sections/:sectionId
 * Update a table section
 * Body: name (optional)
 * RBAC: OWNER, MANAGER
 */
router.put(
  '/sections/:sectionId',
  (req: Request, res: Response) =>
    tableController.updateSection(req, res)
);

/**
 * DELETE /api/table-sections/:sectionId
 * Delete a table section
 * RBAC: OWNER, MANAGER
 */
router.delete(
  '/sections/:sectionId',
  (req: Request, res: Response) =>
    tableController.deleteSection(req, res)
);

export default router;
