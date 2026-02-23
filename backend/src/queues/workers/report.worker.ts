/**
 * Report Worker
 * Processes report generation jobs from the report queue
 */

import { Worker, Job } from 'bullmq';
import { workerConfigs, QUEUE_NAMES, JOB_NAMES } from '../config/queue.config';
import { ReportService } from '../../services/ReportService';
import logger from '../../config/logger';
import { reportQueue } from '../definitions/report.queue';
import { ReportJobData } from '../definitions/report.queue';
import { EmailService } from '../../services/EmailService';

const reportService = new ReportService();
const emailService = new EmailService();

export class ReportWorker {
  private worker: Worker;

  constructor() {
    this.worker = new Worker(
      QUEUE_NAMES.REPORT,
      async (job: Job<ReportJobData>) => {
        return this.processReportJob(job);
      },
      workerConfigs.report
    );

    this.setupEventHandlers();
  }

  /**
   * Main job processing function
   */
  private async processReportJob(job: Job<ReportJobData>): Promise<any> {
    try {
      logger.info(`📊 Processing report job: ${job.name} (ID: ${job.id})`);

      const { type, dateRange, restaurantId, userId, format = 'pdf', emailTo } = job.data;

      let reportData: any;

      // Generate report based on type
      switch (job.name) {
        case JOB_NAMES.GENERATE_FINANCIAL_REPORT:
          reportData = await this.generateFinancialReport(restaurantId, dateRange);
          break;

        case JOB_NAMES.GENERATE_SALES_ANALYTICS:
          reportData = await this.generateSalesAnalytics(restaurantId, dateRange);
          break;

        case JOB_NAMES.GENERATE_INVENTORY_SUMMARY:
          reportData = await this.generateInventorySummary(restaurantId);
          break;

        case JOB_NAMES.GENERATE_STAFF_PERFORMANCE:
          reportData = await this.generateStaffPerformance(restaurantId, dateRange);
          break;

        case JOB_NAMES.EXPORT_DATA:
          reportData = await this.exportData(restaurantId, job.data.filters);
          break;

        default:
          throw new Error(`Unknown report type: ${job.name}`);
      }

      // Format report if needed
      if (format !== 'json') {
        reportData = await this.formatReport(reportData, format);
      }

      // Email report if requested
      if (emailTo) {
        await this.emailReport(emailTo, job.name, reportData);
      }

      logger.info(`✅ Report job completed: ${job.name} (ID: ${job.id})`);

      return {
        reportId: job.id,
        type,
        format,
        generatedAt: new Date(),
        status: 'completed',
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`❌ Report job failed: ${job.name} (ID: ${job.id})`, {
        error: err.message,
        attempt: job.attemptsMade,
        maxAttempts: job.opts.attempts,
      });

      throw err;
    }
  }

  /**
   * Generate financial report (P&L, balance sheet, etc.)
   */
  private async generateFinancialReport(
    restaurantId: string | undefined,
    dateRange: any
  ): Promise<any> {
    logger.debug('Generating financial report...');

    // Simulated report generation
    return {
      type: 'financial',
      restaurantId,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      revenue: 15000,
      expenses: 8000,
      profit: 7000,
      profitMargin: 46.7,
      breakdown: {
        foodCost: 4000,
        laborCost: 3000,
        overhead: 1000,
      },
    };
  }

  /**
   * Generate sales analytics
   */
  private async generateSalesAnalytics(
    restaurantId: string | undefined,
    dateRange: any
  ): Promise<any> {
    logger.debug('Generating sales analytics...');

    return {
      type: 'salesAnalytics',
      restaurantId,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      totalSales: 25000,
      averageTransactionValue: 150,
      topItems: [
        { itemName: 'Caesar Salad', quantity: 245, revenue: 2450 },
        { itemName: 'Grilled Salmon', quantity: 198, revenue: 3960 },
        { itemName: 'Pasta Carbonara', quantity: 187, revenue: 2805 },
      ],
      paymentMethods: {
        cash: 5000,
        credit: 15000,
        mobile: 5000,
      },
    };
  }

