import { z } from 'zod';

/**
 * Cash Session Validation Schemas
 * 
 * Zod schemas for validating cash session operations
 * Ensures precision-safe currency handling and data integrity
 */

// Open cash session schema
export const OpenCashSessionSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  openingCash: z.union([z.number().positive('Opening cash must be positive'), z.string()]).transform((val) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num) || num < 0) throw new Error('Invalid opening cash amount');
    return num.toString();
  }),
});

export type OpenCashSessionRequest = z.infer<typeof OpenCashSessionSchema>;

// Close cash session schema
export const CloseCashSessionSchema = z.object({
  closingCash: z
    .union([z.number().positive('Closing cash must be positive'), z.string()])
    .transform((val) => {
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (isNaN(num) || num < 0) throw new Error('Invalid closing cash amount');
      return num.toString();
    }),
  actualCard: z
    .union([z.number().nonnegative('Card amount must be non-negative'), z.string()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      if (isNaN(num) || num < 0) throw new Error('Invalid card amount');
      return num.toString();
    }),
  cashDenominations: z
    .record(z.string(), z.number().nonnegative('Denomination quantity must be non-negative'))
    .optional()
    .describe('Breakdown by denomination: {"50": 10, "100": 5, "500": 2, "1000": 1}'),
});

export type CloseCashSessionRequest = z.infer<typeof CloseCashSessionSchema>;

// Review cash session schema
export const ReviewCashSessionSchema = z.object({
  managerNotes: z
    .string()
    .min(5, 'Manager notes must be at least 5 characters')
    .max(500, 'Manager notes must not exceed 500 characters'),
  approved: z.boolean().describe('Whether manager approves this session'),
});

export type ReviewCashSessionRequest = z.infer<typeof ReviewCashSessionSchema>;

// Date range filter schema
export const CashSessionDateRangeSchema = z.object({
  startDate: z.string().datetime('Invalid start date format'),
  endDate: z.string().datetime('Invalid end date format'),
});

export type CashSessionDateRangeRequest = z.infer<typeof CashSessionDateRangeSchema>;

// Discrepancy report query schema
export const DiscrepancyReportSchema = z.object({
  startDate: z.string().describe('Report start date (ISO format: YYYY-MM-DD)'),
  endDate: z.string().describe('Report end date (ISO format: YYYY-MM-DD)'),
});

export type DiscrepancyReportRequest = z.infer<typeof DiscrepancyReportSchema>;

/**
 * Async validation helpers
 */

export const validateOpenCashSession = async (data: unknown) => {
  return OpenCashSessionSchema.parseAsync(data);
};

export const validateCloseCashSession = async (data: unknown) => {
  return CloseCashSessionSchema.parseAsync(data);
};

export const validateReviewCashSession = async (data: unknown) => {
  return ReviewCashSessionSchema.parseAsync(data);
};

export const validateCashSessionDateRange = async (data: unknown) => {
  return CashSessionDateRangeSchema.parseAsync(data);
};
