import { z } from 'zod';
import { ReservationStatus } from '@prisma/client';

// ========================================
// SHARED SCHEMAS
// ========================================

/**
 * Phone validation: Supports multiple formats
 * - +1-555-0100
 * - 555-0100
 * - (555) 0100
 * - 5550100
 */
const phoneSchema = z
  .string()
  .regex(/^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/, 'Invalid phone format');

/**
 * Email validation with stricter checks
 */
const emailSchema = z.string().email('Invalid email format').toLowerCase();

/**
 * Guest name validation
 */
const guestNameSchema = z
  .string()
  .min(2, 'Guest name must be at least 2 characters')
  .max(100, 'Guest name must be at most 100 characters')
  .regex(
    /^[a-zA-Z\s'-]+$/,
    'Guest name can only contain letters, spaces, hyphens, and apostrophes'
  );

/**
 * Guest count validation
 * Fine dining: 1-20 guests per spec
 * Future: Make configurable per restaurant
 */
const guestCountSchema = z
  .number()
  .int('Guest count must be an integer')
  .min(1, 'At least 1 guest is required')
  .max(20, 'Maximum 20 guests per reservation');

/**
 * Party size for large party surcharges (future)
 */
const largePartyThreshold = 6;

/**
 * Reservation date/time validation
 * Must be future date, preferably during business hours
 */
const reservedAtSchema = z
  .string()
  .datetime('Invalid date format (use ISO 8601)')
  .refine((date) => new Date(date) > new Date(), 'Reservation date must be in the future');

/**
 * Table ID validation (UUID format)
 */
const tableIdSchema = z.string().uuid('Invalid table ID format');

/**
 * Reservation notes validation (optional)
 */
const notesSchema = z.string().max(500, 'Notes must be at most 500 characters').optional();

/**
 * Reason validation for cancellations/updates
 */
const reasonSchema = z
  .string()
  .min(1, 'Reason is required')
  .max(200, 'Reason must be at most 200 characters')
  .optional();

// ========================================
// OPERATION SCHEMAS
// ========================================

/**
 * Schema for creating a new reservation
 *
 * Future extensions:
 * - occasion: string (birthday, anniversary, etc.)
 * - duration: number (in minutes, default 90-120)
 * - depositRequired: boolean
 * - depositAmount: Decimal
 * - vipCustomerId: string
 * - specialRequests: string[]
 * - dietaryRestrictions: string[]
 */
export const createReservationSchema = z.object({
  tableId: tableIdSchema,
  guestName: guestNameSchema,
  guestEmail: emailSchema.optional(),
  guestPhone: phoneSchema.optional(),
  guestCount: guestCountSchema,
  reservedAt: reservedAtSchema,
  notes: notesSchema,
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;

/**
 * Schema for updating a reservation
 * All fields optional (PATCH operation)
 */
export const updateReservationSchema = z.object({
  guestName: guestNameSchema.optional(),
  guestEmail: emailSchema.optional(),
  guestPhone: phoneSchema.optional(),
  guestCount: guestCountSchema.optional(),
  reservedAt: reservedAtSchema.optional(),
  tableId: tableIdSchema.optional(),
  notes: notesSchema.optional(),
});

export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;

/**
 * Schema for status updates
 * Validates that status is one of the enum values
 */
export const updateReservationStatusSchema = z.object({
  status: z.enum([
    ReservationStatus.PENDING,
    ReservationStatus.CONFIRMED,
    ReservationStatus.SEATED,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELLED,
    ReservationStatus.NO_SHOW,
  ] as const),
});

export type UpdateReservationStatusInput = z.infer<typeof updateReservationStatusSchema>;

/**
 * Schema for cancellation with optional reason
 */
export const cancelReservationSchema = z.object({
  reason: reasonSchema,
});

export type CancelReservationInput = z.infer<typeof cancelReservationSchema>;

/**
 * Schema for query filters
 * Supports flexible filtering with optional fields
 */
export const reservationFilterSchema = z.object({
  status: z
    .enum([
      ReservationStatus.PENDING,
      ReservationStatus.CONFIRMED,
      ReservationStatus.SEATED,
      ReservationStatus.COMPLETED,
      ReservationStatus.CANCELLED,
      ReservationStatus.NO_SHOW,
    ])
    .optional(),
  date: z.string().datetime().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  tableId: tableIdSchema.optional(),
  guestName: z.string().max(100).optional(),
  guestPhone: phoneSchema.optional(),
  guestEmail: emailSchema.optional(),
  excludeCancelled: z.boolean().optional().default(true),
});

export type ReservationFilterInput = z.infer<typeof reservationFilterSchema>;

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(25),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Combined query schema for GET /reservations
 */
export const reservationQuerySchema = z.object({
  ...reservationFilterSchema.shape,
  ...paginationSchema.shape,
});

export type ReservationQueryInput = z.infer<typeof reservationQuerySchema>;

// ========================================
// FUTURE SCHEMAS (PLACEHOLDERS)
// ========================================

/**
 * Will be used for customer operations (Phase 4)
 */
export const checkinReservationSchema = z.object({
  // Minimal input - mostly state change
  notes: z.string().max(200).optional(),
});

export type CheckinReservationInput = z.infer<typeof checkinReservationSchema>;

/**
 * Will be used for seating operations (Phase 4)
 */
export const seatReservationSchema = z.object({
  tableId: tableIdSchema,
  notes: z.string().max(200).optional(),
});

export type SeatReservationInput = z.infer<typeof seatReservationSchema>;

/**
 * Will be used for availability checking (Phase 3)
 */
export const checkAvailabilitySchema = z.object({
  date: z.string().datetime('Invalid date format'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
  partySize: guestCountSchema,
  duration: z
    .number()
    .int()
    .min(30, 'Minimum duration is 30 minutes')
    .max(300, 'Maximum duration is 5 hours')
    .optional()
    .default(90),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;

/**
 * Will be used for waitlist (Phase 5)
 */
export const addToWaitlistSchema = z.object({
  guestName: guestNameSchema,
  guestPhone: phoneSchema,
  guestEmail: emailSchema.optional(),
  partySize: guestCountSchema,
  notes: notesSchema,
});

export type AddToWaitlistInput = z.infer<typeof addToWaitlistSchema>;
