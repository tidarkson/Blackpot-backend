import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { requirePermission } from '../middleware/requirePermission';
import { authenticatedEndpointLimiter } from '../middleware/rateLimiter';

const router = Router();
const prisma = new PrismaClient();

const FINANCIAL_DEFAULTS = {
  taxRate: new Prisma.Decimal(0.0875),
  taxLabel: 'Tax',
  serviceChargeRate: new Prisma.Decimal(0.0),
  serviceChargeLabel: 'Service Charge',
  serviceChargeApply: false,
  tipPolicy: 'OPTIONAL',
  defaultTipPercent: new Prisma.Decimal(0.18),
  roundingPolicy: 'NONE',
  currencyCode: 'USD',
  currencyLocale: 'en-US',
  currencySymbol: '$',
  payoutSchedule: 'WEEKLY',
} as const;

const TIP_POLICIES = new Set(['OPTIONAL', 'MANDATORY', 'NONE']);
const ROUNDING_POLICIES = new Set(['NONE', 'UP', 'DOWN', 'NEAREST']);
const PAYOUT_SCHEDULES = new Set(['DAILY', 'WEEKLY', 'BIWEEKLY']);

type FinancialSettingsResponse = {
  taxRate: number;
  taxLabel: string;
  serviceChargeRate: number;
  serviceChargeLabel: string;
  serviceChargeApply: boolean;
  tipPolicy: string;
  defaultTipPercent: number;
  roundingPolicy: string;
  currencyCode: string;
  currencyLocale: string;
  currencySymbol: string;
  payoutSchedule: string;
  updatedAt: string;
  updatedBy: string | null;
};

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  return Number(value.toString());
}

function serializeSettings(record: {
  taxRate: Prisma.Decimal;
  taxLabel: string;
  serviceChargeRate: Prisma.Decimal;
  serviceChargeLabel: string;
  serviceChargeApply: boolean;
  tipPolicy: string;
  defaultTipPercent: Prisma.Decimal;
  roundingPolicy: string;
  currencyCode: string;
  currencyLocale: string;
  currencySymbol: string;
  payoutSchedule: string;
  updatedAt: Date;
  updatedBy: string | null;
}): FinancialSettingsResponse {
  return {
    taxRate: decimalToNumber(record.taxRate),
    taxLabel: record.taxLabel,
    serviceChargeRate: decimalToNumber(record.serviceChargeRate),
    serviceChargeLabel: record.serviceChargeLabel,
    serviceChargeApply: record.serviceChargeApply,
    tipPolicy: record.tipPolicy,
    defaultTipPercent: decimalToNumber(record.defaultTipPercent),
    roundingPolicy: record.roundingPolicy,
    currencyCode: record.currencyCode,
    currencyLocale: record.currencyLocale,
    currencySymbol: record.currencySymbol,
    payoutSchedule: record.payoutSchedule,
    updatedAt: record.updatedAt.toISOString(),
    updatedBy: record.updatedBy,
  };
}

