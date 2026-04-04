import { PrismaClient } from '@prisma/client';
import { Request, Response, Router } from 'express';

import { authenticate } from '../middleware/auth';
import { authenticatedEndpointLimiter } from '../middleware/rateLimiter';
import { requirePermission } from '../middleware/requirePermission';
import { ensureTenantAccess } from '../middleware/tenantIsolation';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/encryption';

const router = Router();
const prisma = new PrismaClient();

const DATE_FORMATS = new Set(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']);
const TIME_FORMATS = new Set(['12h', '24h']);

interface KdsStation {
  id: string;
  name: string;
  ip: string;
  stationType: string;
}

function normalizeRole(role?: string): string {
  return (role ?? '').toUpperCase();
}

function isOwner(req: Request): boolean {
  return normalizeRole(req.user?.role) === 'OWNER';
}

function parseString(input: unknown, field: string, maxLength = 255): string {
  if (typeof input !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const value = input.trim();
  if (!value) {
    throw new Error(`${field} cannot be empty`);
  }

  if (value.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }

  return value;
}

function parseOptionalString(input: unknown, field: string, maxLength = 2048): string | null {
  if (input == null) {
    return null;
  }

  if (typeof input !== 'string') {
    throw new Error(`${field} must be a string`);
  }

  const value = input.trim();
  if (!value) {
    return null;
  }

  if (value.length > maxLength) {
    throw new Error(`${field} must be at most ${maxLength} characters`);
  }

  return value;
}

function parseOptionalNumber(input: unknown, field: string, min: number, max: number): number | null {
  if (input == null) {
    return null;
  }

  if (typeof input !== 'number' || Number.isNaN(input)) {
    throw new Error(`${field} must be a number`);
  }

  if (input < min || input > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }

  return input;
}

function parseKdsStations(input: unknown): KdsStation[] {
  if (!Array.isArray(input)) {
    throw new Error('kdsStations must be an array');
  }

  return input.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`kdsStations[${index}] must be an object`);
    }

    const item = entry as Partial<KdsStation>;

    return {
      id: parseString(item.id, `kdsStations[${index}].id`, 80),
      name: parseString(item.name, `kdsStations[${index}].name`, 80),
      ip: parseString(item.ip, `kdsStations[${index}].ip`, 120),
      stationType: parseString(item.stationType, `kdsStations[${index}].stationType`, 80),
    };
  });
}

async function ensureTenantSettings(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

  return prisma.tenantSettings.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      restaurantName: tenant?.name ?? 'Restaurant',
    },
  });
}

async function ensureTenantIntegrations(tenantId: string) {
  return prisma.tenantIntegrationSettings.upsert({
    where: { tenantId },
    update: {},
    create: {
      tenantId,
      stripeTestMode: true,
      lowStockThreshold: 5,
    },
  });
}

router.get(
  '/settings',
  authenticate,
  ensureTenantAccess,
  requirePermission('sys_general', 'view'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const settings = await ensureTenantSettings(tenantId);

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: {
        id: settings.id,
        tenantId: settings.tenantId,
        restaurantName: settings.restaurantName,
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
        logoUrl: settings.logoUrl,
        receiptFooter: settings.receiptFooter,
        language: settings.language,
        updatedAt: settings.updatedAt.toISOString(),
      },
    });
  }
);

router.patch(
  '/settings',
  authenticate,
  ensureTenantAccess,
  requirePermission('sys_general', 'edit'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    const actorId = req.user?.userId;
    const actorName = req.user?.email ?? 'unknown';

    if (!tenantId || !actorId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const current = await ensureTenantSettings(tenantId);
    const payload = req.body as Record<string, unknown>;

    const updates: Record<string, unknown> = {};

    try {
      if (Object.prototype.hasOwnProperty.call(payload, 'restaurantName')) {
        updates.restaurantName = parseString(payload.restaurantName, 'restaurantName', 120);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'timezone')) {
        updates.timezone = parseString(payload.timezone, 'timezone', 80);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'dateFormat')) {
        const dateFormat = parseString(payload.dateFormat, 'dateFormat', 24);
        if (!DATE_FORMATS.has(dateFormat)) {
          throw new Error('dateFormat must be one of MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD');
        }

        updates.dateFormat = dateFormat;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'timeFormat')) {
        const timeFormat = parseString(payload.timeFormat, 'timeFormat', 8);
        if (!TIME_FORMATS.has(timeFormat)) {
          throw new Error('timeFormat must be one of 12h, 24h');
        }

        updates.timeFormat = timeFormat;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'logoUrl')) {
        updates.logoUrl = parseOptionalString(payload.logoUrl, 'logoUrl', 100_000);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'receiptFooter')) {
        updates.receiptFooter = parseOptionalString(payload.receiptFooter, 'receiptFooter', 500);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'language')) {
        updates.language = parseString(payload.language, 'language', 12);
      }
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid payload',
      });
    }

    const updated = await prisma.tenantSettings.update({
      where: { tenantId },
      data: updates,
    });

    const changedFields: Array<{ action: string; details: string }> = [];

    (Object.keys(updates) as Array<keyof typeof updated>).forEach((field) => {
      const previousValue = String(current[field as keyof typeof current] ?? '');
      const nextValue = String(updated[field] ?? '');

      if (previousValue !== nextValue) {
        changedFields.push({
          action: `TENANT_SETTINGS_${String(field).toUpperCase()}_UPDATED`,
          details: `${String(field)}: ${previousValue} -> ${nextValue}`,
        });
      }
    });

    if (changedFields.length > 0) {
      await prisma.systemAuditLog.createMany({
        data: changedFields.map((entry) => ({
          tenantId,
          actorId,
          actorName,
          category: 'System',
          action: entry.action,
          details: entry.details,
        })),
      });
    }

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: {
        id: updated.id,
        tenantId: updated.tenantId,
        restaurantName: updated.restaurantName,
        timezone: updated.timezone,
        dateFormat: updated.dateFormat,
        timeFormat: updated.timeFormat,
        logoUrl: updated.logoUrl,
        receiptFooter: updated.receiptFooter,
        language: updated.language,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }
);

