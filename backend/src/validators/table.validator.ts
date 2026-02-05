import { z } from 'zod';

/**
 * Table Validators
 * Zod schemas for validating table management API requests
 */

// ========================================
// ENUM SCHEMAS
// ========================================

export const tableStatusSchema = z.enum([
  'AVAILABLE',
  'OCCUPIED',
  'RESERVED',
  'CLEANING',
  'MAINTENANCE',
]);

export const tableShapeSchema = z.enum(['CIRCLE', 'SQUARE', 'RECTANGLE']);

export type TableStatus = z.infer<typeof tableStatusSchema>;
export type TableShape = z.infer<typeof tableShapeSchema>;

// ========================================
// CREATE TABLE SCHEMA
// ========================================

export const tableCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Table name is required')
    .max(50, 'Table name must be 50 characters or less'),
  capacity: z
    .number()
    .int('Capacity must be an integer')
    .min(1, 'Capacity must be at least 1')
    .max(20, 'Capacity cannot exceed 20 seats'),
  shape: tableShapeSchema.default('RECTANGLE'),
  x: z
    .number()
    .min(0, 'X coordinate cannot be negative')
    .max(1000, 'X coordinate cannot exceed 1000'),
  y: z
    .number()
    .min(0, 'Y coordinate cannot be negative')
    .max(1000, 'Y coordinate cannot exceed 1000'),
  width: z
    .number()
    .min(0.1, 'Width must be at least 0.1')
    .max(100, 'Width cannot exceed 100'),
  height: z
    .number()
    .min(0.1, 'Height must be at least 0.1')
    .max(100, 'Height cannot exceed 100'),
  sectionId: z.string().uuid('Invalid section ID').optional().nullable(),
  serverId: z.string().uuid('Invalid server ID').optional().nullable(),
  locationId: z.string().uuid('Location ID is required'),
});

export type TableCreateInput = z.infer<typeof tableCreateSchema>;

// ========================================
// UPDATE TABLE SCHEMA
// ========================================

export const tableUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Table name is required')
    .max(50, 'Table name must be 50 characters or less')
    .optional(),
  capacity: z
    .number()
    .int('Capacity must be an integer')
    .min(1, 'Capacity must be at least 1')
    .max(20, 'Capacity cannot exceed 20 seats')
    .optional(),
  shape: tableShapeSchema.optional(),
  x: z
    .number()
    .min(0, 'X coordinate cannot be negative')
    .max(1000, 'X coordinate cannot exceed 1000')
    .optional(),
  y: z
    .number()
    .min(0, 'Y coordinate cannot be negative')
    .max(1000, 'Y coordinate cannot exceed 1000')
    .optional(),
  width: z
    .number()
    .min(0.1, 'Width must be at least 0.1')
    .max(100, 'Width cannot exceed 100')
    .optional(),
  height: z
    .number()
    .min(0.1, 'Height must be at least 0.1')
    .max(100, 'Height cannot exceed 100')
    .optional(),
  sectionId: z.string().uuid('Invalid section ID').optional().nullable(),
  serverId: z.string().uuid('Invalid server ID').optional().nullable(),
});

export type TableUpdateInput = z.infer<typeof tableUpdateSchema>;

// ========================================
// UPDATE TABLE STATUS SCHEMA
// ========================================

export const tableStatusUpdateSchema = z.object({
  status: tableStatusSchema,
});

export type TableStatusUpdateInput = z.infer<typeof tableStatusUpdateSchema>;

// ========================================
// BATCH UPDATE TABLE POSITIONS SCHEMA
// ========================================

export const tablePositionUpdateSchema = z.object({
  tableId: z.string().uuid('Invalid table ID'),
  x: z
    .number()
    .min(0, 'X coordinate cannot be negative')
    .max(1000, 'X coordinate cannot exceed 1000'),
  y: z
    .number()
    .min(0, 'Y coordinate cannot be negative')
    .max(1000, 'Y coordinate cannot exceed 1000'),
});

export const batchPositionUpdateSchema = z.object({
  tables: z.array(tablePositionUpdateSchema).min(1, 'At least one table position is required'),
});

export type BatchPositionUpdateInput = z.infer<typeof batchPositionUpdateSchema>;
export type TablePositionUpdate = z.infer<typeof tablePositionUpdateSchema>;

// ========================================
// SEAT GUESTS SCHEMA
// ========================================

export const seatGuestsSchema = z.object({
  guestCount: z
    .number()
    .int('Guest count must be an integer')
    .min(1, 'At least 1 guest is required'),
});

export type SeatGuestsInput = z.infer<typeof seatGuestsSchema>;

// ========================================
// CLEAR TABLE SCHEMA
// ========================================

export const clearTableSchema = z.object({
  reason: z
    .string()
    .min(1, 'Reason for clearing table is required')
    .max(200, 'Reason must be 200 characters or less')
    .optional(),
});

export type ClearTableInput = z.infer<typeof clearTableSchema>;

// ========================================
// QUERY SCHEMAS
// ========================================

export const tableQuerySchema = z.object({
  locationId: z.string().uuid('Invalid location ID').optional(),
  sectionId: z.string().uuid('Invalid section ID').optional(),
  status: tableStatusSchema.optional(),
  shape: tableShapeSchema.optional(),
  capacity: z
    .number()
    .int('Capacity must be an integer')
    .min(1)
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type TableQueryInput = z.infer<typeof tableQuerySchema>;

// ========================================
// FLOOR PLAN QUERY SCHEMA
// ========================================

export const floorPlanQuerySchema = z.object({
  locationId: z.string().uuid('Location ID is required'),
  sectionId: z.string().uuid('Invalid section ID').optional(),
});

export type FloorPlanQueryInput = z.infer<typeof floorPlanQuerySchema>;

// ========================================
// TABLE SECTION SCHEMAS
// ========================================

export const tableSectionCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Section name is required')
    .max(100, 'Section name must be 100 characters or less'),
});

export type TableSectionCreateInput = z.infer<typeof tableSectionCreateSchema>;

export const tableSectionUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Section name is required')
    .max(100, 'Section name must be 100 characters or less')
    .optional(),
});

export type TableSectionUpdateInput = z.infer<typeof tableSectionUpdateSchema>;
