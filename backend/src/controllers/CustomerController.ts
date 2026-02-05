import { Request, Response } from 'express';
import CustomerService from '../services/CustomerService';
import {
  createCustomerSchema,
  updateCustomerSchema,
  updatePreferencesSchema,
  updateVipStatusSchema,
  customerSearchSchema,
  paginationSchema,
} from '../validators/customer.validator';
import logger from '../config/logger';

/**
 * Helper: Extract string value from Express param that can be string | string[]
 */
const asString = (val: any): string => (Array.isArray(val) ? val[0] : val);

/**
 * CustomerController
 *
 * Handles HTTP request/response cycle for customer operations
 * - Validates input
 * - Calls service layer
 * - Formats and returns responses
 * - Manages error handling
 */
export class CustomerController {
  /**
   * GET /api/customers
   * List all customers with filtering and pagination
   *
   * Query parameters:
   * - vipStatus: true/false
   * - minSpend: number
   * - maxSpend: number
   * - minVisits: number
   * - maxVisits: number
   * - tags: comma-separated string
   * - page: number (default: 1)
   * - pageSize: number (default: 25, max: 100)
   *
   * Response: 200 OK with paginated customer list
   */
  async getAllCustomers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate query parameters
      let pagination;
      try {
        pagination = paginationSchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: validationError.errors,
        });
        return;
      }

      // Build filters
      const filters: any = {};

      if (req.query.vipStatus) {
        filters.vipStatus = req.query.vipStatus === 'true';
      }

      if (req.query.minSpend) {
        filters.minSpend = parseFloat(req.query.minSpend as string);
      }

      if (req.query.maxSpend) {
        filters.maxSpend = parseFloat(req.query.maxSpend as string);
      }

      if (req.query.minVisits) {
        filters.minVisits = parseInt(req.query.minVisits as string);
      }

      if (req.query.maxVisits) {
        filters.maxVisits = parseInt(req.query.maxVisits as string);
      }

      if (req.query.tags) {
        filters.tags = (req.query.tags as string).split(',').filter((t) => t);
      }

      const result = await CustomerService.getAllCustomers(tenantId, filters, {
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error fetching customers: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch customers',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/search
   * Search customers by name, phone, or email
   *
   * Query parameters:
   * - q: search query (required)
   * - type: 'name' | 'phone' | 'email' | 'all' (default: all)
   * - page: number (default: 1)
   * - pageSize: number (default: 25)
   */
  async searchCustomers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate input
      let searchData;
      try {
        searchData = customerSearchSchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid search parameters',
          details: validationError.errors,
        });
        return;
      }

      const result = await CustomerService.searchCustomers(
        tenantId,
        searchData.q,
        searchData.type || 'all',
        {
          page: searchData.page || 1,
          pageSize: searchData.pageSize || 25,
        }
      );

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error searching customers: ${error.message}`);
      res.status(500).json({
        error: 'Failed to search customers',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/:id
   * Get customer profile by ID
   */
  async getCustomer(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const customer = await CustomerService.getCustomerById(asString(id), tenantId);
      res.status(200).json(customer);
    } catch (error: any) {
      logger.error(`Error fetching customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to fetch customer',
          details: error.message,
        });
      }
    }
  }

  /**
   * POST /api/customers
   * Create new customer
   */
  async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate input
      let data;
      try {
        data = createCustomerSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid customer data',
          details: validationError.errors,
        });
        return;
      }

      const customer = await CustomerService.createCustomer(
        data,
        tenantId,
        serverId
      );

      res.status(201).json(customer);
    } catch (error: any) {
      logger.error(`Error creating customer: ${error.message}`);
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
      } else {
        res.status(500).json({
          error: 'Failed to create customer',
          details: error.message,
        });
      }
    }
  }

  /**
   * PUT /api/customers/:id
   * Update customer
   */
  async updateCustomer(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate input
      let data;
      try {
        data = updateCustomerSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid update data',
          details: validationError.errors,
        });
        return;
      }

      const customer = await CustomerService.updateCustomer(
        id,
        data,
        tenantId,
        serverId
      );

      res.status(200).json(customer);
    } catch (error: any) {
      logger.error(`Error updating customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to update customer',
          details: error.message,
        });
      }
    }
  }

  /**
   * DELETE /api/customers/:id
   * Soft delete customer
   */
  async deleteCustomer(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const { id } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const customer = await CustomerService.deleteCustomer(asString(id), tenantId, serverId);
      res.status(200).json({
        message: 'Customer deleted successfully',
        customer,
      });
    } catch (error: any) {
      logger.error(`Error deleting customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to delete customer',
          details: error.message,
        });
      }
    }
  }

  // ========================================
  // VIP MANAGEMENT
  // ========================================

  /**
   * GET /api/customers/vip
   * Get all VIP customers
   */
  async getVipCustomers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate pagination
      let pagination;
      try {
        pagination = paginationSchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: validationError.errors,
        });
        return;
      }

      const result = await CustomerService.getVipCustomers(tenantId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error fetching VIP customers: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch VIP customers',
        details: error.message,
      });
    }
  }

  /**
   * PATCH /api/customers/:id/vip-status
   * Update VIP status for a customer
   */
  async updateVipStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate input
      let data;
      try {
        data = updateVipStatusSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid VIP status data',
          details: validationError.errors,
        });
        return;
      }

      const customer = await CustomerService.updateVipStatus(
        id,
        tenantId,
        data.vipStatus,
        data.vipTier || undefined,
        serverId
      );

      res.status(200).json(customer);
    } catch (error: any) {
      logger.error(`Error updating VIP status for customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to update VIP status',
          details: error.message,
        });
      }
    }
  }

  // ========================================
  // CUSTOMER HISTORY
  // ========================================

  /**
   * GET /api/customers/:id/reservations
   * Get all reservations for a customer
   */
  async getCustomerReservations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate pagination
      let pagination;
      try {
        pagination = paginationSchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: validationError.errors,
        });
        return;
      }

      const result = await CustomerService.getCustomerReservations(id, tenantId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error fetching reservations for customer ${req.params.id}: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch reservations',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/:id/orders
   * Get all orders for a customer
   */
  async getCustomerOrders(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate pagination
      let pagination;
      try {
        pagination = paginationSchema.parse(req.query);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid query parameters',
          details: validationError.errors,
        });
        return;
      }

      const result = await CustomerService.getCustomerOrders(id, tenantId, {
        page: pagination.page,
        pageSize: pagination.pageSize,
      });

      res.status(200).json(result);
    } catch (error: any) {
      logger.error(`Error fetching orders for customer ${req.params.id}: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch orders',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/:id/stats
   * Get customer statistics
   */
  async getCustomerStats(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const stats = await CustomerService.getCustomerStats(id, tenantId);
      res.status(200).json(stats);
    } catch (error: any) {
      logger.error(`Error fetching stats for customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to fetch customer stats',
          details: error.message,
        });
      }
    }
  }

  // ========================================
  // PREFERENCES
  // ========================================

  /**
   * GET /api/customers/:id/preferences
   * Get customer preferences
   */
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const preferences = await CustomerService.getPreferences(id, tenantId);
      res.status(200).json(preferences);
    } catch (error: any) {
      logger.error(`Error fetching preferences for customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to fetch preferences',
          details: error.message,
        });
      }
    }
  }

  /**
   * PUT /api/customers/:id/preferences
   * Update customer preferences
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate input
      let data;
      try {
        data = updatePreferencesSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({
          error: 'Invalid preferences data',
          details: validationError.errors,
        });
        return;
      }

      const customer = await CustomerService.updatePreferences(
        id,
        tenantId,
        data,
        serverId
      );

      res.status(200).json(customer);
    } catch (error: any) {
      logger.error(`Error updating preferences for customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to update preferences',
          details: error.message,
        });
      }
    }
  }

  // ========================================
  // ANALYTICS
  // ========================================

  /**
   * GET /api/customers/analytics/top-spenders
   * Get top customers by lifetime spend
   */
  async getTopSpenders(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

      const topSpenders = await CustomerService.getTopCustomersBySpend(
        tenantId,
        Math.min(limit, 100)
      );

      res.status(200).json({
        topSpenders,
      });
    } catch (error: any) {
      logger.error(`Error fetching top spenders: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch top spenders',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/analytics/vip-stats
   * Get VIP customer statistics
   */
  async getVipAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const analytics = await CustomerService.getVipAnalytics(tenantId);
      res.status(200).json(analytics);
    } catch (error: any) {
      logger.error(`Error calculating VIP analytics: ${error.message}`);
      res.status(500).json({
        error: 'Failed to calculate VIP analytics',
        details: error.message,
      });
    }
  }

  /**
   * GET /api/customers/analytics/retention
   * Get customer retention rate
   */
  async getRetentionAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const daysBack = req.query.daysBack
        ? parseInt(req.query.daysBack as string)
        : 90;

      const analytics = await CustomerService.getRetentionAnalytics(
        tenantId,
        Math.max(1, Math.min(daysBack, 365))
      );

      res.status(200).json(analytics);
    } catch (error: any) {
      logger.error(`Error calculating retention analytics: ${error.message}`);
      res.status(500).json({
        error: 'Failed to calculate retention analytics',
        details: error.message,
      });
    }
  }

  // ========================================
  // PRIVACY & COMPLIANCE
  // ========================================

  /**
   * GET /api/customers/:id/export
   * Export all customer data (GDPR)
   */
  async exportCustomerData(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const data = await CustomerService.exportCustomerData(id, tenantId);

      res.status(200).json(data);
    } catch (error: any) {
      logger.error(`Error exporting customer data: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to export customer data',
          details: error.message,
        });
      }
    }
  }

  /**
   * DELETE /api/customers/:id/gdpr
   * Hard delete customer and anonymize data (GDPR compliance)
   */
  async hardDeleteCustomer(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Require confirmation
      const { confirm } = req.body;
      if (!confirm) {
        res.status(400).json({
          error: 'GDPR deletion must be confirmed with confirm=true in body',
        });
        return;
      }

      await CustomerService.hardDeleteCustomer(id, tenantId, serverId);

      res.status(200).json({
        message:
          'Customer deleted permanently and data anonymized (GDPR compliance)',
        customerId: id,
      });
    } catch (error: any) {
      logger.error(`Error hard deleting customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to delete customer',
          details: error.message,
        });
      }
    }
  }

  /**
   * GET /api/customers/:id/duplicates
   * Detect potential duplicate customers
   */
  async detectDuplicates(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const id = asString(req.params.id);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const duplicates = await CustomerService.detectDuplicates(id, tenantId);

      res.status(200).json({
        customerId: id,
        potentialDuplicates: duplicates,
        duplicateCount: duplicates.length,
      });
    } catch (error: any) {
      logger.error(`Error detecting duplicates for customer ${req.params.id}: ${error.message}`);
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Customer not found' });
      } else {
        res.status(500).json({
          error: 'Failed to detect duplicates',
          details: error.message,
        });
      }
    }
  }

  /**
   * POST /api/customers/:id/merge/:otherId
   * Merge two customers (consolidate duplicate records)
   */
  async mergeCustomers(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = req.user?.userId;
      const id = asString(req.params.id);
      const otherId = asString(req.params.otherId);

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Require confirmation
      const { confirm } = req.body;
      if (!confirm) {
        res.status(400).json({
          error: 'Merge must be confirmed with confirm=true in body',
        });
        return;
      }

      const merged = await CustomerService.mergeCustomers(
        id,
        otherId,
        tenantId,
        serverId
      );

      res.status(200).json({
        message: `Customer ${otherId} merged into ${id}`,
        mergedCustomer: merged,
      });
    } catch (error: any) {
      logger.error(
        `Error merging customers ${req.params.id} and ${req.params.otherId}: ${error.message}`
      );
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'One or both customers not found' });
      } else {
        res.status(500).json({
          error: 'Failed to merge customers',
          details: error.message,
        });
      }
    }
  }
}

export const customerController = new CustomerController();
