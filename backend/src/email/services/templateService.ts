/**
 * Email Template Service
 * Handles rendering of email templates using Handlebars
 */

import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import logger from '../../config/logger';

export enum EmailTemplateType {
  ORDER_CONFIRMATION = 'orderConfirmation',
  PAYMENT_RECEIPT = 'paymentReceipt',
  PASSWORD_RESET = 'passwordReset',
  ACCOUNT_VERIFICATION = 'accountVerification',
  WELCOME = 'welcome',
  LOW_STOCK_ALERT = 'lowStockAlert',
  DAILY_REPORT = 'dailyReport',
  WEEKLY_REPORT = 'weeklyNewsletter',
  STAFF_SHIFT_REMINDER = 'staffShiftReminder',
  MARKETING_NEWSLETTER = 'weeklyNewsletter',
  FEATURE_ANNOUNCEMENT = 'featureAnnouncement',
}

export class TemplateService {
  private templatesDir: string;
  private layoutsDir: string;
  private layoutCache = new Map<string, HandlebarsTemplateDelegate>();
  private templateCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor() {
    this.templatesDir = path.join(__dirname, '../templates');
    this.layoutsDir = path.join(__dirname, '../layouts');
    this.registerHelpers();
  }

  /**
   * Register Handlebars helpers
   */
  private registerHelpers(): void {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', (date: Date, format: string = 'MMM DD, YYYY') => {
      if (!(date instanceof Date)) {
        date = new Date(date);
      }
      // Simple date formatting - can be extended with date-fns
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', (amount: number) => {
      if (typeof amount === 'string') {
        amount = parseFloat(amount);
      }
      return `$${amount.toFixed(2)}`;
    });

    // Percentage formatting helper
    Handlebars.registerHelper('formatPercent', (value: number) => {
      if (typeof value === 'string') {
        value = parseFloat(value);
      }
      return `${value.toFixed(2)}%`;
    });

    // Time formatting helper
    Handlebars.registerHelper('formatTime', (time: string) => {
      // Expects time in HH:mm format
      return time;
    });

    // Conditional equality helper
    Handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b;
    });

    // Not equal helper
    Handlebars.registerHelper('ne', (a: any, b: any) => {
      return a !== b;
    });

    // Greater than helper
    Handlebars.registerHelper('gt', (a: number, b: number) => {
      return a > b;
    });

    // Less than helper
    Handlebars.registerHelper('lt', (a: number, b: number) => {
      return a < b;
    });

    // Safe HTML helper
    Handlebars.registerHelper('safe', (html: string) => {
      return new Handlebars.SafeString(html);
    });

    // Uppercase helper
    Handlebars.registerHelper('uppercase', (str: string) => {
      return str?.toUpperCase?.() || str;
    });

    // Lowercase helper
    Handlebars.registerHelper('lowercase', (str: string) => {
      return str?.toLowerCase?.() || str;
    });

    // Capitalize helper
    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) return str;
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    });

    // Current year helper
    Handlebars.registerHelper('currentYear', () => {
      return new Date().getFullYear();
    });
  }

  /**
   * Load a template file
   */
  private loadTemplate(templateName: string): string {
    const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);

    try {
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      const content = fs.readFileSync(templatePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error(`Failed to load template: ${templateName}`, error);
      throw error;
    }
  }

  /**
   * Load a layout file
   */
  private loadLayout(layoutName: string = 'main'): string {
    const layoutPath = path.join(this.layoutsDir, `${layoutName}.hbs`);

    try {
      if (!fs.existsSync(layoutPath)) {
        throw new Error(`Layout file not found: ${layoutPath}`);
      }

      const content = fs.readFileSync(layoutPath, 'utf-8');
      return content;
    } catch (error) {
      logger.error(`Failed to load layout: ${layoutName}`, error);
      throw error;
    }
  }

  /**
   * Get or compile a template
   */
  private getCompiledTemplate(templateName: string): HandlebarsTemplateDelegate {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templateContent = this.loadTemplate(templateName);
    const compiled = Handlebars.compile(templateContent);
    this.templateCache.set(templateName, compiled);

    return compiled;
  }

  /**
   * Get or compile a layout
   */
  private getCompiledLayout(layoutName: string = 'main'): HandlebarsTemplateDelegate {
    if (this.layoutCache.has(layoutName)) {
      return this.layoutCache.get(layoutName)!;
    }

    const layoutContent = this.loadLayout(layoutName);
    const compiled = Handlebars.compile(layoutContent);
    this.layoutCache.set(layoutName, compiled);

    return compiled;
  }

  /**
   * Render an email template with data
   */
  async renderTemplate(
    templateName: string,
    data: Record<string, any>,
    options?: {
      layout?: string;
      title?: string;
    }
  ): Promise<string> {
    try {
      const compiledTemplate = this.getCompiledTemplate(templateName);

      // Add default data
      const defaultData = {
        ...data,
        title: options?.title || 'BlackPot Email',
        currentYear: new Date().getFullYear(),
        websiteUrl: process.env.WEBSITE_URL || 'https://blackpot.com',
        helpCenter: process.env.HELP_CENTER_URL || 'https://help.blackpot.com',
      };

      // Render the template
      const body = compiledTemplate(defaultData);

      // If layout is specified, wrap the body in the layout
      if (options?.layout !== 'none') {
        const layoutName = options?.layout || 'main';
        const compiledLayout = this.getCompiledLayout(layoutName);
        const layoutData = {
          ...defaultData,
          body: body,
          title: options?.title || 'BlackPot Email',
          unsubscribeLink: data.unsubscribeLink,
          preferencesLink: data.preferencesLink,
        };

        return compiledLayout(layoutData);
      }

      return body;
    } catch (error) {
      logger.error(`Failed to render template: ${templateName}`, error);
      throw error;
    }
  }

  /**
   * Get available templates
   */
  getAvailableTemplates(): string[] {
    try {
      const files = fs.readdirSync(this.templatesDir);
      return files
        .filter((file) => file.endsWith('.hbs'))
        .map((file) => file.replace('.hbs', ''));
    } catch (error) {
      logger.error('Failed to get available templates', error);
      return [];
    }
  }

  /**
   * Clear template cache (useful for development)
   */
  clearCache(): void {
    this.templateCache.clear();
    this.layoutCache.clear();
    logger.debug('Template cache cleared');
  }

  /**
   * Render template without layout (for testing)
   */
  async renderPlainTemplate(
    templateName: string,
    data: Record<string, any>
  ): Promise<string> {
    return this.renderTemplate(templateName, data, { layout: 'none' });
  }
}

export const templateService = new TemplateService();
