import { Router, Request, Response } from 'express';
import { advancedSchedulingController } from '../controllers/AdvancedSchedulingController';
import { authenticate } from '../middleware/auth';
import { ensureTenantAccess } from '../middleware/tenantIsolation';

const router = Router();

/**
 * Advanced Scheduling Routes
 * Labor Costs, Coverage Tracking, Shift Templates
 * All routes require authentication and tenant isolation
 */

// =====================
// LABOR COST ROUTES
// =====================

/**
 * GET /api/advanced/labor-costs/daily
 * Get daily labor cost report
 * Query: date
 */
router.get('/labor-costs/daily', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getDailyLaborCost(req, res)
);

/**
 * GET /api/advanced/labor-costs/percentage
 * Get labor cost as % of revenue
 * Query: date
 */
router.get('/labor-costs/percentage', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getLaborCostPercentage(req, res)
);

/**
 * POST /api/advanced/labor-costs/generate-report
 * Generate daily labor cost report
 * Body: { date }
 */
router.post('/labor-costs/generate-report', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.generateLaborCostReport(req, res)
);

/**
 * GET /api/advanced/labor-costs/weekly
 * Get weekly labor cost summary
 * Query: date
 */
router.get('/labor-costs/weekly', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getWeeklyLaborCost(req, res)
);

/**
 * GET /api/advanced/labor-costs/monthly
 * Get monthly labor cost trend
 * Query: date
 */
router.get('/labor-costs/monthly', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getMonthlyLaborCost(req, res)
);

/**
 * GET /api/advanced/labor-costs/comparison
 * Get staff cost comparison
 * Query: startDate, endDate
 */
router.get('/labor-costs/comparison', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getStaffCostComparison(req, res)
);

/**
 * GET /api/advanced/labor-costs/forecast
 * Forecast labor costs
 * Query: daysAhead? (default: 7)
 */
router.get('/labor-costs/forecast', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.forecastLaborCosts(req, res)
);

// =====================
// COVERAGE TRACKING ROUTES
// =====================

/**
 * GET /api/advanced/coverage/requirements
 * Get coverage requirements
 * Query: roleRequired?
 */
router.get('/coverage/requirements', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getCoverageRequirements(req, res)
);

/**
 * POST /api/advanced/coverage/requirements
 * Set coverage requirement
 * Body: { roleRequired, minimumStaff, dayOfWeek?, notes? }
 */
router.post('/coverage/requirements', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.setCoverageRequirement(req, res)
);

/**
 * GET /api/advanced/coverage/check
 * Check coverage for a specific date/role
 * Query: date, roleRequired?, startTime?, endTime?
 */
router.get('/coverage/check', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.checkCoverage(req, res)
);

/**
 * GET /api/advanced/coverage/understaffed
 * Get understaffed periods
 * Query: startDate, endDate
 */
router.get('/coverage/understaffed', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getUnderstaffedPeriods(req, res)
);

/**
 * GET /api/advanced/coverage/suggestions
 * Get staff suggestions for open shifts
 * Query: roleRequired, date, startTime, endTime
 */
router.get('/coverage/suggestions', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getSuggestStaff(req, res)
);

/**
 * GET /api/advanced/coverage/summary
 * Get coverage summary for a date
 * Query: date
 */
router.get('/coverage/summary', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getCoverageSummary(req, res)
);

// =====================
// SHIFT TEMPLATE ROUTES
// =====================

/**
 * POST /api/advanced/templates
 * Create shift template
 * Body: { name, roleRequired, dayOfWeek, startTime, endTime, breakMinutes?, notes? }
 */
router.post('/templates', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.createTemplate(req, res)
);

/**
 * GET /api/advanced/templates
 * Get all templates
 * Query: roleRequired?, isActive?
 */
router.get('/templates', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getAllTemplates(req, res)
);

/**
 * GET /api/advanced/templates/:templateId
 * Get template details
 */
router.get('/templates/:templateId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getTemplate(req, res)
);

/**
 * PUT /api/advanced/templates/:templateId
 * Update template
 */
router.put('/templates/:templateId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.updateTemplate(req, res)
);

/**
 * DELETE /api/advanced/templates/:templateId
 * Delete template
 */
router.delete('/templates/:templateId', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.deleteTemplate(req, res)
);

/**
 * POST /api/advanced/templates/apply
 * Apply template to generate shifts
 * Body: { templateId, startDate, endDate, assignToUserIds? }
 */
router.post('/templates/apply', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.applyTemplate(req, res)
);

/**
 * POST /api/advanced/templates/apply-multiple
 * Apply multiple templates
 * Body: { templateIds, startDate, endDate, assignToUserIds? }
 */
router.post('/templates/apply-multiple', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.applyMultipleTemplates(req, res)
);

/**
 * GET /api/advanced/templates/suggestions
 * Get template suggestions based on patterns
 * Query: roleRequired
 */
router.get('/templates/suggestions', authenticate, ensureTenantAccess, (req: Request, res: Response) =>
  advancedSchedulingController.getTemplateSuggestions(req, res)
);

export default router;