router.get(
  '/integrations',
  authenticate,
  ensureTenantAccess,
  requirePermission('integrations', 'view'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    const settings = await ensureTenantIntegrations(tenantId);

    const publishableKey = settings.stripePublishableKeyEnc ? decryptSecret(settings.stripePublishableKeyEnc) : '';
    const webhookSecret = settings.stripeWebhookSecretEnc ? decryptSecret(settings.stripeWebhookSecretEnc) : '';
    const slackWebhook = settings.slackWebhookUrlEnc ? decryptSecret(settings.slackWebhookUrlEnc) : '';

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: {
        stripePublishableKeyMasked: maskSecret(publishableKey),
        stripeWebhookSecretMasked: maskSecret(webhookSecret),
        stripeTestMode: settings.stripeTestMode,
        stripeConnectionStatus: publishableKey ? 'connected' : 'not_configured',
        printerIp: settings.printerIp,
        printerPort: settings.printerPort,
        kdsStations: (settings.kdsStations as KdsStation[] | null) ?? [],
        lowStockThreshold: settings.lowStockThreshold,
        alertsEmail: settings.alertsEmail,
        slackWebhookUrlMasked: maskSecret(slackWebhook),
        updatedAt: settings.updatedAt.toISOString(),
      },
    });
  }
);

router.patch(
  '/integrations',
  authenticate,
  ensureTenantAccess,
  requirePermission('integrations', 'edit'),
  authenticatedEndpointLimiter,
  async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    const actorId = req.user?.userId;
    const actorName = req.user?.email ?? 'unknown';

    if (!tenantId || !actorId) {
      return res.status(401).json({ status: 'error', code: 401, message: 'Unauthorized' });
    }

    if (!isOwner(req)) {
      return res.status(403).json({ status: 'error', code: 403, message: 'Only OWNER can update integrations' });
    }

    const current = await ensureTenantIntegrations(tenantId);
    const payload = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};

    try {
      if (Object.prototype.hasOwnProperty.call(payload, 'stripePublishableKey')) {
        const value = parseOptionalString(payload.stripePublishableKey, 'stripePublishableKey', 400);
        updates.stripePublishableKeyEnc = value ? encryptSecret(value) : null;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'stripeWebhookSecret')) {
        const value = parseOptionalString(payload.stripeWebhookSecret, 'stripeWebhookSecret', 400);
        updates.stripeWebhookSecretEnc = value ? encryptSecret(value) : null;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'stripeTestMode')) {
        if (typeof payload.stripeTestMode !== 'boolean') {
          throw new Error('stripeTestMode must be a boolean');
        }

        updates.stripeTestMode = payload.stripeTestMode;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'printerIp')) {
        updates.printerIp = parseOptionalString(payload.printerIp, 'printerIp', 120);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'printerPort')) {
        updates.printerPort = parseOptionalNumber(payload.printerPort, 'printerPort', 1, 65_535);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'kdsStations')) {
        updates.kdsStations = parseKdsStations(payload.kdsStations);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'lowStockThreshold')) {
        const value = parseOptionalNumber(payload.lowStockThreshold, 'lowStockThreshold', 1, 500);
        updates.lowStockThreshold = value ?? 5;
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'alertsEmail')) {
        updates.alertsEmail = parseOptionalString(payload.alertsEmail, 'alertsEmail', 254);
      }

      if (Object.prototype.hasOwnProperty.call(payload, 'slackWebhookUrl')) {
        const value = parseOptionalString(payload.slackWebhookUrl, 'slackWebhookUrl', 400);
        updates.slackWebhookUrlEnc = value ? encryptSecret(value) : null;
      }
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        message: error instanceof Error ? error.message : 'Invalid payload',
      });
    }

    const updated = await prisma.tenantIntegrationSettings.update({
      where: { tenantId },
      data: updates,
    });

    if (Object.keys(updates).length > 0) {
      await prisma.systemAuditLog.create({
        data: {
          tenantId,
          actorId,
          actorName,
          category: 'System',
          action: 'TENANT_INTEGRATIONS_UPDATED',
          details: `Updated fields: ${Object.keys(updates).join(', ')}`,
        },
      });
    }

    const publishableKey = updated.stripePublishableKeyEnc ? decryptSecret(updated.stripePublishableKeyEnc) : '';
    const webhookSecret = updated.stripeWebhookSecretEnc ? decryptSecret(updated.stripeWebhookSecretEnc) : '';
    const slackWebhook = updated.slackWebhookUrlEnc ? decryptSecret(updated.slackWebhookUrlEnc) : '';

    return res.status(200).json({
      status: 'success',
      code: 200,
      data: {
        stripePublishableKeyMasked: maskSecret(publishableKey),
        stripeWebhookSecretMasked: maskSecret(webhookSecret),
        stripeTestMode: updated.stripeTestMode,
        stripeConnectionStatus: publishableKey ? 'connected' : 'not_configured',
        printerIp: updated.printerIp,
        printerPort: updated.printerPort,
        kdsStations: (updated.kdsStations as KdsStation[] | null) ?? [],
        lowStockThreshold: updated.lowStockThreshold,
        alertsEmail: updated.alertsEmail,
        slackWebhookUrlMasked: maskSecret(slackWebhook),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  }
);

export default router;
