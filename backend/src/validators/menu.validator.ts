import { z } from 'zod';

// ========================================
// MENU VALIDATORS
// ========================================

export const menuCreateSchema = z.object({
  name: z
    .string()
    .min(1, 'Menu name is required')
    .max(100, 'Menu name must be at most 100 characters'),
  isActive: z.boolean().optional().default(true),
});

export const menuUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Menu name is required')
    .max(100, 'Menu name must be at most 100 characters')
    .optional(),
  isActive: z.boolean().optional(),
  version: z.number().optional(),
});

export const menuIdSchema = z.object({
  id: z.string().uuid('Invalid menu ID'),
});

// ========================================
// MENU SECTION VALIDATORS
// ========================================

export const menuSectionCreateSchema = z.object({
  menuId: z.string().uuid('Invalid menu ID'),
  name: z
    .string()
    .min(1, 'Section name is required')
    .max(100, 'Section name must be at most 100 characters'),
  position: z.number().int('Position must be an integer').positive('Position must be positive'),
});

export const menuSectionUpdateSchema = z.object({
  name: z
    .string()
    .min(1, 'Section name is required')
    .max(100, 'Section name must be at most 100 characters')
    .optional(),
  position: z.number().int('Position must be an integer').positive('Position must be positive').optional(),
});

export const menuSectionIdSchema = z.object({
  id: z.string().uuid('Invalid section ID'),
});

// ========================================
// MENU ITEM VALIDATORS
// ========================================

export const menuItemCreateSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID'),
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(100, 'Item name must be at most 100 characters'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .nullable(),
  price: z
    .number()
    .positive('Price must be a positive number')
    .max(999999.99, 'Price must be at most 999999.99'),
  isAvailable: z.boolean().optional().default(true),
});

export const menuItemUpdateSchema = z.object({
  sectionId: z.string().uuid('Invalid section ID').optional(),
  name: z
    .string()
    .min(1, 'Item name is required')
    .max(100, 'Item name must be at most 100 characters')
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .nullable(),
  price: z
    .number()
    .positive('Price must be a positive number')
    .max(999999.99, 'Price must be at most 999999.99')
    .optional(),
  isAvailable: z.boolean().optional(),
});

export const menuItemIdSchema = z.object({
  id: z.string().uuid('Invalid item ID'),
});

// ========================================
// QUERY PARAMETER VALIDATORS
// ========================================

export const paginationSchema = z.object({
  page: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive('Page must be positive'))
    .optional()
    .default(() => 1),
  pageSize: z
    .string()
    .transform((val) => parseInt(val, 10))
    .pipe(
      z.number().int().refine(
        (val) => [10, 25, 50, 100].includes(val),
        'Page size must be one of: 10, 25, 50, 100'
      )
    )
    .optional()
    .default(() => 25),
});

export const menuSearchSchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .optional(),
  sort: z
    .enum(['name', 'createdAt'])
    .optional()
    .default('createdAt'),
});

export const menuSectionSearchSchema = paginationSchema.extend({
  menuId: z.string().uuid('Invalid menu ID').optional(),
  search: z.string().optional(),
  sort: z
    .enum(['name', 'position'])
    .optional()
    .default('position'),
});

export const menuItemSearchSchema = paginationSchema.extend({
  search: z.string().optional(),
  sectionId: z.string().uuid('Invalid section ID').optional(),
  isAvailable: z
    .string()
    .transform((val) => val === 'true')
    .pipe(z.boolean())
    .optional(),
  minPrice: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().nonnegative('Min price must be non-negative'))
    .optional(),
  maxPrice: z
    .string()
    .transform((val) => parseFloat(val))
    .pipe(z.number().positive('Max price must be positive'))
    .optional(),
  sort: z
    .enum(['name', 'price', 'createdAt'])
    .optional()
    .default('name'),
});

// ========================================
// INFERRED TYPES
// ========================================

export type MenuCreateInput = z.infer<typeof menuCreateSchema>;
export type MenuUpdateInput = z.infer<typeof menuUpdateSchema>;
export type MenuIdInput = z.infer<typeof menuIdSchema>;

export type MenuSectionCreateInput = z.infer<typeof menuSectionCreateSchema>;
export type MenuSectionUpdateInput = z.infer<typeof menuSectionUpdateSchema>;
export type MenuSectionIdInput = z.infer<typeof menuSectionIdSchema>;

export type MenuItemCreateInput = z.infer<typeof menuItemCreateSchema>;
export type MenuItemUpdateInput = z.infer<typeof menuItemUpdateSchema>;
export type MenuItemIdInput = z.infer<typeof menuItemIdSchema>;

export type PaginationParams = z.infer<typeof paginationSchema>;
export type MenuSearchParams = z.infer<typeof menuSearchSchema>;
export type MenuSectionSearchParams = z.infer<typeof menuSectionSearchSchema>;
export type MenuItemSearchParams = z.infer<typeof menuItemSearchSchema>;
