/**
 * Report Job Helpers
 * Helper functions to add various report generation jobs to the queue
 */

import { reportQueue, ReportJobData } from '../definitions/report.queue';
import { JOB_NAMES, JobPriority } from '../config/queue.config';
import logger from '../../config/logger';

/**
 * Generate financial report (P&L, balance sheet)
 */
export async function generateFinancialReport(
  restaurantId: string,
  startDate: Date,
  endDate: Date,
  format: 'pdf' | 'csv' | 'xlsx' | 'json' = 'pdf',
  emailTo?: string
): Promise<void> {
  try {
    await reportQueue.addJob(
      JOB_NAMES.GENERATE_FINANCIAL_REPORT,
      {
        type: 'financial',
        dateRange: { startDate, endDate },
        restaurantId,
        format,
        emailTo,
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`📊 Financial report job queued for restaurant: ${restaurantId}`);
  } catch (error) {
    logger.error('Failed to queue financial report:', error);
    throw error;
  }
}

/**
 * Generate sales analytics report
 */
export async function generateSalesAnalytics(
  restaurantId: string,
  startDate: Date,
  endDate: Date,
  format: 'pdf' | 'csv' | 'xlsx' | 'json' = 'pdf',
  emailTo?: string
): Promise<void> {
  try {
    await reportQueue.addJob(
      JOB_NAMES.GENERATE_SALES_ANALYTICS,
      {
        type: 'sales',
        dateRange: { startDate, endDate },
        restaurantId,
        format,
        emailTo,
        includeCharts: true,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📊 Sales analytics report job queued for restaurant: ${restaurantId}`);
  } catch (error) {
    logger.error('Failed to queue sales analytics report:', error);
    throw error;
  }
}

/**
 * Generate inventory summary report
 */
export async function generateInventorySummary(
  restaurantId: string,
  format: 'pdf' | 'csv' | 'xlsx' | 'json' = 'pdf',
  emailTo?: string
): Promise<void> {
  try {
    await reportQueue.addJob(
      JOB_NAMES.GENERATE_INVENTORY_SUMMARY,
      {
        type: 'inventory',
        restaurantId,
        format,
        emailTo,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📊 Inventory summary report job queued for restaurant: ${restaurantId}`);
  } catch (error) {
    logger.error('Failed to queue inventory summary report:', error);
    throw error;
  }
}

/**
 * Generate staff performance report
 */
export async function generateStaffPerformance(
  restaurantId: string,
  startDate: Date,
  endDate: Date,
  format: 'pdf' | 'csv' | 'xlsx' | 'json' = 'pdf',
  emailTo?: string
): Promise<void> {
  try {
    await reportQueue.addJob(
      JOB_NAMES.GENERATE_STAFF_PERFORMANCE,
      {
        type: 'staffPerformance',
        dateRange: { startDate, endDate },
        restaurantId,
        format,
        emailTo,
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`📊 Staff performance report job queued for restaurant: ${restaurantId}`);
  } catch (error) {
    logger.error('Failed to queue staff performance report:', error);
    throw error;
  }
}

/**
 * Export data in various formats
 */
export async function exportData(
  restaurantId: string,
  format: 'csv' | 'xlsx' | 'json',
  filters?: Record<string, any>,
  emailTo?: string
): Promise<void> {
  try {
    await reportQueue.addJob(
      JOB_NAMES.EXPORT_DATA,
      {
        type: 'export',
        restaurantId,
        format,
        filters,
        emailTo,
      },
      {
        priority: JobPriority.LOW,
      }
    );

    logger.info(`📊 Data export job queued for restaurant: ${restaurantId} (format: ${format})`);
  } catch (error) {
    logger.error('Failed to queue data export:', error);
    throw error;
  }
}
