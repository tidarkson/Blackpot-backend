import { z } from 'zod';

/**
 * Customer Validators
 * Zod schemas for validating customer management API requests
 */

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
  .min(10, 'Phone number must be at least 10 digits')
  .max(20, 'Phone number must not exceed 20 characters')
  .regex(
    /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
    'Invalid phone format'
  );

/**
 * Email validation
 */
const emailSchema = z
  .string()
  .email('Invalid email format')
  .toLowerCase()
  .optional();

/**
 * Customer name validation
 */
const nameSchema = z
  .string()
  .min(2, 'Customer name must be at least 2 characters')
  .max(100, 'Customer name must not exceed 100 characters')
  .regex(
    /^[a-zA-Z\s'-]+$/,
    'Name can only contain letters, spaces, hyphens, and apostrophes'
  );

/**
 * Tags validation (e.g., 'anniversary', 'business', 'vip')
 */
const tagsSchema = z
  .array(z.string().max(50))
  .optional()
  .default([]);

/**
 * Notes validation (staff notes)
 */
const notesSchema = z
  .string()
  .max(1000, 'Notes must not exceed 1000 characters')
  .optional();

/**
 * Customer preferences schema
 */
const preferencesSchema = z
  .object({
    dietaryRestrictions: z
      .array(z.string())
      .default([])
      .optional(),
    favoriteItems: z
      .array(z.string())
      .default([])
      .optional(),
    seatingPreference: z
      .string()
      .max(100)
      .optional(),
    winePreferences: z
      .array(z.string())
      .default([])
      .optional(),
    allergies: z
      .array(z.string())
      .default([])
      .optional(),
    specialOccasions: z
      .array(
        z.object({
          type: z.string().max(50),
          date: z.string().datetime().optional(),
        })
      )
      .optional(),
    notes: z
      .string()
      .max(500)
      .optional(),
  })
  .optional();

/**
 * VIP tier validation
 */
const vipTierSchema = z
  .enum(['GOLD', 'PLATINUM', 'DIAMOND'])
  .optional()
  .nullable();

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .default(1)
    .catch(1),
  pageSize: z
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size cannot exceed 100')
    .default(25)
    .catch(25),
});

// ========================================
// CREATE CUSTOMER SCHEMA
// ========================================

export const createCustomerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  preferences: preferencesSchema,
  tags: tagsSchema,
  notes: notesSchema,
});

export type CreateCustomerRequest = z.infer<typeof createCustomerSchema>;

// ========================================
// UPDATE CUSTOMER SCHEMA
// ========================================

export const updateCustomerSchema = z.object({
  name: nameSchema.optional(),
  email: emailSchema,
  preferences: preferencesSchema,
  tags: tagsSchema,
  notes: notesSchema,
  vipStatus: z.boolean().optional(),
  vipTier: vipTierSchema,
});

export type UpdateCustomerRequest = z.infer<typeof updateCustomerSchema>;

// ========================================
// UPDATE VIP STATUS SCHEMA
// ========================================

export const updateVipStatusSchema = z.object({
  vipStatus: z.boolean(),
  vipTier: vipTierSchema,
});

export type UpdateVipStatusRequest = z.infer<typeof updateVipStatusSchema>;

// ========================================
// PREFERENCES SCHEMA
// ========================================

export const updatePreferencesSchema = z.object({
  dietaryRestrictions: z
    .array(z.string().max(50))
    .default([])
    .optional(),
  favoriteItems: z
    .array(z.string().max(100))
    .default([])
    .optional(),
  seatingPreference: z
    .string()
    .max(100)
    .optional(),
  winePreferences: z
    .array(z.string().max(100))
    .default([])
    .optional(),
  allergies: z
    .array(z.string().max(100))
    .default([])
    .optional(),
  specialOccasions: z
    .array(
      z.object({
        type: z.enum(['birthday', 'anniversary', 'engagement', 'other']),
        date: z.string().datetime().optional(),
      })
    )
    .default([])
    .optional(),
  notes: z
    .string()
    .max(500)
    .optional(),
});

export type UpdatePreferencesRequest = z.infer<typeof updatePreferencesSchema>;

// ========================================
// SEARCH SCHEMA
// ========================================

export const customerSearchSchema = z.object({
  q: z
    .string()
    .min(2, 'Search query must be at least 2 characters')
    .max(100, 'Search query must not exceed 100 characters'),
  type: z
    .enum(['name', 'phone', 'email', 'all'])
    .default('all')
    .optional(),
  page: z
    .number()
    .int()
    .min(1, 'Page must be at least 1')
    .default(1)
    .catch(1),
  pageSize: z
    .number()
    .int()
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size cannot exceed 100')
    .default(25)
    .catch(25),
});

export type CustomerSearchRequest = z.infer<typeof customerSearchSchema>;

// ========================================
// MERGE CUSTOMERS SCHEMA
// ========================================

export const mergeCustomersSchema = z.object({
  confirm: z
    .boolean()
    .refine((val) => val === true, 'Merge must be confirmed with confirm=true'),
});

export type MergeCustomersRequest = z.infer<typeof mergeCustomersSchema>;

// ========================================
// GDPR DELETE SCHEMA
// ========================================

export const gdprDeleteSchema = z.object({
  confirm: z
    .boolean()
    .refine(
      (val) => val === true,
      'GDPR deletion must be confirmed with confirm=true'
    ),
});

export type GdprDeleteRequest = z.infer<typeof gdprDeleteSchema>;
