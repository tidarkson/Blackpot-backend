import { PrismaClient } from '@prisma/client';
import { addDays, startOfWeek } from 'date-fns';
import logger from '../config/logger';
import { CreateShiftTemplateRequest, UpdateShiftTemplateRequest } from '../validators/templates-coverage.validator';

const prisma = new PrismaClient();

/**
 * ShiftTemplateService
 * 
 * Shift template and recurring schedule management including:
 * - Template CRUD operations
 * - Apply templates to generate shifts
 * - Recurring schedule creation
 * - Template cloning and duplication
 * - Bulk shift generation from templates
 */
export class ShiftTemplateService {
  /**
   * Create a shift template
   */
  async createTemplate(tenantId: string, data: CreateShiftTemplateRequest) {
    try {
      const template = await prisma.shiftTemplate.create({
        data: {
          tenantId,
          name: data.name,
          roleRequired: data.roleRequired,
          dayOfWeek: data.dayOfWeek,
          startTime: new Date(`1970-01-01T${data.startTime}:00`),
          endTime: new Date(`1970-01-01T${data.endTime}:00`),
          breakMinutes: data.breakMinutes || 0,
          notes: data.notes,
          isActive: true,
        },
      });

      logger.info(`📋 Shift template created: ${data.name}`);

      return template;
    } catch (error: any) {
      logger.error('Error creating template:', error.message);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  async getAllTemplates(tenantId: string, roleRequired?: string, isActive?: boolean) {
    try {
      const where: any = { tenantId };

      if (roleRequired) {
        where.roleRequired = roleRequired;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const templates = await prisma.shiftTemplate.findMany({
        where,
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });

      return templates;
    } catch (error: any) {
      logger.error('Error fetching templates:', error.message);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(templateId: string, tenantId: string) {
    try {
      const template = await prisma.shiftTemplate.findFirst({
        where: { id: templateId, tenantId },
      });

      if (!template) {
        throw new Error('Template not found');
      }

      return template;
    } catch (error: any) {
      logger.error('Error fetching template:', error.message);
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(templateId: string, tenantId: string, data: UpdateShiftTemplateRequest) {
    try {
      const updateData: any = {
        ...data,
      };

      if (data.startTime) {
        updateData.startTime = new Date(`1970-01-01T${data.startTime}:00`);
      }

      if (data.endTime) {
        updateData.endTime = new Date(`1970-01-01T${data.endTime}:00`);
      }

      const template = await prisma.shiftTemplate.update({
        where: { id: templateId },
        data: updateData,
      });

      logger.info(`✏️ Template updated: ${template.name}`);

      return template;
    } catch (error: any) {
      logger.error('Error updating template:', error.message);
      throw error;
    }
  }

  /**
   * Delete/Deactivate template
   */
  async deleteTemplate(templateId: string, tenantId: string) {
    try {
      const template = await prisma.shiftTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });

      logger.info(`🚫 Template deactivated: ${template.name}`);

      return template;
    } catch (error: any) {
      logger.error('Error deleting template:', error.message);
      throw error;
    }
  }

  /**
   * Apply template to generate shifts for a date range
   */
  async applyTemplate(
    tenantId: string,
    templateId: string,
    startDate: Date,
    endDate: Date,
    assignToUserIds?: string[]
  ) {
    try {
      const template = await this.getTemplateById(templateId, tenantId);

      if (!template) {
        throw new Error('Template not found');
      }

      const generatedShifts: any[] = [];
      let currentDate = new Date(startDate);

      while (currentDate <= endDate) {
        // Check if this is the correct day of week
        if (currentDate.getDay() !== template.dayOfWeek) {
          currentDate.setDate(currentDate.getDate() + 1);
          continue;
        }

        // If no specific users, use active staff with this role
        const usersToAssign = assignToUserIds?.length
          ? assignToUserIds
          : await this.getActiveStaffForRole(tenantId, template.roleRequired);

        for (const userId of usersToAssign) {
          try {
            const shift = await prisma.shift.create({
              data: {
                tenantId,
                userId,
                scheduledDate: new Date(currentDate.toDateString()),
                scheduledStart: new Date(currentDate.toDateString() + `T${this.formatTime(template.startTime)}`),
                scheduledEnd: new Date(currentDate.toDateString() + `T${this.formatTime(template.endTime)}`),
                roleAssigned: template.roleRequired,
                breakMinutes: template.breakMinutes,
                notes: template.notes,
                status: 'SCHEDULED',
              },
            });

            generatedShifts.push(shift);
          } catch (error: any) {
            logger.warn(`Skipped shift creation for user ${userId}: ${error.message}`);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      logger.info(`✅ Applied template: Generated ${generatedShifts.length} shifts`);

      return {
        template,
        generatedShifts,
        count: generatedShifts.length,
      };
    } catch (error: any) {
      logger.error('Error applying template:', error.message);
      throw error;
    }
  }

  /**
   * Apply multiple templates
   */
  async applyTemplates(
    tenantId: string,
    templateIds: string[],
    startDate: Date,
    endDate: Date,
    assignToUserIds?: string[]
  ) {
    try {
      const allShifts: any[] = [];

      for (const templateId of templateIds) {
        const result = await this.applyTemplate(tenantId, templateId, startDate, endDate, assignToUserIds);
        allShifts.push(...result.generatedShifts);
      }

      return {
        totalGenerated: allShifts.length,
        shifts: allShifts,
      };
    } catch (error: any) {
      logger.error('Error applying templates:', error.message);
      throw error;
    }
  }

  /**
   * Copy template from another day
   */
  async copyTemplate(templateId: string, tenantId: string, targetDayOfWeek: number) {
    try {
      const sourceTemplate = await this.getTemplateById(templateId, tenantId);

      const newTemplate = await prisma.shiftTemplate.create({
        data: {
          tenantId,
          name: `${sourceTemplate.name} (${this.getDayName(targetDayOfWeek)})`,
          roleRequired: sourceTemplate.roleRequired,
          dayOfWeek: targetDayOfWeek,
          startTime: sourceTemplate.startTime,
          endTime: sourceTemplate.endTime,
          breakMinutes: sourceTemplate.breakMinutes,
          notes: sourceTemplate.notes,
          isActive: true,
        },
      });

      logger.info(`📋 Template copied: ${newTemplate.name}`);

      return newTemplate;
    } catch (error: any) {
      logger.error('Error copying template:', error.message);
      throw error;
    }
  }

  /**
   * Generate full week from template
   */
  async generateWeekFromTemplate(tenantId: string, templateId: string, weekStartDate: Date, assignToUserIds?: string[]) {
    try {
      const template = await this.getTemplateById(templateId, tenantId);
      const weekEnd = addDays(weekStartDate, 6);

      const result = await this.applyTemplate(tenantId, templateId, weekStartDate, weekEnd, assignToUserIds);

      return result;
    } catch (error: any) {
      logger.error('Error generating week from template:', error.message);
      throw error;
    }
  }

  /**
   * Get template suggestions based on historical patterns
   */
  async getSuggestions(tenantId: string, roleRequired: string) {
    try {
      // Analyze last 4 weeks of shifts
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const recentShifts = await prisma.shift.findMany({
        where: {
          tenantId,
          roleAssigned: roleRequired,
          scheduledDate: {
            gte: fourWeeksAgo,
          },
          status: { in: ['ACTIVE', 'COMPLETED'] },
        },
        select: {
          scheduledDate: true,
          scheduledStart: true,
          scheduledEnd: true,
        },
      });

      // Group by day of week and calculate average times
      const patterns: { [key: number]: any } = {};

      recentShifts.forEach(shift => {
        const dayOfWeek = shift.scheduledDate.getDay();

        if (!patterns[dayOfWeek]) {
          patterns[dayOfWeek] = {
            dayOfWeek,
            dayName: this.getDayName(dayOfWeek),
            startTimes: [],
            endTimes: [],
            count: 0,
          };
        }

        patterns[dayOfWeek].startTimes.push(this.formatTime(shift.scheduledStart));
        patterns[dayOfWeek].endTimes.push(this.formatTime(shift.scheduledEnd));
        patterns[dayOfWeek].count++;
      });

      // Calculate most common times for each day
      const suggestions = Object.values(patterns)
        .filter((p: any) => p.count > 0)
        .map((p: any) => ({
          ...p,
          mostCommonStartTime: this.getMostCommon(p.startTimes),
          mostCommonEndTime: this.getMostCommon(p.endTimes),
          frequency: p.count,
        }));

      return suggestions;
    } catch (error: any) {
      logger.error('Error getting template suggestions:', error.message);
      throw error;
    }
  }

  /**
   * Helper: Get active staff for a role
   */
  private async getActiveStaffForRole(tenantId: string, roleRequired: string): Promise<string[]> {
    const roleMap: { [key: string]: string } = {
      SERVER: 'SERVER',
      COOK: 'CHEF',
      MANAGER: 'MANAGER',
      HOST: 'HOST',
      BARTENDER: 'BARTENDER',
      SOMMELIER: 'SOMMELIER',
      DISHWASHER: 'DISHWASHER',
    };

    const mappedRole = roleMap[roleRequired] || roleRequired;

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        role: mappedRole as any,
        isActive: true,
      },
      select: { id: true },
    });

    return users.map(u => u.id);
  }

  /**
   * Helper: Format time
   */
  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * Helper: Get day name
   */
  private getDayName(dayOfWeek: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
  }

  /**
   * Helper: Get most common item in array
   */
  private getMostCommon(arr: string[]): string {
    if (arr.length === 0) return '';

    const frequency: { [key: string]: number } = {};
    let maxCount = 0;
    let mostCommon = '';

    arr.forEach(item => {
      frequency[item] = (frequency[item] || 0) + 1;
      if (frequency[item] > maxCount) {
        maxCount = frequency[item];
        mostCommon = item;
      }
    });

    return mostCommon;
  }
}

export const shiftTemplateService = new ShiftTemplateService();
