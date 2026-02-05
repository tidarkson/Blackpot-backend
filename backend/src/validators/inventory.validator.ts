import { z } from 'zod';

/**
 * Inventory Validators
 * Zod schemas for input validation
 */

// Inventory Item Validators
export const createInventoryItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').max(255),
  category: z.string().min(1, 'Category is required').max(100),
  unit: z.enum(['kg', 'lbs', 'bottles', 'cases', 'pieces', 'liters', 'gallons', 'oz'] as const),
  currentStock: z.number().min(0, 'Current stock must be >= 0'),
  minStock: z.number().min(0, 'Minimum stock must be >= 0'),
  unitCost: z.number().min(0, 'Unit cost must be >= 0'),
  supplierId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.string().min(1).max(100).optional(),
  unit: z.enum(['kg', 'lbs', 'bottles', 'cases', 'pieces', 'liters', 'gallons', 'oz'] as const).optional(),
  minStock: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  supplierId: z.string().optional().or(z.null()),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Stock Adjustment Validator
export const adjustStockSchema = z.object({
  quantity: z.number().int('Quantity must be an integer'),
  movementType: z.enum(['purchase', 'sale', 'waste', 'adjustment'] as const),
  reason: z.string().min(1, 'Reason is required').max(500),
  performedBy: z.string().optional(),
});

// Supplier Validators
export const createSupplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(255),
  contact: z.string().max(255).optional(),
});

export const updateSupplierSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  contact: z.string().max(255).optional(),
});

// Wine Detail Validators
export const createWineDetailSchema = z.object({
  name: z.string().min(1, 'Wine name is required').max(255),
  currentStock: z.number().min(0, 'Current stock must be >= 0'),
  minStock: z.number().min(0, 'Minimum stock must be >= 0'),
  unitCost: z.number().min(0, 'Unit cost must be >= 0'),
  supplierId: z.string().optional(),
  vintage: z.string().min(1, 'Vintage is required').max(10),
  region: z.string().min(1, 'Region is required').max(255),
  varietal: z.string().min(1, 'Varietal is required').max(255),
  binLocation: z.string().min(1, 'Bin location is required').max(100),
  tastingNotes: z.string().max(1000).optional(),
  pairingNotes: z.string().max(1000).optional(),
});

export const updateWineDetailSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  currentStock: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
  supplierId: z.string().optional().or(z.null()),
  vintage: z.string().min(1).max(10).optional(),
  region: z.string().min(1).max(255).optional(),
  varietal: z.string().min(1).max(255).optional(),
  binLocation: z.string().min(1).max(100).optional(),
  tastingNotes: z.string().max(1000).optional(),
  pairingNotes: z.string().max(1000).optional(),
});

// Query Parameters Validators
export const inventoryFiltersSchema = z.object({
  category: z.string().optional(),
  supplierId: z.string().optional(),
  searchTerm: z.string().optional(),
  onlyLowStock: z.boolean().default(false),
});

export const movementHistoryQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).default(50),
});

export const winePairingQuerySchema = z.object({
  mainCourseCategory: z.string().optional(),
});

// Type exports for request bodies
export type CreateInventoryItemRequest = z.infer<typeof createInventoryItemSchema>;
export type UpdateInventoryItemRequest = z.infer<typeof updateInventoryItemSchema>;
export type AdjustStockRequest = z.infer<typeof adjustStockSchema>;
export type CreateSupplierRequest = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierRequest = z.infer<typeof updateSupplierSchema>;
export type CreateWineDetailRequest = z.infer<typeof createWineDetailSchema>;
export type UpdateWineDetailRequest = z.infer<typeof updateWineDetailSchema>;
