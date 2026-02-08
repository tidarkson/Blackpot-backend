import { z } from 'zod';
import { StaffRoleEnum, StaffPositionEnum } from './staff.validator';

/**
 * Schedule/Shift Management Validators
 * Validates all scheduling-related operations
 */

// Shift status enum
export const ShiftStatusEnum = z.enum([
  'SCHEDULED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
]);

export type ShiftStatus = z.infer<typeof ShiftStatusEnum>;

// Conflict types
export const ConflictTypeEnum = z.enum([
  'OVERLAP',
  'OVERTIME',
  'UNAVAILABLE',
  'UNDERSTAFFED',
  'DOUBLE_BOOKING',
]);

export type ConflictType = z.infer<typeof ConflictTypeEnum>;

// Create shift/schedule
export const createScheduleSchema = z.object({
  userId: z.string().uuid('Invalid staff ID'),
  scheduledDate: z.string().datetime('Invalid date format'),
  scheduledStart: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  scheduledEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  roleAssigned: StaffPositionEnum,
  sectionAssigned: z.string().optional(), // For servers
  breakMinutes: z.coerce.number().nonnegative().default(0).optional(),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    // Parse and validate times
    const [startHour, startMin] = data.scheduledStart.split(':').map(Number);
    const [endHour, endMin] = data.scheduledEnd.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shift end time must be after start time',
        path: ['scheduledEnd'],
      });
    }

    // Validate minimum shift duration (at least 1 hour)
    const durationMinutes = endMinutes - startMinutes;
    if (durationMinutes < 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shift must be at least 1 hour long',
        path: ['scheduledEnd'],
      });
    }
  });

export type CreateScheduleRequest = z.infer<typeof createScheduleSchema>;

// Update schedule
export const updateScheduleSchema = z.object({
  scheduledDate: z.string().datetime().optional(),
  scheduledStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  scheduledEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  roleAssigned: StaffPositionEnum.optional(),
  sectionAssigned: z.string().optional(),
  breakMinutes: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
  status: ShiftStatusEnum.optional(),
})
  .superRefine((data, ctx) => {
    if (data.scheduledStart && data.scheduledEnd) {
      const [startHour, startMin] = data.scheduledStart.split(':').map(Number);
      const [endHour, endMin] = data.scheduledEnd.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Shift end time must be after start time',
          path: ['scheduledEnd'],
        });
      }
    }
  });

export type UpdateScheduleRequest = z.infer<typeof updateScheduleSchema>;

// Bulk schedule creation
export const bulkCreateScheduleSchema = z.object({
  schedules: z.array(createScheduleSchema).min(1, 'At least one schedule required'),
  ignoreConflicts: z.boolean().default(false),
});

export type BulkCreateScheduleRequest = z.infer<typeof bulkCreateScheduleSchema>;

// Schedule filters/queries
export const scheduleFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  roleAssigned: StaffPositionEnum.optional(),
  sectionAssigned: z.string().optional(),
  status: ShiftStatusEnum.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  includeConflicts: z.boolean().default(false),
  sortBy: z.enum(['scheduledDate', 'userId', 'roleAssigned']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().positive().max(100).default(20),
  offset: z.coerce.number().nonnegative().default(0),
});

export type ScheduleFilters = z.infer<typeof scheduleFiltersSchema>;

// Clock in/out
export const clockInSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  notes: z.string().optional(),
});

export type ClockInRequest = z.infer<typeof clockInSchema>;

export const clockOutSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  breakMinutes: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export type ClockOutRequest = z.infer<typeof clockOutSchema>;

// Copy previous week
export const copyPreviousWeekSchema = z.object({
  startDate: z.string().datetime('Invalid date format'),
  ignoreConflicts: z.boolean().default(false),
});

export type CopyPreviousWeekRequest = z.infer<typeof copyPreviousWeekSchema>;

// Week view query
export const weekScheduleQuerySchema = z.object({
  date: z.string().datetime('Invalid date format'),
  roleFilter: StaffPositionEnum.optional(),
  includeConflicts: z.boolean().default(true),
});

export type WeekScheduleQuery = z.infer<typeof weekScheduleQuerySchema>;
