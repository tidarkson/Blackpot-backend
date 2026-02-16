import { z } from 'zod';
import { StaffRoleEnum } from './staff.validator';

/**
 * Shift Templates & Coverage Requirements Validators
 */

// Shift Template
export const createShiftTemplateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  roleRequired: StaffRoleEnum,
  dayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday, 6 = Saturday
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format'),
  breakMinutes: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    const [startHour, startMin] = data.startTime.split(':').map(Number);
    const [endHour, endMin] = data.endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (endMinutes <= startMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: ['endTime'],
      });
    }
  });

export type CreateShiftTemplateRequest = z.infer<typeof createShiftTemplateSchema>;

// Update schema - cannot use .omit() on refined schemas, so define separately
export const updateShiftTemplateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  roleRequired: StaffRoleEnum.optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format').optional(),
  breakMinutes: z.coerce.number().nonnegative().default(0).optional(),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    // Only validate times if both are provided
    if (data.startTime && data.endTime) {
      const [startHour, startMin] = data.startTime.split(':').map(Number);
      const [endHour, endMin] = data.endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time must be after start time',
          path: ['endTime'],
        });
      }
    }
  });

export type UpdateShiftTemplateRequest = z.infer<typeof updateShiftTemplateSchema>;

// Coverage Requirement
export const createCoverageRequirementSchema = z.object({
  roleRequired: StaffRoleEnum,
  minimumStaff: z.coerce.number().positive('Minimum staff must be positive'),
  dayOfWeek: z.number().int().min(0).max(6).optional(), // NULL = all days
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime) {
      const [startHour, startMin] = data.startTime.split(':').map(Number);
      const [endHour, endMin] = data.endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time must be after start time',
          path: ['endTime'],
        });
      }
    }
  });

export type CreateCoverageRequirementRequest = z.infer<typeof createCoverageRequirementSchema>;

// Update schema - cannot use .partial() on refined schemas, so define separately
export const updateCoverageRequirementSchema = z.object({
  roleRequired: StaffRoleEnum.optional(),
  minimumStaff: z.coerce.number().positive('Minimum staff must be positive').optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().optional(),
})
  .superRefine((data, ctx) => {
    // Only validate times if both are provided
    if (data.startTime && data.endTime) {
      const [startHour, startMin] = data.startTime.split(':').map(Number);
      const [endHour, endMin] = data.endTime.split(':').map(Number);

      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;

      if (endMinutes <= startMinutes) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'End time must be after start time',
          path: ['endTime'],
        });
      }
    }
  });

export type UpdateCoverageRequirementRequest = z.infer<typeof updateCoverageRequirementSchema>;

// List filters
export const templateFiltersSchema = z.object({
  roleRequired: StaffRoleEnum.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
  limit: z.coerce.number().positive().max(100).default(20),
  offset: z.coerce.number().nonnegative().default(0),
});

export type TemplateFilters = z.infer<typeof templateFiltersSchema>;

export const coverageFiltersSchema = z.object({
  roleRequired: StaffRoleEnum.optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  limit: z.coerce.number().positive().max(100).default(20),
  offset: z.coerce.number().nonnegative().default(0),
});

export type CoverageFilters = z.infer<typeof coverageFiltersSchema>;

// Apply template
export const applyTemplateSchema = z.object({
  templateId: z.string().uuid('Invalid template ID'),
  startDate: z.string().datetime('Invalid date format'),
  endDate: z.string().datetime('Invalid date format'),
  assignToUserIds: z.array(z.string().uuid()).optional(), // If empty, auto-assign
  ignoreConflicts: z.boolean().default(false),
});

export type ApplyTemplateRequest = z.infer<typeof applyTemplateSchema>;

export const applyMultipleTemplatesSchema = z.object({
  templateIds: z.array(z.string().uuid('Invalid template ID')).min(1),
  startDate: z.string().datetime('Invalid date format'),
  endDate: z.string().datetime('Invalid date format'),
  assignToUserIds: z.array(z.string().uuid()).optional(), // If empty, auto-assign
  ignoreConflicts: z.boolean().default(false),
});

export type ApplyMultipleTemplatesRequest = z.infer<typeof applyMultipleTemplatesSchema>;
