import { Request, Response } from 'express';
import { laborCostService } from '../services/LaborCostService';
import { coverageTrackingService } from '../services/CoverageTrackingService';
import { shiftTemplateService } from '../services/ShiftTemplateService';
import { advancedSchedulingService } from '../services/AdvancedSchedulingService';
import { createShiftTemplateSchema, updateShiftTemplateSchema, createCoverageRequirementSchema, updateCoverageRequirementSchema, applyTemplateSchema, applyMultipleTemplatesSchema } from '../validators/templates-coverage.validator';

/**
 * AdvancedSchedulingController
 * 
 * Handles advanced scheduling features:
 * - Labor cost reporting
 * - Coverage tracking and alerts
 * - Shift templates
 */
export class AdvancedSchedulingController {
  async getDailyLaborCost(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required query parameter: date' });
        return;
      }
      const cost = await laborCostService.calculateDailyLaborCost(tenantId, new Date(date));
      res.json({ status: 'success', data: cost });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getLaborCostPercentage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required query parameter: date' });
        return;
      }
      const data = await laborCostService.calculateLaborCostPercentage(tenantId, new Date(date));
      res.json({ status: 'success', data });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async generateLaborCostReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.body as { date: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required field: date' });
        return;
      }
      const report = await laborCostService.generateDailyLaborCostReport(tenantId, new Date(date));
      res.json({ status: 'success', data: report });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getWeeklyLaborCost(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required query parameter: date' });
        return;
      }
      const summary = await laborCostService.getWeeklyLaborCostSummary(tenantId, new Date(date));
      res.json({ status: 'success', data: summary });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getMonthlyLaborCost(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required query parameter: date' });
        return;
      }
      const trend = await laborCostService.getMonthlyLaborCostTrend(tenantId, new Date(date));
      res.json({ status: 'success', data: trend });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getStaffCostComparison(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Missing required parameters: startDate, endDate' });
        return;
      }
      const comparison = await laborCostService.getStaffCostComparison(tenantId, new Date(startDate), new Date(endDate));
      res.json({ status: 'success', data: comparison });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async forecastLaborCosts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { daysAhead } = req.query as { daysAhead?: string };
      const days = daysAhead ? parseInt(daysAhead) : 7;
      const forecast = await laborCostService.forecastLaborCosts(tenantId, days);
      res.json({ status: 'success', data: forecast });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getCoverageRequirements(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { roleRequired } = req.query as { roleRequired?: string };
      const requirements = await coverageTrackingService.getCoverageRequirements(tenantId, roleRequired);
      res.json({ status: 'success', data: requirements });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async setCoverageRequirement(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = createCoverageRequirementSchema.parse(req.body);
      const requirement = await coverageTrackingService.setCoverageRequirement(
        tenantId,
        data.roleRequired,
        data.minimumStaff,
        data.dayOfWeek,
        data.notes
      );
      res.status(201).json({ status: 'success', data: requirement });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async checkCoverage(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date, roleRequired, startTime, endTime } = req.query as { date?: string; roleRequired?: string; startTime?: string; endTime?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required parameter: date' });
        return;
      }
      const coverage = await coverageTrackingService.checkCoverage(tenantId, new Date(date), roleRequired, startTime, endTime);
      res.json({ status: 'success', data: coverage });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getUnderstaffedPeriods(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) {
        res.status(400).json({ error: 'Missing required parameters: startDate, endDate' });
        return;
      }
      const periods = await coverageTrackingService.getUnderstaffedPeriods(tenantId, new Date(startDate), new Date(endDate));
      res.json({ status: 'success', data: periods });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getSuggestStaff(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { roleRequired, date, startTime, endTime } = req.query as { roleRequired?: string; date?: string; startTime?: string; endTime?: string };
      if (!roleRequired || !date || !startTime || !endTime) {
        res.status(400).json({ error: 'Missing required parameters: roleRequired, date, startTime, endTime' });
        return;
      }
      const suggestions = await coverageTrackingService.suggestStaffForOpenShift(tenantId, roleRequired, new Date(date), startTime, endTime);
      res.json({ status: 'success', data: suggestions });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getCoverageSummary(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.query as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required query parameter: date' });
        return;
      }
      const summary = await coverageTrackingService.getCoverageSummary(tenantId, new Date(date));
      res.json({ status: 'success', data: summary });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async createTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = createShiftTemplateSchema.parse(req.body);
      const template = await shiftTemplateService.createTemplate(tenantId, data);
      res.status(201).json({ status: 'success', data: template });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getAllTemplates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { roleRequired, isActive } = req.query as { roleRequired?: string; isActive?: string };
      const templates = await shiftTemplateService.getAllTemplates(tenantId, roleRequired, isActive === 'true');
      res.json({ status: 'success', data: templates });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { templateId } = req.params as { templateId: string };
      const template = await shiftTemplateService.getTemplateById(templateId, tenantId);
      res.json({ status: 'success', data: template });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async updateTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { templateId } = req.params as { templateId: string };
      const data = updateShiftTemplateSchema.parse(req.body);
      const template = await shiftTemplateService.updateTemplate(templateId, tenantId, data);
      res.json({ status: 'success', data: template });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { templateId } = req.params as { templateId: string };
      await shiftTemplateService.deleteTemplate(templateId, tenantId);
      res.json({ status: 'success', message: 'Template deleted' });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async applyTemplate(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = applyTemplateSchema.parse(req.body);
      const shifts = await shiftTemplateService.applyTemplate(tenantId, data.templateId, new Date(data.startDate), new Date(data.endDate), data.assignToUserIds);
      res.status(201).json({ status: 'success', data: shifts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async applyMultipleTemplates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const data = applyMultipleTemplatesSchema.parse(req.body);
      const shifts = await shiftTemplateService.applyTemplates(tenantId, data.templateIds, new Date(data.startDate), new Date(data.endDate), data.assignToUserIds);
      res.status(201).json({ status: 'success', data: shifts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  async getTemplateSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { roleRequired } = req.query as { roleRequired?: string };
      if (!roleRequired) {
        res.status(400).json({ error: 'Missing required query parameter: roleRequired' });
        return;
      }
      const suggestions = await shiftTemplateService.getSuggestions(tenantId, roleRequired);
      res.json({ status: 'success', data: suggestions });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  // =====================================================================
  // ADVANCED SCHEDULING ENDPOINTS (Feature A5)
  // =====================================================================

  /**
   * POST /api/advanced/forecast-demand
   * Forecast customer demand for a specific date
   */
  async forecastDemand(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.body as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required field: date' });
        return;
      }
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, new Date(date));
      res.json({ status: 'success', data: forecast });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * POST /api/advanced/recommend-staffing
   * Get staffing recommendations based on demand forecast
   */
  async recommendStaffing(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { date } = req.body as { date?: string };
      if (!date) {
        res.status(400).json({ error: 'Missing required field: date' });
        return;
      }
      const forecast = await advancedSchedulingService.forecastDemand(tenantId, new Date(date));
      const recommendation = await advancedSchedulingService.recommendStaffing(
        tenantId,
        new Date(date),
        forecast
      );
      res.json({ status: 'success', data: recommendation });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * POST /api/advanced/optimize-schedule
   * Optimize schedule for a group of staff members
   */
  async optimizeSchedule(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { staffIds, startDate, endDate } = req.body as {
        staffIds?: string[];
        startDate?: string;
        endDate?: string;
      };
      if (!staffIds || !startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required fields: staffIds, startDate, endDate',
        });
        return;
      }
      const optimized = await advancedSchedulingService.optimizeSchedule(
        tenantId,
        staffIds,
        new Date(startDate),
        new Date(endDate)
      );
      res.json({ status: 'success', data: optimized });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * GET /api/advanced/detect-conflicts
   * Detect scheduling conflicts in a date range
   */
  async detectConflicts(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters: startDate, endDate',
        });
        return;
      }
      const conflicts = await advancedSchedulingService.detectConflicts(
        tenantId,
        new Date(startDate),
        new Date(endDate)
      );
      res.json({ status: 'success', data: conflicts });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }

  /**
   * GET /api/advanced/schedule-report
   * Generate comprehensive schedule report
   */
  async generateScheduleReport(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId!;
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'Missing required parameters: startDate, endDate',
        });
        return;
      }
      const report = await advancedSchedulingService.generateScheduleReport(
        tenantId,
        new Date(startDate),
        new Date(endDate)
      );
      res.json({ status: 'success', data: report });
    } catch (error: any) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  }
}

export const advancedSchedulingController = new AdvancedSchedulingController();
