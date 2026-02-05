import { PrismaClient, VipTier } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export interface CustomerPreferences {
  dietaryRestrictions?: string[];
  favoriteItems?: string[];
  seatingPreference?: string;
  winePreferences?: string[];
  allergies?: string[];
  specialOccasions?: Array<{ type: string; date?: string }>;
  notes?: string;
}

export interface CreateCustomerRequest {
  name: string;
  phone: string;
  email?: string;
  preferences?: CustomerPreferences;
  tags?: string[];
  notes?: string;
}

export interface UpdateCustomerRequest {
  name?: string;
  email?: string;
  preferences?: CustomerPreferences;
  tags?: string[];
  notes?: string;
  vipStatus?: boolean;
  vipTier?: VipTier | null;
}

export interface CustomerSearchFilters {
  query?: string;
  searchType?: 'name' | 'phone' | 'email' | 'all';
  vipStatus?: boolean;
  minSpend?: number;
  maxSpend?: number;
  minVisits?: number;
  maxVisits?: number;
  tags?: string[];
  excludeDeleted?: boolean;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

/**
 * CustomerService
 *
 * Manages all customer-related business logic:
 * - CRUD operations for customers
 * - VIP tracking and auto-promotion
 * - Customer preferences management
 * - Search and filtering
 * - Merge duplicate customers
 * - Privacy and GDPR compliance
 */
export class CustomerService {
  /**
   * VIP PROMOTION THRESHOLDS
   * Customize these per restaurant if needed
   */
  private readonly VIP_SPEND_THRESHOLD = 1000;
  private readonly VIP_VISIT_THRESHOLD = 10;
  private readonly PLATINUM_SPEND_THRESHOLD = 2500;
  private readonly DIAMOND_SPEND_THRESHOLD = 5000;

  // ========================================
  // CREATE OPERATIONS
  // ========================================

  /**
   * Create a new customer
   * @param data Customer creation data
   * @param tenantId Tenant context
   * @param serverId User creating the customer (for audit)
   * @returns Created customer record
   */
  async createCustomer(
    data: CreateCustomerRequest,
    tenantId: string,
    serverId?: string
  ) {
    try {
      // Check if customer already exists by phone
      const existingCustomer = await this.findByPhone(data.phone, tenantId);
      if (existingCustomer && !existingCustomer.deletedAt) {
        throw new Error(
          `Customer with phone ${data.phone} already exists for this tenant`
        );
      }

      // Create customer
      const customer = await prisma.$transaction(async (tx) => {
        const newCustomer = await tx.customer.create({
          data: {
            tenantId,
            name: data.name,
            phone: data.phone,
            email: data.email?.toLowerCase(),
            preferences: data.preferences ? (JSON.stringify(data.preferences) as any) : undefined,
            tags: data.tags || [],
            notes: data.notes,
          },
        });

        // Log activity
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'CREATE',
              entity: 'Customer',
              entityId: newCustomer.id,
              metadata: {
                name: data.name,
                phone: data.phone,
                email: data.email,
              },
            },
          });
        }

