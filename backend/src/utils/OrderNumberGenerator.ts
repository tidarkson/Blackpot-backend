import logger from '../config/logger';

/**
 * Generate order number in format YYYYMMDD-NNNN
 * Example: 20260204-0001
 */
export function generateOrderNumber(existingOrders: number = 0): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  const dateString = `${year}${month}${day}`;
  const sequenceNumber = String(existingOrders + 1).padStart(4, '0');

  return `${dateString}-${sequenceNumber}`;
}

/**
 * Generate sequential order number for the day
 */
export async function generateDailyOrderNumber(prisma: any, tenantId: string): Promise<string> {
  try {
    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Count orders created today
    const orderCount = await prisma.order.count({
      where: {
        tenantId,
        createdAt: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const orderNumber = generateOrderNumber(orderCount);
    logger.info(`Generated order number: ${orderNumber}`, { tenantId });

    return orderNumber;
  } catch (error: any) {
    logger.error('Error generating order number:', error.message);
    throw error;
  }
}

/**
 * Parse order number to extract date and sequence
 */
export function parseOrderNumber(orderNumber: string): { date: string; sequence: number } | null {
  const regex = /^(\d{8})-(\d{4})$/;
  const match = orderNumber.match(regex);

  if (!match) {
    return null;
  }

  return {
    date: match[1],
    sequence: parseInt(match[2], 10),
  };
}
