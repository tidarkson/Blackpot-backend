import { Router, Request, Response } from 'express';
import { customerController } from '../controllers/CustomerController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

/**
 * CUSTOMER MANAGEMENT ROUTES
 *
 * All routes require JWT authentication
 * RBAC rules:
 * - OWNER: Full CRUD, all customer operations
 * - MANAGER: Full CRUD, customer operations, can view history
 * - SUPERVISOR: Can view customers, preferences, and history
 * - SERVER: Can view customers, preferences, and create/update
 * - HOST: Can create customers on reservation
 *
 * Privacy operations (export, GDPR delete) require MANAGER+ role
 */

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

router.use(authenticate);

// ========================================
// CUSTOMER CRUD OPERATIONS
// ========================================

/**
 * GET /api/customers
 * List all customers with filtering and pagination
 *
 * Query parameters:
 * - vipStatus: boolean
 * - minSpend: number
 * - maxSpend: number
 * - minVisits: number
 * - maxVisits: number
 * - tags: comma-separated string
 * - page: number (default: 1)
 * - pageSize: number (default: 25, max: 100)
 *
 * RBAC: All authenticated users
 */
router.get('/', (req: Request, res: Response) =>
  customerController.getAllCustomers(req, res)
);

/**
 * GET /api/customers/search
 * Search customers by name, phone, or email
 *
 * Query parameters:
 * - q: search query (required)
 * - type: 'name' | 'phone' | 'email' | 'all' (default: all)
 * - page: number (default: 1)
 * - pageSize: number (default: 25)
 *
 * RBAC: All authenticated users
 */
router.get('/search', (req: Request, res: Response) =>
  customerController.searchCustomers(req, res)
);

/**
 * POST /api/customers
 * Create a new customer
 *
 * Body:
 * {
 *   name: string,
 *   phone: string,
 *   email?: string,
 *   preferences?: {...},
 *   tags?: string[],
 *   notes?: string
 * }
 *
 * RBAC: SERVER, MANAGER, OWNER
 */
router.post(
  '/',
  requireRole('SERVER', 'MANAGER', 'OWNER', 'HOST'),
  (req: Request, res: Response) => customerController.createCustomer(req, res)
);

/**
 * GET /api/customers/:id
 * Get customer profile by ID
 *
 * RBAC: All authenticated users
 */
router.get('/:id', (req: Request, res: Response) =>
  customerController.getCustomer(req, res)
);

/**
 * PUT /api/customers/:id
 * Update customer
 *
 * Body:
 * {
 *   name?: string,
 *   email?: string,
 *   preferences?: {...},
 *   tags?: string[],
 *   notes?: string,
 *   vipStatus?: boolean,
 *   vipTier?: 'GOLD' | 'PLATINUM' | 'DIAMOND' | null
 * }
 *
 * RBAC: SERVER, MANAGER, OWNER
 */
