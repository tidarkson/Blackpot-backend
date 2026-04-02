import { z } from 'zod';
import { OrderStatus, CourseType } from '@prisma/client';

// Create Order
export const createOrderSchema = z.object({
  tableId: z.string().uuid('Invalid table ID'),
  serverId: z.string().uuid('Invalid server ID'),
  guestCount: z.number().int().min(1, 'Guest count must be at least 1'),
});
export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

// Update Order
export const updateOrderSchema = z.object({
  guestCount: z.number().int().min(1).optional(),
  serverId: z.string().uuid().optional(),
});
export type UpdateOrderRequest = z.infer<typeof updateOrderSchema>;

// Add Course
export const addCourseSchema = z.object({
  courseType: z.enum(['APPETIZER', 'MAIN', 'DESSERT', 'BEVERAGE'] as const),
  kitchenStationId: z.string().uuid().optional(),
});
export type AddCourseRequest = z.infer<typeof addCourseSchema>;

// Add Item to Order
export const addItemToOrderSchema = z.object({
  courseId: z.string().uuid('Invalid course ID'),
  menuItemId: z.string().uuid('Invalid menu item ID'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  notes: z.string().max(500, 'Notes must be 500 characters or less').optional(),
});
export type AddItemToOrderRequest = z.infer<typeof addItemToOrderSchema>;

// Update Order Item
export const updateOrderItemSchema = z.object({
  quantity: z.number().int().min(1).optional(),
  notes: z.string().max(500).optional(),
});
export type UpdateOrderItemRequest = z.infer<typeof updateOrderItemSchema>;

// Update Order Status
export const updateOrderStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'READY', 'COMPLETED', 'PAID', 'CLOSED', 'CANCELLED'] as const),
});
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusSchema>;

// Force close order (manager/owner only)
export const forceCloseOrderSchema = z.object({
  reason: z.string().trim().min(5, 'Force-close reason is required').max(500),
});
export type ForceCloseOrderRequest = z.infer<typeof forceCloseOrderSchema>;

// Add Special Request
export const addSpecialRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100),
  description: z.string().max(500, 'Description must be 500 characters or less').optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
});
export type AddSpecialRequestRequest = z.infer<typeof addSpecialRequestSchema>;

// Update Special Request
export const updateSpecialRequestSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']).optional(),
});
export type UpdateSpecialRequestRequest = z.infer<typeof updateSpecialRequestSchema>;

// Fire Course
export const fireCourseSchema = z.object({
  kitchenStationId: z.string().uuid('Invalid kitchen station ID'),
  notes: z.string().max(500).optional(),
});
export type FireCourseRequest = z.infer<typeof fireCourseSchema>;

// Complete Course
export const completeCourseSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type CompleteCourseRequest = z.infer<typeof completeCourseSchema>;

// List Orders Query
export const listOrdersSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'READY', 'COMPLETED', 'PAID', 'CLOSED', 'CANCELLED']).optional(),
  tableId: z.string().uuid().optional(),
  serverId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListOrdersRequest = z.infer<typeof listOrdersSchema>;

// Kitchen Orders Query
export const listKitchenOrdersSchema = z.object({
  stationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListKitchenOrdersRequest = z.infer<typeof listKitchenOrdersSchema>;
