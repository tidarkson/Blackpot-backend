import { PrismaClient, Priority, SpecialRequestStatus } from '@prisma/client';
import logger from '../config/logger';

export class SpecialRequestService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Create a new special request for an order
   */
  async createSpecialRequest(
    tenantId: string,
    orderId: string,
    title: string,
    description?: string,
    priority: Priority = 'MEDIUM'
  ) {
    try {
      // Verify order exists
      const order = await this.prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const specialRequest = await this.prisma.specialRequest.create({
        data: {
          tenantId,
          orderId,
          title,
          description,
          priority,
        },
      });

      logger.info(`Special request created: ${specialRequest.id}`, { orderId, tenantId });
      return specialRequest;
    } catch (error: any) {
      logger.error('Error creating special request:', error.message);
      throw error;
    }
  }

  /**
   * Get special request by ID
   */
  async getSpecialRequestById(id: string, tenantId: string) {
    try {
      const specialRequest = await this.prisma.specialRequest.findFirst({
        where: { id, tenantId },
        include: {
          order: true,
        },
      });

      if (!specialRequest) {
        throw new Error('Special request not found');
      }

      return specialRequest;
    } catch (error: any) {
      logger.error('Error fetching special request:', error.message);
      throw error;
    }
  }

  /**
   * Get all special requests for an order
   */
  async getSpecialRequestsByOrder(orderId: string, tenantId: string) {
    try {
      const specialRequests = await this.prisma.specialRequest.findMany({
        where: { orderId, tenantId },
        orderBy: { createdAt: 'desc' },
      });

      return specialRequests;
    } catch (error: any) {
      logger.error('Error fetching special requests:', error.message);
      throw error;
    }
  }

  /**
   * Update special request status
   */
  async updateSpecialRequestStatus(id: string, tenantId: string, status: SpecialRequestStatus) {
    try {
      const specialRequest = await this.getSpecialRequestById(id, tenantId);

      const updated = await this.prisma.specialRequest.update({
        where: { id },
        data: { status },
      });

      logger.info(`Special request status updated: ${id} → ${status}`, { tenantId });
      return updated;
    } catch (error: any) {
      logger.error('Error updating special request status:', error.message);
      throw error;
    }
  }

  /**
   * Update special request
   */
  async updateSpecialRequest(
    id: string,
    tenantId: string,
    data: {
      title?: string;
      description?: string;
      priority?: Priority;
      status?: SpecialRequestStatus;
    }
  ) {
    try {
      await this.getSpecialRequestById(id, tenantId);

      const updated = await this.prisma.specialRequest.update({
        where: { id },
        data: {
          title: data.title,
          description: data.description,
          priority: data.priority,
          status: data.status,
        },
      });

      logger.info(`Special request updated: ${id}`, { tenantId });
      return updated;
    } catch (error: any) {
      logger.error('Error updating special request:', error.message);
      throw error;
    }
  }

  /**
   * Delete special request
   */
  async deleteSpecialRequest(id: string, tenantId: string) {
    try {
      await this.getSpecialRequestById(id, tenantId);

      await this.prisma.specialRequest.delete({
        where: { id },
      });

      logger.info(`Special request deleted: ${id}`, { tenantId });
      return true;
    } catch (error: any) {
      logger.error('Error deleting special request:', error.message);
      throw error;
    }
  }

  /**
   * Get special requests by status
   */
  async getSpecialRequestsByStatus(tenantId: string, status: SpecialRequestStatus) {
    try {
      return await this.prisma.specialRequest.findMany({
        where: { tenantId, status },
        include: {
          order: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: any) {
      logger.error('Error fetching special requests by status:', error.message);
      throw error;
    }
  }

  /**
   * Get high-priority special requests
   */
  async getHighPriorityRequests(tenantId: string) {
    try {
      return await this.prisma.specialRequest.findMany({
        where: { tenantId, priority: 'HIGH' },
        include: {
          order: true,
        },
        orderBy: { createdAt: 'asc' },
      });
    } catch (error: any) {
      logger.error('Error fetching high-priority requests:', error.message);
      throw error;
    }
  }
}
