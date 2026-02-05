import { Request, Response } from 'express';
import ReservationService from '../services/ReservationService';
import {
  createReservationSchema,
  updateReservationSchema,
  updateReservationStatusSchema,
  cancelReservationSchema,
  reservationQuerySchema,
} from '../validators/reservation.validator';
import logger from '../config/logger';

/**
 * ReservationController
 *
 * Handles HTTP request/response cycle for reservation operations
 * - Validates input
 * - Calls service layer
 * - Formats and returns responses
 * - Manages error handling
 */
export class ReservationController {
  /**
   * GET /api/reservations
   * List all reservations with filtering and pagination
   *
   * Query parameters:
   * - status: PENDING, CONFIRMED, SEATED, COMPLETED, CANCELLED, NO_SHOW
   * - date: Specific date (ISO 8601)
   * - dateFrom, dateTo: Date range
   * - tableId: Filter by table
   * - guestName: Search by name (partial match)
   * - guestPhone: Search by phone
   * - guestEmail: Search by email
   * - excludeCancelled: true/false (default: true)
   * - page: Page number (default: 1)
   * - pageSize: Items per page (default: 25, max: 100)
   *
   * Response: 200 OK with paginated reservation list
   */
  async getAllReservations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate query parameters
      let filters;
      try {
        filters = reservationQuerySchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: validationError.errors,
        });
        return;
      }

      // Extract pagination and filters
      const { page, pageSize, ...filterData } = filters;

      // Convert date strings to Date objects if provided
      const processedFilters: any = { ...filterData };
      if (filterData.date && typeof filterData.date === 'string') {
        processedFilters.date = new Date(filterData.date);
      }
      if (filterData.dateFrom && filterData.dateTo && typeof filterData.dateFrom === 'string' && typeof filterData.dateTo === 'string') {
        processedFilters.dateRange = {
          from: new Date(filterData.dateFrom),
          to: new Date(filterData.dateTo),
        };
        delete processedFilters.dateFrom;
        delete processedFilters.dateTo;
      }

      const result = await ReservationService.getAllReservations(tenantId, processedFilters, {
        page,
        pageSize,
      });

      res.json(result);
    } catch (error) {
      logger.error('Error fetching reservations:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/reservations/:id
   * Get single reservation details
   *
   * Response: 200 OK with reservation details
   */
  async getReservation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const idString = Array.isArray(id) ? id[0] : id;
      const reservation = await ReservationService.getReservationById(idString, tenantId);

      res.json(reservation);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }

      logger.error('Error fetching reservation:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

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
   *   "notes": "Celebrate anniversary"
   * }
   *
   * Response: 201 Created with reservation details
   *
   * Future enhancements:
   * - Availability checking before creation
   * - Confirmation email trigger
   * - Deposit calculation
   */
  async createReservation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = (req.user as any)?.id;

      if (!tenantId || !serverId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      let validatedData;
      try {
        validatedData = createReservationSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid request data',
          details: validationError.errors,
        });
        return;
      }

      // Convert ISO string to Date
      const reservationData = {
        ...validatedData,
        reservedAt: new Date(validatedData.reservedAt),
      };

      const reservation = await ReservationService.createReservation(
        reservationData,
        tenantId,
        serverId
      );

      res.status(201).json(reservation);
    } catch (error) {
      logger.error('Error creating reservation:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * PUT /api/reservations/:id
   * Update reservation details
   *
   * Request body: Partial reservation object
   * (Any fields can be updated)
   *
   * Response: 200 OK with updated reservation
   */
  async updateReservation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      let validatedData;
      try {
        validatedData = updateReservationSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid request data',
          details: validationError.errors,
        });
        return;
      }

      // Convert ISO string to Date if present
      const updateData: any = { ...validatedData };
      if (updateData.reservedAt && typeof updateData.reservedAt === 'string') {
        updateData.reservedAt = new Date(updateData.reservedAt);
      }

      const idString = Array.isArray(id) ? id[0] : id;
      const updated = await ReservationService.updateReservation(idString, updateData, tenantId, userId);

      res.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }

      logger.error('Error updating reservation:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * PATCH /api/reservations/:id/status
   * Update reservation status with workflow validation
   *
   * Request body:
   * {
   *   "status": "CONFIRMED" | "SEATED" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
   * }
   *
   * Response: 200 OK with updated reservation
   */
  async updateReservationStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      let validatedData;
      try {
        validatedData = updateReservationStatusSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid request data',
          details: validationError.errors,
        });
        return;
      }

      const idString = Array.isArray(id) ? id[0] : id;
      const updated = await ReservationService.updateReservationStatus(
        idString,
        validatedData.status,
        tenantId,
        userId
      );

      res.json(updated);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          res.status(404).json({ error: error.message });
          return;
        }
        if (error.message.includes('Invalid status transition')) {
          res.status(400).json({ error: error.message });
          return;
        }
      }

      logger.error('Error updating reservation status:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * DELETE /api/reservations/:id
   * Cancel a reservation (soft delete)
   *
   * Request body:
   * {
   *   "reason": "Guest requested cancellation"
   * }
   *
   * Response: 200 OK with cancelled reservation
   */
  async cancelReservation(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const userId = (req.user as any)?.id;
      const { id } = req.params;

      if (!tenantId || !userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate request body
      let validatedData;
      try {
        validatedData = cancelReservationSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid request data',
          details: validationError.errors,
        });
        return;
      }

      const idString = Array.isArray(id) ? id[0] : id;
      const cancelled = await ReservationService.cancelReservation(
        idString,
        tenantId,
        validatedData.reason,
        userId
      );

      res.json(cancelled);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }

      logger.error('Error cancelling reservation:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/reservations/date/:date
   * Get all reservations for a specific date
   *
   * URL parameter: date (YYYY-MM-DD)
   *
   * Response: 200 OK with array of reservations
   */
  async getReservationsByDate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { date } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Handle date as array or string
      const dateString = Array.isArray(date) ? date[0] : date;

      // Parse and validate date
      const parsedDate = new Date(dateString);
      if (isNaN(parsedDate.getTime())) {
        res.status(400).json({ error: 'Invalid date format (use YYYY-MM-DD)' });
        return;
      }

      const reservations = await ReservationService.getReservationsByDate(parsedDate, tenantId);

      res.json({
        date: dateString,
        count: reservations.length,
        reservations: reservations,
      });
    } catch (error) {
      logger.error('Error fetching reservations by date:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/reservations/stats/by-status
   * Get reservation counts by status (for dashboard)
   *
   * Response: 200 OK with counts by status
   */
  async getReservationStats(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await ReservationService.getReservationCountsByStatus(tenantId);

      res.json(stats);
    } catch (error) {
      logger.error('Error fetching reservation stats:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export default new ReservationController();
