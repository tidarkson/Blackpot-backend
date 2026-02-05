import { Request, Response, NextFunction } from 'express';
import { SpecialRequestService } from '../services/SpecialRequestService';
import { AuthRequest } from '../types/auth';
import { addSpecialRequestSchema, updateSpecialRequestSchema } from '../validators/order.validator';
import logger from '../config/logger';

export class SpecialRequestController {
  constructor(private specialRequestService: SpecialRequestService) {}

  /**
   * Create a special request for an order
   * POST /api/orders/:orderId/special-requests
   */
  async createSpecialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const validatedData = addSpecialRequestSchema.parse(req.body);
      const { title, description, priority } = validatedData;

      const specialRequest = await this.specialRequestService.createSpecialRequest(
        tenantId,
        orderId,
        title,
        description,
        priority as any
      );

      logger.info('Special request created', { orderId, tenantId });
      res.status(201).json({
        success: true,
        data: specialRequest,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get special requests for an order
   * GET /api/orders/:orderId/special-requests
   */
  async getSpecialRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { orderId } = req.params;

      const specialRequests = await this.specialRequestService.getSpecialRequestsByOrder(
        orderId,
        tenantId
      );

      logger.info('Special requests retrieved', { orderId, tenantId, count: specialRequests.length });
      res.json({
        success: true,
        data: specialRequests,
        count: specialRequests.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get special request by ID
   * GET /api/special-requests/:requestId
   */
  async getSpecialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { requestId } = req.params;

      const specialRequest = await this.specialRequestService.getSpecialRequestById(
        requestId,
        tenantId
      );

      logger.info('Special request retrieved', { requestId, tenantId });
      res.json({
        success: true,
        data: specialRequest,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update special request
   * PUT /api/special-requests/:requestId
   */
  async updateSpecialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { requestId } = req.params;

      const validatedData = updateSpecialRequestSchema.parse(req.body);

      const specialRequest = await this.specialRequestService.updateSpecialRequest(
        requestId,
        tenantId,
        validatedData
      );

      logger.info('Special request updated', { requestId, tenantId });
      res.json({
        success: true,
        data: specialRequest,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete special request
   * DELETE /api/special-requests/:requestId
   */
  async deleteSpecialRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;
      const { requestId } = req.params;

      await this.specialRequestService.deleteSpecialRequest(requestId, tenantId);

      logger.info('Special request deleted', { requestId, tenantId });
      res.json({
        success: true,
        message: 'Special request deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get high-priority special requests
   * GET /api/special-requests/priority/HIGH
   */
  async getHighPriorityRequests(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenantId!;

      const requests = await this.specialRequestService.getHighPriorityRequests(tenantId);

      logger.info('High-priority requests retrieved', { tenantId, count: requests.length });
      res.json({
        success: true,
        data: requests,
        count: requests.length,
      });
    } catch (error) {
      next(error);
    }
  }
}
