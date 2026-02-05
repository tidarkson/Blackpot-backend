import { z } from 'zod';

/**
 * Staff Management Validators
 * Validates all staff-related operations
 */

// Enum for staff roles
export const StaffRoleEnum = z.enum([
  'SERVER',
  'COOK',
  'MANAGER',
  'HOST',
  'BARTENDER',
  'SOMMELIER',
  'DISHWASHER',
  'CASHIER',
]);

export type StaffRole = z.infer<typeof StaffRoleEnum>;

// Weekly availability structure
export const DayAvailabilitySchema = z.object({
  available: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
});

export const AvailabilitySchema = z.object({
  monday: DayAvailabilitySchema.optional(),
  tuesday: DayAvailabilitySchema.optional(),
  wednesday: DayAvailabilitySchema.optional(),
  thursday: DayAvailabilitySchema.optional(),
  friday: DayAvailabilitySchema.optional(),
  saturday: DayAvailabilitySchema.optional(),
  sunday: DayAvailabilitySchema.optional(),
});

// Create staff validation
export const createStaffSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: StaffRoleEnum,
  locationId: z.string().uuid('Invalid location ID'),
  phone: z.string().optional(),
  hourlyRate: z.coerce.number().positive('Hourly rate must be positive').optional(),
  hireDate: z.string().datetime().optional(),
  availability: AvailabilitySchema.optional(),
});

export type CreateStaffRequest = z.infer<typeof createStaffSchema>;

// Update staff validation
export const updateStaffSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  role: StaffRoleEnum.optional(),
  phone: z.string().optional(),
  hourlyRate: z.coerce.number().positive('Hourly rate must be positive').optional(),
  hireDate: z.string().datetime().optional(),
  availability: AvailabilitySchema.optional(),
  isActive: z.boolean().optional(),
});

export type UpdateStaffRequest = z.infer<typeof updateStaffSchema>;

// Bulk operations
export const bulkStaffOperationSchema = z.object({
  staffIds: z.array(z.string().uuid('Invalid staff ID')).min(1, 'At least one staff ID required'),
  action: z.enum(['ACTIVATE', 'DEACTIVATE', 'REASSIGN_LOCATION']),
  locationId: z.string().uuid('Invalid location ID').optional(),
});

export type BulkStaffOperation = z.infer<typeof bulkStaffOperationSchema>;

// Availability update
export const updateAvailabilitySchema = z.object({
  availability: AvailabilitySchema,
});

export type UpdateAvailabilityRequest = z.infer<typeof updateAvailabilitySchema>;

// List filters
export const listStaffFiltersSchema = z.object({
  role: StaffRoleEnum.optional(),
  locationId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(), // Search by name or email
  sortBy: z.enum(['name', 'hireDate', 'hourlyRate']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().positive().max(100).default(20),
  offset: z.coerce.number().nonnegative().default(0),
});

export type ListStaffFilters = z.infer<typeof listStaffFiltersSchema>;