router.put(
  '/:id',
  requireRole('SERVER', 'MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.updateCustomer(req, res)
);

/**
 * DELETE /api/customers/:id
 * Soft delete customer
 *
 * RBAC: MANAGER, OWNER
 */
router.delete(
  '/:id',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.deleteCustomer(req, res)
);

// ========================================
// VIP MANAGEMENT
// ========================================

/**
 * GET /api/customers/vip
 * Get all VIP customers
 *
 * Query parameters:
 * - page: number (default: 1)
 * - pageSize: number (default: 25)
 *
 * RBAC: All authenticated users
 */
router.get('/vip/list', (req: Request, res: Response) =>
  customerController.getVipCustomers(req, res)
);

/**
 * PATCH /api/customers/:id/vip-status
 * Update VIP status for a customer
 *
 * Body:
 * {
 *   vipStatus: boolean,
 *   vipTier?: 'GOLD' | 'PLATINUM' | 'DIAMOND' | null
 * }
 *
 * RBAC: MANAGER, OWNER
 */
router.patch(
  '/:id/vip-status',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.updateVipStatus(req, res)
);

// ========================================
// CUSTOMER HISTORY & STATISTICS
// ========================================

/**
 * GET /api/customers/:id/reservations
 * Get all reservations for a customer
 *
 * Query parameters:
 * - page: number (default: 1)
 * - pageSize: number (default: 25)
 *
 * RBAC: All authenticated users
 */
router.get('/:id/reservations', (req: Request, res: Response) =>
  customerController.getCustomerReservations(req, res)
);

/**
 * GET /api/customers/:id/orders
 * Get all orders for a customer
 *
 * Query parameters:
 * - page: number (default: 1)
 * - pageSize: number (default: 25)
 *
 * RBAC: All authenticated users
 */
router.get('/:id/orders', (req: Request, res: Response) =>
  customerController.getCustomerOrders(req, res)
);

/**
 * GET /api/customers/:id/stats
 * Get customer statistics
 *
 * Returns:
 * {
 *   visitCount: number,
 *   lifetimeSpend: string (decimal),
 *   averageCheck: string (decimal),
 *   lastVisit: datetime,
 *   vipStatus: boolean,
 *   vipTier: string | null,
 *   totalReservations: number,
 *   totalOrders: number,
 *   joinDate: datetime
 * }
 *
 * RBAC: All authenticated users
 */
router.get('/:id/stats', (req: Request, res: Response) =>
  customerController.getCustomerStats(req, res)
);

// ========================================
// PREFERENCES
// ========================================

/**
 * GET /api/customers/:id/preferences
 * Get customer preferences
 *
 * RBAC: All authenticated users
 */
router.get('/:id/preferences', (req: Request, res: Response) =>
  customerController.getPreferences(req, res)
);

/**
 * PUT /api/customers/:id/preferences
 * Update customer preferences
 *
 * Body:
 * {
 *   dietaryRestrictions?: string[],
 *   favoriteItems?: string[],
 *   seatingPreference?: string,
 *   winePreferences?: string[],
 *   allergies?: string[],
 *   specialOccasions?: Array<{type: string, date: ISO8601}>,
 *   notes?: string
 * }
 *
 * RBAC: SERVER, MANAGER, OWNER
 */
router.put(
  '/:id/preferences',
  requireRole('SERVER', 'MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.updatePreferences(req, res)
);

// ========================================
// ANALYTICS & INSIGHTS
// ========================================

/**
 * GET /api/customers/analytics/top-spenders
 * Get top customers by lifetime spend
 *
 * Query parameters:
 * - limit: number (default: 10, max: 100)
 *
 * RBAC: MANAGER, OWNER
 */
router.get(
  '/analytics/top-spenders',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.getTopSpenders(req, res)
);

/**
 * GET /api/customers/analytics/vip-stats
 * Get VIP customer statistics
 *
 * RBAC: MANAGER, OWNER
 */
router.get(
  '/analytics/vip-stats',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.getVipAnalytics(req, res)
);

/**
 * GET /api/customers/analytics/retention
 * Get customer retention rate
 *
 * Query parameters:
 * - daysBack: number (default: 90, min: 1, max: 365)
 *
 * RBAC: MANAGER, OWNER
 */
router.get(
  '/analytics/retention',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) =>
    customerController.getRetentionAnalytics(req, res)
);

// ========================================
// MERGE & DEDUPLICATION
// ========================================

/**
 * GET /api/customers/:id/duplicates
 * Detect potential duplicate customers
 *
 * RBAC: MANAGER, OWNER
 */
router.get(
  '/:id/duplicates',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.detectDuplicates(req, res)
);

/**
 * POST /api/customers/:id/merge/:otherId
 * Merge two customers (consolidate duplicate records)
 *
 * Body:
 * {
 *   confirm: true
 * }
 *
 * RBAC: OWNER only (critical operation)
 */
router.post(
  '/:id/merge/:otherId',
  requireRole('OWNER'),
  (req: Request, res: Response) => customerController.mergeCustomers(req, res)
);

// ========================================
// PRIVACY & COMPLIANCE (GDPR)
// ========================================

/**
 * GET /api/customers/:id/export
 * Export all customer data (GDPR Data Portability)
 *
 * Response includes:
 * - Complete customer profile
 * - Preferences
 * - Complete order history
 * - Complete reservation history
 * - Activity logs
 *
 * RBAC: MANAGER, OWNER
 */
router.get(
  '/:id/export',
  requireRole('MANAGER', 'OWNER'),
  (req: Request, res: Response) => customerController.exportCustomerData(req, res)
);

/**
 * DELETE /api/customers/:id/gdpr
 * Hard delete customer and anonymize all data (GDPR Right to be Forgotten)
 *
 * Body:
 * {
 *   confirm: true
 * }
 *
 * Effect:
 * - Permanently delete customer record
 * - Anonymize all reservations (set guest info to "DELETED_CUSTOMER")
 * - Keep orders for financial audit purposes
 * - Log the deletion for compliance
 *
 * RBAC: OWNER only (critical operation)
 */
router.delete(
  '/:id/gdpr',
  requireRole('OWNER'),
  (req: Request, res: Response) =>
    customerController.hardDeleteCustomer(req, res)
);

export default router;