function parseDecimalInput(
  value: unknown,
  fieldName: string,
  options?: { min?: number; max?: number }
): Prisma.Decimal {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${fieldName} must be a number`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (typeof options?.min === 'number' && parsed < options.min) {
    throw new Error(`${fieldName} must be at least ${options.min}`);
  }

  if (typeof options?.max === 'number' && parsed > options.max) {
    throw new Error(`${fieldName} must be at most ${options.max}`);
  }

  return new Prisma.Decimal(parsed);
}

function parseStringInput(value: unknown, fieldName: string, maxLength = 64): string {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} cannot be empty`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${maxLength} characters`);
  }

  return normalized;
}

function parseEnumInput(value: unknown, fieldName: string, allowed: Set<string>): string {
  const normalized = parseStringInput(value, fieldName, 24).toUpperCase();
  if (!allowed.has(normalized)) {
    throw new Error(`${fieldName} must be one of: ${Array.from(allowed).join(', ')}`);
  }

  return normalized;
}

function parseBooleanInput(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }

  return value;
}

async function ensureDefaults(tenantId: string) {
  const settings = await prisma.financialSettings.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      ...FINANCIAL_DEFAULTS,
    },
  });

  await prisma.financialSetting.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      taxRate: FINANCIAL_DEFAULTS.taxRate,
      serviceChargeRate: FINANCIAL_DEFAULTS.serviceChargeRate,
      currency: FINANCIAL_DEFAULTS.currencyCode,
      roundingStrategy: FINANCIAL_DEFAULTS.roundingPolicy,
    },
  });

  return settings;
}

router.get(
  '/',
  authenticate,
  ensureTenantAccess,
  requirePermission('tax_settings', 'view'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const settings = await ensureDefaults(tenantId);

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: serializeSettings(settings),
    });
  }
);

router.get(
  '/audit',
  authenticate,
  ensureTenantAccess,
  requirePermission('tax_settings', 'view'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const logs = await prisma.financialAuditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: logs,
    });
  }
);

router.put(
  '/',
  authenticate,
  ensureTenantAccess,
  requirePermission('tax_settings', 'edit'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    const actorId = req.user?.userId;
    const actorName = req.user?.email ?? 'unknown';

    if (!tenantId || !actorId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const current = await ensureDefaults(tenantId);

    const updates: Prisma.FinancialSettingsUpdateInput = {
      updatedBy: actorId,
    };

    try {
      const payload = req.body as Record<string, unknown>;

      if (Object.prototype.hasOwnProperty.call(payload, 'taxRate')) {
        updates.taxRate = parseDecimalInput(payload.taxRate, 'taxRate', { min: 0, max: 1 });
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'taxLabel')) {
        updates.taxLabel = parseStringInput(payload.taxLabel, 'taxLabel', 48);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'serviceChargeRate')) {
        updates.serviceChargeRate = parseDecimalInput(payload.serviceChargeRate, 'serviceChargeRate', { min: 0, max: 1 });
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'serviceChargeLabel')) {
        updates.serviceChargeLabel = parseStringInput(payload.serviceChargeLabel, 'serviceChargeLabel', 48);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'serviceChargeApply')) {
        updates.serviceChargeApply = parseBooleanInput(payload.serviceChargeApply, 'serviceChargeApply');
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'tipPolicy')) {
        updates.tipPolicy = parseEnumInput(payload.tipPolicy, 'tipPolicy', TIP_POLICIES);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'defaultTipPercent')) {
        updates.defaultTipPercent = parseDecimalInput(payload.defaultTipPercent, 'defaultTipPercent', { min: 0, max: 1 });
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'roundingPolicy')) {
        updates.roundingPolicy = parseEnumInput(payload.roundingPolicy, 'roundingPolicy', ROUNDING_POLICIES);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'currencyCode')) {
        updates.currencyCode = parseStringInput(payload.currencyCode, 'currencyCode', 8).toUpperCase();
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'currencyLocale')) {
        updates.currencyLocale = parseStringInput(payload.currencyLocale, 'currencyLocale', 24);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'currencySymbol')) {
        updates.currencySymbol = parseStringInput(payload.currencySymbol, 'currencySymbol', 8);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'payoutSchedule')) {
        updates.payoutSchedule = parseEnumInput(payload.payoutSchedule, 'payoutSchedule', PAYOUT_SCHEDULES);
      }
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid payload',
      });
    }

    const updated = await prisma.financialSettings.update({
      where: { tenantId },
      data: updates,
    });

    const changedFields: Array<{ field: string; oldValue: string; newValue: string }> = [];

    const fieldsToTrack = [
      'taxRate',
      'taxLabel',
      'serviceChargeRate',
      'serviceChargeLabel',
      'serviceChargeApply',
      'tipPolicy',
      'defaultTipPercent',
      'roundingPolicy',
      'currencyCode',
      'currencyLocale',
      'currencySymbol',
      'payoutSchedule',
    ] as const;

    fieldsToTrack.forEach((field) => {
      const previousValue = current[field];
      const nextValue = updated[field];

      const previousString = String(previousValue);
      const nextString = String(nextValue);

      if (previousString !== nextString) {
        changedFields.push({
          field,
          oldValue: previousString,
          newValue: nextString,
        });
      }
    });

    if (changedFields.length > 0) {
      await prisma.financialAuditLog.createMany({
        data: changedFields.map((entry) => ({
          tenantId,
          actorId,
          actorName,
          field: entry.field,
          oldValue: entry.oldValue,
          newValue: entry.newValue,
        })),
      });
    }

    await prisma.financialSetting.upsert({
      where: { tenantId },
      update: {
        taxRate: updated.taxRate,
        serviceChargeRate: updated.serviceChargeRate,
        currency: updated.currencyCode,
        roundingStrategy: updated.roundingPolicy,
      },
      create: {
        tenantId,
        taxRate: updated.taxRate,
        serviceChargeRate: updated.serviceChargeRate,
        currency: updated.currencyCode,
        roundingStrategy: updated.roundingPolicy,
      },
    });

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: serializeSettings(updated),
    });
  }
);

export default router;
