/**
 * Email Controller
 * Testing and management endpoints for email functionality
 */

import { Router, Request, Response } from 'express';
import { templateService, EmailTemplateType } from '../email/services/templateService';
import { emailLogService } from '../email/services/emailLogService';
import { bounceHandlingService } from '../email/services/bounceHandlingService';
import { emailQueue } from '../queues/definitions/email.queue';
import { JOB_NAMES, JobPriority } from '../queues/config/queue.config';
import logger from '../config/logger';
import { sendOrderConfirmationEmail, sendPasswordResetEmail, sendLowStockAlertEmail, sendDailyReportEmail } from '../queues/jobs/emailJobs';

const router = Router();

/**
 * Preview an email template
 * GET /api/email/preview/:template
 */
router.get('/preview/:template', async (req: Request, res: Response) => {
  try {
    const { template } = req.params;
    const { data } = req.query;

    // Parse mock data
    let mockData: Record<string, any> = {
      customerName: 'John Doe',
      userName: 'john@example.com',
      restaurantName: 'The Grill House',
      orderDate: new Date().toLocaleDateString(),
      currentYear: new Date().getFullYear(),
      websiteUrl: process.env.WEBSITE_URL || 'https://blackpot.com',
    };

    if (typeof data === 'string') {
      try {
        mockData = { ...mockData, ...JSON.parse(data) };
      } catch (e) {
        logger.warn('Invalid JSON data provided');
      }
    }

    const html = await templateService.renderTemplate(template as string, mockData);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error('Failed to preview template', error);
    res.status(400).json({
      error: 'Failed to preview template',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * List available templates
 * GET /api/email/templates
 */
router.get('/templates', (req: Request, res: Response) => {
  try {
    const templates = templateService.getAvailableTemplates();
    res.json({
      templates,
      count: templates.length,
    });
  } catch (error) {
    logger.error('Failed to list templates', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * Send test email
 * POST /api/email/test
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { to, template, data, subject } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!to || !tenantId) {
      return res.status(400).json({
        error: 'Missing required fields: to, x-tenant-id header',
      });
    }

    // Queue test email
    const job = await emailQueue.addJob(
      'sendTestEmail',
      {
        to,
        subject: subject || 'Test Email',
        template,
        data: {
          tenantId,
          ...data,
        },
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    res.json({
      success: true,
      message: 'Test email queued successfully',
      jobId: job.id,
      to,
    });
  } catch (error) {
    logger.error('Failed to queue test email', error);
    res.status(500).json({
      error: 'Failed to queue test email',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get email statistics
 * GET /api/email/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { from, to } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing x-tenant-id header',
      });
    }

    const fromDate = from ? new Date(from as string) : undefined;
    const toDate = to ? new Date(to as string) : undefined;

    const stats = await emailLogService.getEmailStats(tenantId, fromDate, toDate);
    const deliveryRate = await emailLogService.getDeliveryRateLast7Days(tenantId);
    const bounceStats = await bounceHandlingService.getBounceStats(tenantId);

    res.json({
      stats,
      deliveryRate,
      bounceStats,
    });
  } catch (error) {
    logger.error('Failed to get email statistics', error);
    res.status(500).json({
      error: 'Failed to get email statistics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get email logs
 * GET /api/email/logs
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    const { status, type, from, to, relatedEntityId, skip = '0', take = '50' } = req.query;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing x-tenant-id header',
      });
    }

    const logs = await emailLogService.getEmailLogs({
      tenantId,
      status: status as any,
      emailType: type as any,
      from: from ? new Date(from as string) : undefined,
      to: to ? new Date(to as string) : undefined,
      relatedEntityId: relatedEntityId as string,
      skip: parseInt(skip as string),
      take: parseInt(take as string),
    });

    res.json({
      logs,
      count: logs.length,
    });
  } catch (error) {
    logger.error('Failed to get email logs', error);
    res.status(500).json({
      error: 'Failed to get email logs',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get email log details
 * GET /api/email/logs/:id
 */
router.get('/logs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const log = await emailLogService.getEmailLog(id as string);

    if (!log) {
      return res.status(404).json({ error: 'Email log not found' });
    }

    res.json(log);
  } catch (error) {
    logger.error('Failed to get email log details', error);
    res.status(500).json({
      error: 'Failed to get email log details',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Get bounced emails
 * GET /api/email/bounces
 */
router.get('/bounces', async (req: Request, res: Response) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId) {
      return res.status(400).json({
        error: 'Missing x-tenant-id header',
      });
    }

    const bounced = await emailLogService.getBouncedEmails(tenantId);

    res.json({
      bounced,
      count: bounced.length,
    });
  } catch (error) {
    logger.error('Failed to get bounced emails', error);
    res.status(500).json({
      error: 'Failed to get bounced emails',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Handle unsubscribe
 * GET /api/email/unsubscribe
 */
router.get('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { token, email } = req.query;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId || !email) {
      return res.status(400).json({
        error: 'Missing required parameters',
      });
    }

    await bounceHandlingService.unsubscribeEmail(email as string, tenantId, 'User unsubscribed');

    res.json({
      success: true,
      message: 'Successfully unsubscribed from emails',
      email,
    });
  } catch (error) {
    logger.error('Failed to unsubscribe', error);
    res.status(500).json({
      error: 'Failed to unsubscribe',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Send order confirmation email
 * POST /api/email/send/order-confirmation
 */
router.post('/send/order-confirmation', async (req: Request, res: Response) => {
  try {
    const { to, orderId, customerName, items, total, estimatedTime } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId || !to || !orderId) {
      return res.status(400).json({
        error: 'Missing required fields: to, orderId, x-tenant-id header',
      });
    }

    await sendOrderConfirmationEmail(
      to,
      orderId,
      customerName || 'Valued Customer',
      items || [],
      total || 0,
      estimatedTime || 30
    );

    res.json({
      success: true,
      message: 'Order confirmation email queued',
      to,
    });
  } catch (error) {
    logger.error('Failed to queue order confirmation email', error);
    res.status(500).json({
      error: 'Failed to queue order confirmation email',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Send password reset email
 * POST /api/email/send/password-reset
 */
router.post('/send/password-reset', async (req: Request, res: Response) => {
  try {
    const { to, userName, resetLink } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId || !to || !resetLink) {
      return res.status(400).json({
        error: 'Missing required fields: to, resetLink, x-tenant-id header',
      });
    }

    await sendPasswordResetEmail(to, userName || 'User', resetLink);

    res.json({
      success: true,
      message: 'Password reset email queued',
      to,
    });
  } catch (error) {
    logger.error('Failed to queue password reset email', error);
    res.status(500).json({
      error: 'Failed to queue password reset email',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Send low stock alert email
 * POST /api/email/send/low-stock-alert
 */
router.post('/send/low-stock-alert', async (req: Request, res: Response) => {
  try {
    const { to, restaurantName, items } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId || !to || !items) {
      return res.status(400).json({
        error: 'Missing required fields: to, items, x-tenant-id header',
      });
    }

    const recipients = Array.isArray(to) ? to : [to];

    await sendLowStockAlertEmail(recipients, restaurantName || 'Restaurant', items);

    res.json({
      success: true,
      message: 'Low stock alert email queued',
      recipients: recipients.length,
    });
  } catch (error) {
    logger.error('Failed to queue low stock alert email', error);
    res.status(500).json({
      error: 'Failed to queue low stock alert email',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Send daily report email
 * POST /api/email/send/daily-report
 */
router.post('/send/daily-report', async (req: Request, res: Response) => {
  try {
    const { to, reportDate, reportData } = req.body;
    const tenantId = req.headers['x-tenant-id'] as string;

    if (!tenantId || !to || !reportData) {
      return res.status(400).json({
        error: 'Missing required fields: to, reportData, x-tenant-id header',
      });
    }

    await sendDailyReportEmail(
      Array.isArray(to) ? to : [to],
      reportDate || new Date().toISOString().split('T')[0],
      reportData
    );

    res.json({
      success: true,
      message: 'Daily report email queued',
    });
  } catch (error) {
    logger.error('Failed to queue daily report email', error);
    res.status(500).json({
      error: 'Failed to queue daily report email',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * Health check for email service
 * GET /api/email/health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const queueSize = (await emailQueue.getQueue().count()) || 0;
    const activeJobs = (await emailQueue.getQueue().getActiveCount()) || 0;
    const failedJobs = (await emailQueue.getQueue().getFailedCount()) || 0;

    res.json({
      status: 'healthy',
      queueSize,
      activeJobs,
      failedJobs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
