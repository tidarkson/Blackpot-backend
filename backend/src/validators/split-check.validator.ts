import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Validator for creating an equal split
 * - numPeople: 2-10 people
 */
export const equalSplitSchema = z.object({
  numPeople: z
    .number()
    .int('Number of people must be an integer')
    .min(2, 'Must have at least 2 people in a split')
    .max(10, 'Cannot split bill among more than 10 people'),
});

export type EqualSplitRequest = z.infer<typeof equalSplitSchema>;

/**
 * Validator for item-based split
 * - Array of person assignments with item IDs
 */
export const itemSplitSchema = z
  .object({
    personNumber: z.number().int('Person number must be an integer').positive(),
    itemIds: z
      .array(z.string().uuid('Each item ID must be a valid UUID'))
      .min(1, 'Each person must have at least one item'),
  })
  .array()
  .min(2, 'Must split among at least 2 people')
  .refine(
    (assignments) => {
      // Check no duplicate person numbers
      const personNumbers = new Set(assignments.map((a) => a.personNumber));
      return personNumbers.size === assignments.length;
    },
    'Each person can only appear once in item assignments'
  )
  .refine(
    (assignments) => {
      // Check no duplicate item IDs
      const itemIds = new Set<string>();
      for (const assignment of assignments) {
        for (const itemId of assignment.itemIds) {
          if (itemIds.has(itemId)) {
            return false; // Item assigned to multiple people
          }
          itemIds.add(itemId);
        }
      }
      return true;
    },
    'Each item can only be assigned to one person'
  );

export type ItemSplitRequest = z.infer<typeof itemSplitSchema>;

/**
 * Validator for custom split
 * - Array of person amounts that must sum to order total
 */
export const customSplitSchema = z
  .object({
    personNumber: z.number().int('Person number must be an integer').positive(),
    amount: z
      .union([
        z.number().positive('Amount must be greater than 0'),
        z.string().regex(/^\d+(\.\d{2})?$/, 'Amount must be a valid decimal (e.g., 25.50)'),
      ])
      .transform((val) => new Decimal(val.toString())),
  })
  .array()
  .min(2, 'Must split among at least 2 people');

export type CustomSplitRequest = z.infer<typeof customSplitSchema>;

/**
 * Validator for recording a split payment
 */
export const splitPaymentSchema = z.object({
  splitPaymentId: z.string().uuid('Split payment ID must be a valid UUID'),
  amount: z
    .union([
      z.number().positive('Amount must be greater than 0'),
      z.string().regex(/^\d+(\.\d{2})?$/, 'Amount must be a valid decimal (e.g., 25.50)'),
    ])
    .transform((val) => new Decimal(val.toString())),
  method: z
    .enum(['CASH', 'CARD', 'TRANSFER', 'VOUCHER', 'MOBILE_WALLET'])
    .default('CARD'),
  reference: z.string().optional(),
  cardLastFour: z.string().regex(/^\d{4}$/, 'Card last four must be 4 digits').optional(),
});

export type SplitPaymentRequest = z.infer<typeof splitPaymentSchema>;

/**
 * Validator for split request - route parameter
 */
export const splitIdSchema = z.object({
  splitId: z.string().uuid('Split ID must be a valid UUID'),
});

export type SplitIdRequest = z.infer<typeof splitIdSchema>;

/**
 * Validator for order ID - route parameter
 */
export const orderIdSchema = z.object({
  orderId: z.string().uuid('Order ID must be a valid UUID'),
});

export type OrderIdRequest = z.infer<typeof orderIdSchema>;

/**
 * Generic request body validator for split creation
 * Handles equal, item, and custom splits
 */
export const createSplitSchema = z.discriminatedUnion('splitType', [
  z.object({
    splitType: z.literal('equal'),
    splitData: equalSplitSchema,
  }),
  z.object({
    splitType: z.literal('item'),
    splitData: itemSplitSchema,
  }),
  z.object({
    splitType: z.literal('custom'),
    splitData: customSplitSchema,
  }),
]);

export type CreateSplitRequest = z.infer<typeof createSplitSchema>;
