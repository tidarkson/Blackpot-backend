/**
 * Jobs Routes
 * API routes for job queue management and monitoring
 */

import { Router, Request, Response } from 'express';
import { jobsController } from '../controllers/jobs.controller';

const router = Router();

/**
 * Queue Statistics & Monitoring
 */

// GET /api/jobs/stats - Get all queue statistics
router.get('/stats', (req: Request, res: Response) =>
  jobsController.getQueueStats(req, res)
);

// GET /api/jobs/health - Get queue health status
router.get('/health', (req: Request, res: Response) =>
  jobsController.getQueueHealth(req, res)
);

// GET /api/jobs/:queueName/stats - Get queue-specific stats
router.get('/:queueName/stats', (req: Request, res: Response) =>
  jobsController.getQueueStatsByName(req, res)
);

/**
 * Job Management
 */

// GET /api/jobs/:queueName/failed - Get failed jobs
router.get('/:queueName/failed', (req: Request, res: Response) =>
  jobsController.getFailedJobs(req, res)
);

// GET /api/jobs/:queueName/active - Get active jobs
router.get('/:queueName/active', (req: Request, res: Response) =>
  jobsController.getActiveJobs(req, res)
);

// GET /api/jobs/:queueName/waiting - Get waiting jobs
router.get('/:queueName/waiting', (req: Request, res: Response) =>
  jobsController.getWaitingJobs(req, res)
);

// GET /api/jobs/:queueName/:jobId - Get job info
router.get('/:queueName/:jobId', (req: Request, res: Response) =>
  jobsController.getJobInfo(req, res)
);

// POST /api/jobs/:queueName/:jobId/retry - Retry job
router.post('/:queueName/:jobId/retry', (req: Request, res: Response) =>
  jobsController.retryJob(req, res)
);

// DELETE /api/jobs/:queueName/:jobId - Remove job
router.delete('/:queueName/:jobId', (req: Request, res: Response) =>
  jobsController.removeJob(req, res)
);

/**
 * Queue Control
 */

// POST /api/jobs/:queueName/pause - Pause queue
router.post('/:queueName/pause', (req: Request, res: Response) =>
  jobsController.pauseQueue(req, res)
);

// POST /api/jobs/:queueName/resume - Resume queue
router.post('/:queueName/resume', (req: Request, res: Response) =>
  jobsController.resumeQueue(req, res)
);

/**
 * Email Job Endpoints
 */

// POST /api/jobs/email/order-confirmation - Queue order confirmation email
router.post('/email/order-confirmation', (req: Request, res: Response) =>
  jobsController.queueOrderConfirmationEmail(req, res)
);

// POST /api/jobs/email/password-reset - Queue password reset email
router.post('/email/password-reset', (req: Request, res: Response) =>
  jobsController.queuePasswordResetEmail(req, res)
);

/**
 * Report Job Endpoints
 */

// POST /api/jobs/report/financial - Queue financial report
router.post('/report/financial', (req: Request, res: Response) =>
  jobsController.queueFinancialReport(req, res)
);

/**
 * Data Processing Job Endpoints
 */

// POST /api/jobs/data/reconcile-inventory - Queue inventory reconciliation
router.post('/data/reconcile-inventory', (req: Request, res: Response) =>
  jobsController.queueInventoryReconciliation(req, res)
);

export default router;