  /**
   * Generate inventory summary
   */
  private async generateInventorySummary(restaurantId: string | undefined): Promise<any> {
    logger.debug('Generating inventory summary...');

    return {
      type: 'inventorySummary',
      restaurantId,
      generatedAt: new Date(),
      totalItems: 487,
      lowStockItems: [
        { name: 'Olive Oil (Premium)', current: 2, reorderLevel: 5 },
        { name: 'Sea Salt', current: 3, reorderLevel: 10 },
      ],
      outOfStockItems: [],
      totalValue: 125000,
    };
  }

  /**
   * Generate staff performance report
   */
  private async generateStaffPerformance(
    restaurantId: string | undefined,
    dateRange: any
  ): Promise<any> {
    logger.debug('Generating staff performance report...');

    return {
      type: 'staffPerformance',
      restaurantId,
      startDate: dateRange?.startDate,
      endDate: dateRange?.endDate,
      staffMetrics: [
        { name: 'John Doe', role: 'Server', ordersServiced: 287, avgRating: 4.8 },
        { name: 'Jane Smith', role: 'Kitchen', itemsPrepped: 1200, accuracy: 97.5 },
      ],
      payrollData: {
        totalHours: 480,
        totalCost: 5760,
        averagePerHour: 12,
      },
    };
  }

  /**
   * Export data
   */
  private async exportData(restaurantId: string | undefined, filters: any): Promise<any> {
    logger.debug('Exporting data...');

    return {
      type: 'dataExport',
      restaurantId,
      filters,
      exportedRecords: 5000,
      fileSize: 2.5, // MB
      format: filters?.format || 'csv',
    };
  }

  /**
   * Format report to specified format
   */
  private async formatReport(reportData: any, format: string): Promise<any> {
    logger.debug(`Formatting report to ${format}...`);

    switch (format) {
      case 'csv':
        return this.convertToCSV(reportData);
      case 'xlsx':
        return this.convertToXLSX(reportData);
      case 'pdf':
        return this.convertToPDF(reportData);
      default:
        return reportData;
    }
  }

  /**
   * Convert report to CSV
   */
  private async convertToCSV(data: any): Promise<string> {
    // Simplified CSV generation
    return JSON.stringify(data);
  }

  /**
   * Convert report to XLSX
   */
  private async convertToXLSX(data: any): Promise<any> {
    // Simplified XLSX generation
    return Buffer.from(JSON.stringify(data));
  }

  /**
   * Convert report to PDF
   */
  private async convertToPDF(data: any): Promise<any> {
    // Simplified PDF generation
    return Buffer.from(JSON.stringify(data));
  }

  /**
   * Email report to recipients
   */
  private async emailReport(to: string | string[], reportType: string, reportData: any): Promise<void> {
    const recipients = Array.isArray(to) ? to : [to];

    const emailBody = `
      <h2>Report Generated</h2>
      <p>Your ${reportType} report has been generated and is ready for download.</p>
      <h3>Report Summary:</h3>
      <pre>${JSON.stringify(reportData, null, 2)}</pre>
    `;

    await emailService.sendBulkEmails(
      recipients.map((recipient) => ({
        to: recipient,
        subject: `${reportType} Report Ready`,
        html: emailBody,
      }))
    );
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    this.worker.on('ready', () => {
      logger.info('📊 Report Worker is ready and listening for jobs');
    });

    this.worker.on('error', (error) => {
      logger.error('📊 Report Worker error:', error);
    });

    this.worker.on('stalled', (jobId) => {
      logger.warn(`⚠️ Report job stalled: ${jobId}`);
    });

    this.worker.on('progress', (job, progress) => {
      logger.debug(`📈 Report job ${job.id} progress: ${progress}%`);
    });
  }

  /**
   * Gracefully close the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    logger.info('📊 Report Worker closed');
  }
}

// Export singleton instance
export const reportWorker = new ReportWorker();

logger.info('📊 Report Worker initialized');
