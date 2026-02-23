/**
 * Data Processing Job Helpers
 * Helper functions to add various data processing jobs to the queue
 */

import { dataProcessingQueue, DataProcessingJobData } from '../definitions/dataProcessing.queue';
import { JOB_NAMES, JobPriority } from '../config/queue.config';
import logger from '../../config/logger';

/**
 * Reconcile inventory against physical counts
 */
export async function reconcileInventory(
  restaurantId: string,
  counts: Record<string, number>
): Promise<void> {
  try {
    await dataProcessingQueue.addJob(
      JOB_NAMES.RECONCILE_INVENTORY,
      {
        operation: 'inventory-reconciliation',
        entityId: restaurantId,
        params: { counts },
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`⚙️ Inventory reconciliation job queued for restaurant: ${restaurantId}`);
  } catch (error) {
    logger.error('Failed to queue inventory reconciliation:', error);
    throw error;
  }
}

/**
 * Process payment settlement batch
 */
export async function processPaymentSettlement(batchSize: number = 100): Promise<void> {
  try {
    await dataProcessingQueue.addJob(
      JOB_NAMES.PROCESS_PAYMENT_SETTLEMENT,
      {
        operation: 'payment-settlement',
        params: { batchSize },
      },
      {
        priority: JobPriority.HIGH,
      }
    );

    logger.info(`⚙️ Payment settlement job queued (batch size: ${batchSize})`);
  } catch (error) {
    logger.error('Failed to queue payment settlement:', error);
    throw error;
  }
}

/**
 * Clean up old database records
 */
export async function cleanupDatabase(daysToKeep: number = 90): Promise<void> {
  try {
    await dataProcessingQueue.addJob(
      JOB_NAMES.CLEANUP_DATABASE,
      {
        operation: 'database-cleanup',
        params: { daysToKeep },
      },
      {
        priority: JobPriority.LOW,
      }
    );

    logger.info(`⚙️ Database cleanup job queued (keeping records for ${daysToKeep} days)`);
  } catch (error) {
    logger.error('Failed to queue database cleanup:', error);
    throw error;
  }
}

/**
 * Sync with external service
 */
export async function syncExternalService(
  restaurantId: string,
  service: string,
  data?: Record<string, any>
): Promise<void> {
  try {
    await dataProcessingQueue.addJob(
      JOB_NAMES.SYNC_EXTERNAL_SERVICE,
      {
        operation: 'sync-service',
        entityId: restaurantId,
        params: { service, ...data },
      },
      {
        priority: JobPriority.NORMAL,
      }
    );

    logger.info(`⚙️ External service sync job queued (service: ${service})`);
  } catch (error) {
    logger.error('Failed to queue external service sync:', error);
    throw error;
  }
}