        return newCustomer;
      });

      logger.info(`Created customer ${customer.id} for tenant ${tenantId}`);
      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error creating customer: ${error}`);
      throw error;
    }
  }

  // ========================================
  // READ OPERATIONS
  // ========================================

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error fetching customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get all customers with filtering and pagination
   */
  async getAllCustomers(
    tenantId: string,
    filters?: CustomerSearchFilters,
    pagination?: PaginationOptions
  ) {
    try {
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 25;
      const skip = (page - 1) * pageSize;

      // Build where clause
      const where: any = {
        tenantId,
        deletedAt: filters?.excludeDeleted !== false ? null : undefined,
      };

      if (filters?.vipStatus !== undefined) {
        where.vipStatus = filters.vipStatus;
      }

      if (filters?.minSpend !== undefined) {
        where.lifetimeSpend = { gte: new Decimal(filters.minSpend) };
      }

      if (filters?.maxSpend !== undefined) {
        where.lifetimeSpend = {
          ...where.lifetimeSpend,
          lte: new Decimal(filters.maxSpend),
        };
      }

      if (filters?.minVisits !== undefined) {
        where.visitCount = { gte: filters.minVisits };
      }

      if (filters?.maxVisits !== undefined) {
        where.visitCount = {
          ...where.visitCount,
          lte: filters.maxVisits,
        };
      }

      if (filters?.tags && filters.tags.length > 0) {
        where.tags = { hasSome: filters.tags };
      }

      // Get total count
      const total = await prisma.customer.count({ where });

      // Get customers
      const customers = await prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data: customers.map((c) => this.formatCustomer(c)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error(`Error fetching customers: ${error}`);
      throw error;
    }
  }

  /**
   * Search customers by name, phone, or email
   */
  async searchCustomers(
    tenantId: string,
    query: string,
    searchType: 'name' | 'phone' | 'email' | 'all' = 'all',
    pagination?: PaginationOptions
  ) {
    try {
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 25;
      const skip = (page - 1) * pageSize;

      const where: any = {
        tenantId,
        deletedAt: null,
        OR: [],
      };

      // Build search conditions
      if (searchType === 'name' || searchType === 'all') {
        where.OR.push({
          name: {
            contains: query,
            mode: 'insensitive',
          },
        });
      }

      if (searchType === 'phone' || searchType === 'all') {
        where.OR.push({
          phone: {
            contains: query,
            mode: 'insensitive',
          },
        });
      }

      if (searchType === 'email' || searchType === 'all') {
        where.OR.push({
          email: {
            contains: query,
            mode: 'insensitive',
          },
        });
      }

      // Get total count
      const total = await prisma.customer.count({ where });

      // Get customers
      const customers = await prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data: customers.map((c) => this.formatCustomer(c)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error(`Error searching customers: ${error}`);
      throw error;
    }
  }

  /**
   * Find customer by phone
   */
  async findByPhone(phone: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findUnique({
        where: {
          tenantId_phone: {
            tenantId,
            phone,
          },
        },
      });

      return customer ? this.formatCustomer(customer) : null;
    } catch (error) {
      logger.error(`Error finding customer by phone: ${error}`);
      throw error;
    }
  }

  /**
   * Find customer by email
   */
  async findByEmail(email: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          tenantId,
          email,
          deletedAt: null,
        },
      });

      return customer ? this.formatCustomer(customer) : null;
    } catch (error) {
      logger.error(`Error finding customer by email: ${error}`);
      throw error;
    }
  }

  // ========================================
  // UPDATE OPERATIONS
  // ========================================

  /**
   * Update customer
   */
  async updateCustomer(
    customerId: string,
    data: UpdateCustomerRequest,
    tenantId: string,
    serverId?: string
  ) {
    try {
      const updateData: any = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email?.toLowerCase();
      if (data.preferences !== undefined)
        updateData.preferences = JSON.stringify(data.preferences);
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.vipStatus !== undefined) updateData.vipStatus = data.vipStatus;
      if (data.vipTier !== undefined) updateData.vipTier = data.vipTier;

      const customer = await prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: customerId },
          data: updateData,
        });

        // Log activity
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'UPDATE',
              entity: 'Customer',
              entityId: customerId,
              metadata: { changes: updateData },
            },
          });
        }

        return updated;
      });

      logger.info(`Updated customer ${customerId}`);
      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error updating customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Update customer VIP status
   */
  async updateVipStatus(
    customerId: string,
    tenantId: string,
    vipStatus: boolean,
    vipTier?: VipTier | null,
    serverId?: string
  ) {
    try {
      const customer = await prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: customerId },
          data: {
            vipStatus,
            vipTier: vipStatus ? vipTier || VipTier.GOLD : null,
          },
        });

        // Log activity
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'UPDATE_VIP_STATUS',
              entity: 'Customer',
              entityId: customerId,
              metadata: {
                vipStatus,
                vipTier: vipStatus ? vipTier || VipTier.GOLD : null,
              },
            },
          });
        }

        return updated;
      });

      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error updating VIP status for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  // ========================================
  // CUSTOMER METRICS & TRACKING
  // ========================================

  /**
   * Record order completion for customer
   * Updates visit count, lifetime spend, last visit, and average check
   * Triggers VIP auto-promotion check
   */
  async recordOrderCompletion(
    customerId: string | undefined,
    orderTotal: Decimal,
    tenantId: string
  ) {
    if (!customerId) return null;

    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) return null;

      const newVisitCount = customer.visitCount + 1;
      const newLifetimeSpend = customer.lifetimeSpend.plus(orderTotal);
      const newAverageCheck = newLifetimeSpend.div(newVisitCount);

      const updatedCustomer = await prisma.customer.update({
        where: { id: customerId },
        data: {
          visitCount: newVisitCount,
          lifetimeSpend: newLifetimeSpend,
          averageCheck: newAverageCheck,
          lastVisit: new Date(),
        },
      });

      // Check and promote VIP status
      const promotedCustomer = await this.evaluateVipStatus(customerId, tenantId);

      logger.info(`Recorded order completion for customer ${customerId}`);
      return this.formatCustomer(promotedCustomer);
    } catch (error) {
      logger.error(`Error recording order completion for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Evaluate and auto-promote VIP status
   * Promotion rules:
   * - GOLD: lifetime_spend > $1000 OR visit_count > 10
   * - PLATINUM: lifetime_spend > $2500
   * - DIAMOND: lifetime_spend > $5000
   */
  async evaluateVipStatus(customerId: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      let newVipStatus = customer.vipStatus;
      let newVipTier = customer.vipTier;

      const spend = customer.lifetimeSpend;
      const visits = customer.visitCount;

      // Determine VIP tier
      if (spend.gte(this.DIAMOND_SPEND_THRESHOLD)) {
        newVipStatus = true;
        newVipTier = VipTier.DIAMOND;
      } else if (spend.gte(this.PLATINUM_SPEND_THRESHOLD)) {
        newVipStatus = true;
        newVipTier = VipTier.PLATINUM;
      } else if (
        spend.gte(this.VIP_SPEND_THRESHOLD) ||
        visits >= this.VIP_VISIT_THRESHOLD
      ) {
        newVipStatus = true;
        newVipTier = VipTier.GOLD;
      } else {
        newVipStatus = false;
        newVipTier = null;
      }

      // Only update if status changed
      if (
        newVipStatus !== customer.vipStatus ||
        newVipTier !== customer.vipTier
      ) {
        const updatedCustomer = await prisma.customer.update({
          where: { id: customerId },
          data: {
            vipStatus: newVipStatus,
            vipTier: newVipTier,
          },
        });

        logger.info(
          `VIP status promoted for customer ${customerId}: ${newVipTier || 'NONE'}`
        );

        // Log promotion
        await prisma.activityLog.create({
          data: {
            tenantId,
            action: 'VIP_PROMOTION',
            entity: 'Customer',
            entityId: customerId,
            metadata: {
              previousTier: customer.vipTier,
              newTier: newVipTier,
              lifetimeSpend: spend.toString(),
              visitCount: visits,
            },
          },
        });

        return updatedCustomer;
      }

      return customer;
    } catch (error) {
      logger.error(`Error evaluating VIP status for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get customer preferences
   */
  async getPreferences(customerId: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      return customer.preferences ? JSON.parse(customer.preferences as string) : {};
    } catch (error) {
      logger.error(`Error fetching preferences for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Update customer preferences
   */
  async updatePreferences(
    customerId: string,
    tenantId: string,
    preferences: CustomerPreferences,
    serverId?: string
  ) {
    try {
      const customer = await prisma.$transaction(async (tx) => {
        const updated = await tx.customer.update({
          where: { id: customerId },
          data: {
            preferences: JSON.stringify(preferences),
          },
        });

        // Log activity
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'UPDATE_PREFERENCES',
              entity: 'Customer',
              entityId: customerId,
              metadata: { preferences } as any,
            },
          });
        }

        return updated;
      });

      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error updating preferences for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  // ========================================
  // CUSTOMER HISTORY
  // ========================================

  /**
   * Get all reservations for customer
   */
  async getCustomerReservations(
    customerId: string,
    tenantId: string,
    pagination?: PaginationOptions
  ) {
    try {
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 25;
      const skip = (page - 1) * pageSize;

      const total = await prisma.reservation.count({
        where: {
          customerId,
          tenantId,
          cancelledAt: null,
        },
      });

      const reservations = await prisma.reservation.findMany({
        where: {
          customerId,
          tenantId,
          cancelledAt: null,
        },
        include: {
          table: true,
        },
        skip,
        take: pageSize,
        orderBy: { reservedAt: 'desc' },
      });

      return {
        data: reservations,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error(`Error fetching reservations for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get all orders for customer
   */
  async getCustomerOrders(
    customerId: string,
    tenantId: string,
    pagination?: PaginationOptions
  ) {
    try {
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 25;
      const skip = (page - 1) * pageSize;

      const total = await prisma.order.count({
        where: {
          customerId,
          tenantId,
          deletedAt: null,
        },
      });

      const orders = await prisma.order.findMany({
        where: {
          customerId,
          tenantId,
          deletedAt: null,
        },
        include: {
          table: true,
          server: true,
          payments: true,
        },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      });

      return {
        data: orders,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error(`Error fetching orders for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get customer statistics
   */
  async getCustomerStats(customerId: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const reservations = await prisma.reservation.findMany({
        where: {
          customerId,
          tenantId,
        },
      });

      const orders = await prisma.order.findMany({
        where: {
          customerId,
          tenantId,
          deletedAt: null,
        },
      });

      return {
        visitCount: customer.visitCount,
        lifetimeSpend: customer.lifetimeSpend.toString(),
        averageCheck: customer.averageCheck.toString(),
        lastVisit: customer.lastVisit,
        vipStatus: customer.vipStatus,
        vipTier: customer.vipTier,
        totalReservations: reservations.length,
        totalOrders: orders.length,
        joinDate: customer.createdAt,
      };
    } catch (error) {
      logger.error(`Error fetching stats for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  // ========================================
  // SEARCH & ADVANCED FEATURES
  // ========================================

  /**
   * Get all VIP customers
   */
  async getVipCustomers(
    tenantId: string,
    pagination?: PaginationOptions
  ) {
    try {
      const page = pagination?.page || 1;
      const pageSize = pagination?.pageSize || 25;
      const skip = (page - 1) * pageSize;

      const total = await prisma.customer.count({
        where: {
          tenantId,
          vipStatus: true,
          deletedAt: null,
        },
      });

      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          vipStatus: true,
          deletedAt: null,
        },
        skip,
        take: pageSize,
        orderBy: { lifetimeSpend: 'desc' },
      });

      return {
        data: customers.map((c) => this.formatCustomer(c)),
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    } catch (error) {
      logger.error(`Error fetching VIP customers: ${error}`);
      throw error;
    }
  }

  /**
   * Get top customers by spend
   */
  async getTopCustomersBySpend(
    tenantId: string,
    limit: number = 10
  ) {
    try {
      const customers = await prisma.customer.findMany({
        where: {
          tenantId,
          deletedAt: null,
        },
        orderBy: { lifetimeSpend: 'desc' },
        take: limit,
      });

      return customers.map((c) => this.formatCustomer(c));
    } catch (error) {
      logger.error(`Error fetching top customers: ${error}`);
      throw error;
    }
  }

  /**
   * Detect potential duplicate customers (similar name + phone)
   */
  async detectDuplicates(
    customerId: string,
    tenantId: string
  ) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      // Find customers with similar phone (same last 7 digits)
      const phonePattern = customer.phone.slice(-7);

      const potentialDuplicates = await prisma.customer.findMany({
        where: {
          tenantId,
          deletedAt: null,
          NOT: { id: customerId },
          phone: {
            endsWith: phonePattern,
          },
        },
      });

      return potentialDuplicates.map((c) => this.formatCustomer(c));
    } catch (error) {
      logger.error(`Error detecting duplicates for customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Merge two customers (consolidate duplicate records)
   */
  async mergeCustomers(
    primaryCustomerId: string,
    mergeCustomerId: string,
    tenantId: string,
    serverId?: string
  ) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Get both customers
        const primary = await tx.customer.findUnique({
          where: { id: primaryCustomerId },
        });

        const merge = await tx.customer.findUnique({
          where: { id: mergeCustomerId },
        });

        if (!primary || !merge) {
          throw new Error('One or both customers not found');
        }

        // Update all reservations from merge customer to primary
        await tx.reservation.updateMany({
          where: { customerId: mergeCustomerId },
          data: { customerId: primaryCustomerId },
        });

        // Update all orders from merge customer to primary
        await tx.order.updateMany({
          where: { customerId: mergeCustomerId },
          data: { customerId: primaryCustomerId },
        });

        // Consolidate metrics
        const consolidatedCustomer = await tx.customer.update({
          where: { id: primaryCustomerId },
          data: {
            visitCount: primary.visitCount + merge.visitCount,
            lifetimeSpend: primary.lifetimeSpend.plus(merge.lifetimeSpend),
            averageCheck: primary.lifetimeSpend
              .plus(merge.lifetimeSpend)
              .div(primary.visitCount + merge.visitCount),
            lastVisit:
              merge.lastVisit && primary.lastVisit
                ? merge.lastVisit > primary.lastVisit
                  ? merge.lastVisit
                  : primary.lastVisit
                : merge.lastVisit || primary.lastVisit,
            // Merge tags
            tags: Array.from(new Set([...primary.tags, ...merge.tags])),
          },
        });

        // Soft delete merged customer
        await tx.customer.update({
          where: { id: mergeCustomerId },
          data: { deletedAt: new Date() },
        });

        // Log merge
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'MERGE_CUSTOMERS',
              entity: 'Customer',
              entityId: primaryCustomerId,
              metadata: {
                mergedCustomerId: mergeCustomerId,
                consolidatedMetrics: {
                  visitCount: consolidatedCustomer.visitCount,
                  lifetimeSpend: consolidatedCustomer.lifetimeSpend.toString(),
                },
              },
            },
          });
        }

        return consolidatedCustomer;
      });

      logger.info(`Merged customer ${mergeCustomerId} into ${primaryCustomerId}`);
      return this.formatCustomer(result);
    } catch (error) {
      logger.error(`Error merging customers: ${error}`);
      throw error;
    }
  }

  // ========================================
  // DELETE & PRIVACY OPERATIONS
  // ========================================

  /**
   * Soft delete customer
   */
  async deleteCustomer(
    customerId: string,
    tenantId: string,
    serverId?: string
  ) {
    try {
      const customer = await prisma.$transaction(async (tx) => {
        const deleted = await tx.customer.update({
          where: { id: customerId },
          data: { deletedAt: new Date() },
        });

        // Log deletion
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'SOFT_DELETE',
              entity: 'Customer',
              entityId: customerId,
              metadata: { name: deleted.name, phone: deleted.phone },
            },
          });
        }

        return deleted;
      });

      logger.info(`Deleted customer ${customerId}`);
      return this.formatCustomer(customer);
    } catch (error) {
      logger.error(`Error deleting customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Export customer data (GDPR)
   */
  async exportCustomerData(customerId: string, tenantId: string) {
    try {
      const customer = await prisma.customer.findFirst({
        where: {
          id: customerId,
          tenantId,
        },
      });

      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }

      const reservations = await prisma.reservation.findMany({
        where: { customerId },
        include: { table: true },
      });

      const orders = await prisma.order.findMany({
        where: { customerId },
        include: {
          table: true,
          payments: true,
          tips: true,
        },
      });

      const activityLogs = await prisma.activityLog.findMany({
        where: {
          tenantId,
          entity: 'Customer',
          entityId: customerId,
        },
      });

      return {
        profile: this.formatCustomer(customer),
        reservations,
        orders,
        preferences: customer.preferences ? JSON.parse(customer.preferences as string) : {},
        activityLogs,
        exportDate: new Date(),
      };
    } catch (error) {
      logger.error(`Error exporting customer data: ${error}`);
      throw error;
    }
  }

  /**
   * Hard delete customer and anonymize data (GDPR compliance)
   */
  async hardDeleteCustomer(
    customerId: string,
    tenantId: string,
    serverId?: string
  ) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        // Get customer
        const customer = await tx.customer.findUnique({
          where: { id: customerId },
        });

        if (!customer) {
          throw new Error(`Customer ${customerId} not found`);
        }

        // Anonymize all reservations
        await tx.reservation.updateMany({
          where: { customerId },
          data: {
            customerId: null,
            guestName: 'DELETED_CUSTOMER',
            guestEmail: null,
            guestPhone: null,
            notes: '[Data removed for GDPR compliance]',
          },
        });

        // Anonymize all orders (but keep for financial audit)
        await tx.order.updateMany({
          where: { customerId },
          data: {
            customerId: null,
          },
        });

        // Delete customer
        await tx.customer.delete({
          where: { id: customerId },
        });

        // Log deletion
        if (serverId) {
          await tx.activityLog.create({
            data: {
              tenantId,
              userId: serverId,
              action: 'GDPR_DELETE',
              entity: 'Customer',
              entityId: customerId,
              metadata: {
                name: customer.name,
                phone: customer.phone,
                timestamp: new Date().toISOString(),
              },
            },
          });
        }

        return customer;
      });

      logger.info(`Hard deleted customer ${customerId} (GDPR)`);
      return result;
    } catch (error) {
      logger.error(`Error hard deleting customer ${customerId}: ${error}`);
      throw error;
    }
  }

  /**
   * Get VIP analytics
   */
  async getVipAnalytics(tenantId: string) {
    try {
      const vipCustomers = await prisma.customer.findMany({
        where: {
          tenantId,
          vipStatus: true,
          deletedAt: null,
        },
      });

      const diamondTier = vipCustomers.filter(
        (c) => c.vipTier === VipTier.DIAMOND
      ).length;
      const platinumTier = vipCustomers.filter(
        (c) => c.vipTier === VipTier.PLATINUM
      ).length;
      const goldTier = vipCustomers.filter(
        (c) => c.vipTier === VipTier.GOLD
      ).length;

      const totalVipSpend = vipCustomers.reduce(
        (sum, c) => sum.plus(c.lifetimeSpend),
        new Decimal(0)
      );

      const avgVipSpend =
        vipCustomers.length > 0
          ? totalVipSpend.div(vipCustomers.length)
          : new Decimal(0);

      return {
        totalVipCustomers: vipCustomers.length,
        byTier: {
          diamond: diamondTier,
          platinum: platinumTier,
          gold: goldTier,
        },
        totalVipSpend: totalVipSpend.toString(),
        averageVipSpend: avgVipSpend.toString(),
        topVips: vipCustomers
          .sort((a, b) => b.lifetimeSpend.cmp(a.lifetimeSpend))
          .slice(0, 10)
          .map((c) => this.formatCustomer(c)),
      };
    } catch (error) {
      logger.error(`Error calculating VIP analytics: ${error}`);
      throw error;
    }
  }

  /**
   * Get retention rate analytics
   */
  async getRetentionAnalytics(tenantId: string, daysBack: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);

      const returningCustomers = await prisma.customer.findMany({
        where: {
          tenantId,
          deletedAt: null,
          visitCount: { gt: 1 },
          lastVisit: { gte: cutoffDate },
        },
      });

      const allCustomers = await prisma.customer.findMany({
        where: {
          tenantId,
          deletedAt: null,
          createdAt: { lte: cutoffDate },
        },
      });

      const retentionRate =
        allCustomers.length > 0
          ? (returningCustomers.length / allCustomers.length) * 100
          : 0;

      return {
        period: `${daysBack} days`,
        totalCustomers: allCustomers.length,
        returningCustomers: returningCustomers.length,
        retentionRate: retentionRate.toFixed(2),
        newCustomers: allCustomers.filter(
          (c) => c.createdAt >= cutoffDate
        ).length,
      };
    } catch (error) {
      logger.error(`Error calculating retention analytics: ${error}`);
      throw error;
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Format customer object (parse JSON fields)
   */
  private formatCustomer(customer: any) {
    return {
      ...customer,
      preferences: customer.preferences ? JSON.parse(customer.preferences) : {},
      lifetimeSpend: customer.lifetimeSpend.toString(),
      averageCheck: customer.averageCheck.toString(),
    };
  }
}

export default new CustomerService();
