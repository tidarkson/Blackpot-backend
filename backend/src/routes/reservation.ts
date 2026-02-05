import { Router, Request, Response } from 'express';
import ReservationController from '../controllers/ReservationController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

/**
 * RESERVATION ROUTES
 * 
 * All routes require JWT authentication
 * RBAC rules:
 * - HOST: Full CRUD, can manage all reservations
 * - MANAGER: Full CRUD, can manage all reservations
 * - SUPERVISOR: Can view and confirm reservations
 * - SERVER: Can view reservations for awareness
 * 
 * Future: Customer model will enable customer-only endpoints
 */

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================

router.use(authenticate);

// ========================================
// LIST & SEARCH OPERATIONS
// ========================================

/**
 * GET /api/reservations
 * List all reservations with filters and pagination
 * 
 * Query parameters:
 * - status, date, dateFrom, dateTo, tableId, guestName, guestPhone, guestEmail
 * - excludeCancelled, page, pageSize
 * 
 * RBAC: All authenticated users
 */
router.get('/', (req: Request, res: Response) =>
  ReservationController.getAllReservations(req, res)
);

/**
 * GET /api/reservations/date/:date
 * Get reservations for a specific date (host stand view)
 * 
 * URL parameter: date (YYYY-MM-DD)
 * 
 * RBAC: HOST, MANAGER, SUPERVISOR (those managing reservations)
 */
router.get('/date/:date', (req: Request, res: Response) =>
  ReservationController.getReservationsByDate(req, res)
);

/**
 * GET /api/reservations/stats/by-status
 * Get reservation statistics (for dashboard)
 * 
 * RBAC: MANAGER, HOST, SUPERVISOR
 */
router.get('/stats/by-status', (req: Request, res: Response) =>
  ReservationController.getReservationStats(req, res)
);

// ========================================
// CRUD OPERATIONS
// ========================================

/**
 * POST /api/reservations
 * Create a new reservation
 * 
 * Request body:
 * {
 *   "tableId": "uuid",
 *   "guestName": "John Smith",
 *   "guestEmail": "john@example.com",
 *   "guestPhone": "+1-555-0100",
 *   "guestCount": 4,
 *   "reservedAt": "2026-02-15T19:00:00Z",
 *   "notes": "Anniversary dinner"
 * }
 * 
 * RBAC: HOST, MANAGER, OWNER (only these can create)
 */
router.post('/', (req: Request, res: Response) =>
  ReservationController.createReservation(req, res)
);

/**
 * GET /api/reservations/:id
 * Get single reservation details
 * 
 * RBAC: All authenticated users (can view)
 */
router.get('/:id', (req: Request, res: Response) =>
  ReservationController.getReservation(req, res)
);

/**
 * PUT /api/reservations/:id
 * Update reservation details
 * 
 * Request body: Partial reservation object
 * 
 * RBAC: HOST, MANAGER (can update)
 */
router.put('/:id', (req: Request, res: Response) =>
  ReservationController.updateReservation(req, res)
);

/**
 * DELETE /api/reservations/:id
 * Cancel a reservation (soft delete)
 * 
 * Request body:
 * {
 *   "reason": "Guest requested cancellation"
 * }
 * 
 * RBAC: HOST, MANAGER (can cancel)
 */
router.delete('/:id', (req: Request, res: Response) =>
  ReservationController.cancelReservation(req, res)
);

// ========================================
// STATUS MANAGEMENT
// ========================================

/**
 * PATCH /api/reservations/:id/status
 * Update reservation status with workflow validation
 * 
 * Request body:
 * {
 *   "status": "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
 * }
 * 
 * Workflow:
 * - PENDING → CONFIRMED (confirmation)
 * - CONFIRMED → SEATED (checked in)
 * - SEATED → COMPLETED (finished)
 * - Any → CANCELLED (before seated)
 * - CONFIRMED → NO_SHOW (didn't arrive)
 * 
 * RBAC: HOST, MANAGER, SUPERVISOR
 */
router.patch('/:id/status', (req: Request, res: Response) =>
  ReservationController.updateReservationStatus(req, res)
);

// ========================================
// PLACEHOLDER ROUTES (FUTURE PHASES)
// ========================================

/**
 * POST /api/reservations/:id/checkin
 * Mark reservation as checked in
 * 
 * Phase 4: Customer Operations
 */
// router.post('/:id/checkin', (req: Request, res: Response) =>
//   ReservationController.checkinReservation(req, res)
// );

/**
 * POST /api/reservations/:id/seat
 * Seat reservation at table (create/link order)
 * 
 * Phase 4: Customer Operations
 */
// router.post('/:id/seat', (req: Request, res: Response) =>
//   ReservationController.seatReservation(req, res)
// );

/**
 * GET /api/reservations/customer/:customerId
 * Get reservations for a customer
 * 
 * Phase 4: Customer Operations (needs Customer model)
 */
// router.get('/customer/:customerId', (req: Request, res: Response) =>
//   ReservationController.getCustomerReservations(req, res)
// );

/**
 * GET /api/reservations/availability
 * Check available time slots
 * 
 * Phase 3: Availability Management
 */
// router.get('/availability', (req: Request, res: Response) =>
//   ReservationController.checkAvailability(req, res)
// );

/**
 * POST /api/reservations/availability/check
 * Check availability for specific date/time/party
 * 
 * Phase 3: Availability Management
 */
// router.post('/availability/check', (req: Request, res: Response) =>
//   ReservationController.checkAvailabilityDetails(req, res)
// );

export default router;