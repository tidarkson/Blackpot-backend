/**
 * Jobs Controller
 * API endpoints for job queue management and monitoring
 */

import { Request, Response } from 'express';
import { queueService, QueueStats } from '../services/queue.service';
import logger from '../config/logger';
import {
  sendOrderConfirmationEmail,
  sendPasswordResetEmail,
  sendLowStockAlertEmail,
} from '../queues/jobs/emailJobs';
import {
  generateFinancialReport,
  generateSalesAnalytics,
  generateInventorySummary,
  generateStaffPerformance,
  exportData,
} from '../queues/jobs/reportJobs';
import {
  reconcileInventory,
  processPaymentSettlement,
  cleanupDatabase,
} from '../queues/jobs/dataJobs';

export class JobsController {
  /**
   * GET /api/jobs/stats
   * Get statistics for all queues
   */
  async getQueueStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await queueService.getQueueStats();
      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching queue stats:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch queue stats',
      });
    }
  }

  /**
   * GET /api/jobs/health
   * Get overall queue health status
   */
  async getQueueHealth(req: Request, res: Response): Promise<void> {
    try {
      const health = await queueService.getQueueHealth();
      res.json({
        status: 'success',
        data: health,
      });
    } catch (error) {
      logger.error('Error fetching queue health:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch queue health',
      });
    }
  }

  /**
   * GET /api/jobs/:queueName/stats
   * Get stats for a specific queue
   */
  async getQueueStatsByName(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const stats = await queueService.getQueueStatsByName(queueName);

      if (!stats) {
        res.status(404).json({
          status: 'error',
          message: `Queue ${queueName} not found`,
        });
        return;
      }

      res.json({
        status: 'success',
        data: stats,
      });
    } catch (error) {
      logger.error('Error fetching queue stats:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch queue stats',
      });
    }
  }

  /**
   * GET /api/jobs/:queueName/failed
   * Get failed jobs in a queue
   */
  async getFailedJobs(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const failedJobs = await queueService.getFailedJobs(queueName, limit);

      res.json({
        status: 'success',
        data: {
          queueName,
          count: failedJobs.length,
          jobs: failedJobs,
        },
      });
    } catch (error) {
      logger.error('Error fetching failed jobs:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch failed jobs',
      });
    }
  }

  /**
   * GET /api/jobs/:queueName/active
   * Get active jobs in a queue
   */
  async getActiveJobs(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const activeJobs = await queueService.getActiveJobs(queueName, limit);

      res.json({
        status: 'success',
        data: {
          queueName,
          count: activeJobs.length,
          jobs: activeJobs,
        },
      });
    } catch (error) {
      logger.error('Error fetching active jobs:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch active jobs',
      });
    }
  }

  /**
   * GET /api/jobs/:queueName/waiting
   * Get waiting jobs in a queue
   */
  async getWaitingJobs(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const waitingJobs = await queueService.getWaitingJobs(queueName, limit);

      res.json({
        status: 'success',
        data: {
          queueName,
          count: waitingJobs.length,
          jobs: waitingJobs,
        },
      });
    } catch (error) {
      logger.error('Error fetching waiting jobs:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch waiting jobs',
      });
    }
  }

  /**
   * GET /api/jobs/:queueName/:jobId
   * Get job info
   */
  async getJobInfo(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const jobId = Array.isArray(req.params.jobId)
        ? req.params.jobId[0]
        : (req.params.jobId as string);
      const jobInfo = await queueService.getJobInfo(queueName, jobId);

      if (!jobInfo) {
        res.status(404).json({
          status: 'error',
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
        return;
      }

      res.json({
        status: 'success',
        data: jobInfo,
      });
    } catch (error) {
      logger.error('Error fetching job info:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to fetch job info',
      });
    }
  }

  /**
   * POST /api/jobs/:queueName/:jobId/retry
   * Retry a failed job
   */
  async retryJob(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const jobId = Array.isArray(req.params.jobId)
        ? req.params.jobId[0]
        : (req.params.jobId as string);
      const success = await queueService.retryJob(queueName, jobId);

      if (!success) {
        res.status(404).json({
          status: 'error',
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
        return;
      }

      res.json({
        status: 'success',
        message: `Job ${jobId} has been retried`,
      });
    } catch (error) {
      logger.error('Error retrying job:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to retry job',
      });
    }
  }

  /**
   * DELETE /api/jobs/:queueName/:jobId
   * Remove a job
   */
  async removeJob(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const jobId = Array.isArray(req.params.jobId)
        ? req.params.jobId[0]
        : (req.params.jobId as string);
      const success = await queueService.removeJob(queueName, jobId);

      if (!success) {
        res.status(404).json({
          status: 'error',
          message: `Job ${jobId} not found in queue ${queueName}`,
        });
        return;
      }

      res.json({
        status: 'success',
        message: `Job ${jobId} has been removed`,
      });
    } catch (error) {
      logger.error('Error removing job:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to remove job',
      });
    }
  }

  /**
   * POST /api/jobs/:queueName/pause
   * Pause a queue
   */
  async pauseQueue(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const success = await queueService.pauseQueue(queueName);

      if (!success) {
        res.status(404).json({
          status: 'error',
          message: `Queue ${queueName} not found`,
        });
        return;
      }

      res.json({
        status: 'success',
        message: `Queue ${queueName} has been paused`,
      });
    } catch (error) {
      logger.error('Error pausing queue:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to pause queue',
      });
    }
  }

  /**
   * POST /api/jobs/:queueName/resume
   * Resume a queue
   */
  async resumeQueue(req: Request, res: Response): Promise<void> {
    try {
      const queueName = Array.isArray(req.params.queueName)
        ? req.params.queueName[0]
        : (req.params.queueName as string);
      const success = await queueService.resumeQueue(queueName);

      if (!success) {
        res.status(404).json({
          status: 'error',
          message: `Queue ${queueName} not found`,
        });
        return;
      }

      res.json({
        status: 'success',
        message: `Queue ${queueName} has been resumed`,
      });
    } catch (error) {
      logger.error('Error resuming queue:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to resume queue',
      });
    }
  }

  /**
   * POST /api/jobs/email/order-confirmation
   * Queue order confirmation email
   */
  async queueOrderConfirmationEmail(req: Request, res: Response): Promise<void> {
    try {
      const { to, orderId, customerName, items, total, estimatedTime } = req.body;

      if (!to || !orderId || !customerName || !items || !total) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields',
        });
        return;
      }

      await sendOrderConfirmationEmail(to, orderId, customerName, items, total, estimatedTime);

      res.json({
        status: 'success',
        message: 'Order confirmation email queued',
      });
    } catch (error) {
      logger.error('Error queueing order confirmation email:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to queue email',
      });
    }
  }

  /**
   * POST /api/jobs/email/password-reset
   * Queue password reset email
   */
  async queuePasswordResetEmail(req: Request, res: Response): Promise<void> {
    try {
      const { to, userName, resetLink } = req.body;

      if (!to || !userName || !resetLink) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields',
        });
        return;
      }

      await sendPasswordResetEmail(to, userName, resetLink);

      res.json({
        status: 'success',
        message: 'Password reset email queued',
      });
    } catch (error) {
      logger.error('Error queueing password reset email:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to queue email',
      });
    }
  }

  /**
   * POST /api/jobs/report/financial
   * Queue financial report generation
   */
  async queueFinancialReport(req: Request, res: Response): Promise<void> {
    try {
      const { restaurantId, startDate, endDate, format = 'pdf', emailTo } = req.body;

      if (!restaurantId || !startDate || !endDate) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields',
        });
        return;
      }

      await generateFinancialReport(
        restaurantId,
        new Date(startDate),
        new Date(endDate),
        format,
        emailTo
      );

      res.json({
        status: 'success',
        message: 'Financial report generation queued',
      });
    } catch (error) {
      logger.error('Error queueing financial report:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to queue report',
      });
    }
  }

  /**
   * POST /api/jobs/data/reconcile-inventory
   * Queue inventory reconciliation
   */
  async queueInventoryReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const { restaurantId, counts } = req.body;

      if (!restaurantId || !counts) {
        res.status(400).json({
          status: 'error',
          message: 'Missing required fields',
        });
        return;
      }

      await reconcileInventory(restaurantId, counts);

      res.json({
        status: 'success',
        message: 'Inventory reconciliation queued',
      });
    } catch (error) {
      logger.error('Error queueing inventory reconciliation:', error);
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to queue job',
      });
    }
  }
}

export const jobsController = new JobsController();
