import { Request, Response } from 'express';
import { PrismaClient, TableStatus, TableShape } from '@prisma/client';
import { TableService } from '../services/TableService';
import logger from '../config/logger';
import {
  tableCreateSchema,
  tableUpdateSchema,
  tableStatusUpdateSchema,
  batchPositionUpdateSchema,
  seatGuestsSchema,
  clearTableSchema,
  tableSectionCreateSchema,
  tableSectionUpdateSchema,
} from '../validators/table.validator';

const prisma = new PrismaClient();
const tableService = new TableService();

/**
 * TableController
 * Handles all table management endpoints
 * - CRUD operations for tables
 * - Floor plan management
 * - Table status updates
 * - Table operations (seating, clearing)
 * - Section management
 */
export class TableController {
  /**
   * GET /api/tables
   * Get all tables for a location with filtering
   */
  async getAllTables(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const {
        locationId,
        sectionId,
        status,
        shape,
        capacity,
        page = 1,
        pageSize = 20,
      } = req.query as any;

      if (!tenantId || !locationId) {
        res.status(400).json({ error: 'Missing required parameters: tenantId, locationId' });
        return;
      }

      const skip = ((Number(page) || 1) - 1) * (Number(pageSize) || 20);
      const take = Number(pageSize) || 20;

      const where: any = {
        tenantId,
        locationId: String(locationId),
        deletedAt: null,
      };

      if (sectionId) where.sectionId = String(sectionId);
      if (status) where.status = String(status);
      if (shape) where.shape = String(shape);
      if (capacity) where.capacity = { gte: Number(capacity) };

      const [tables, total] = await Promise.all([
        prisma.table.findMany({
          where,
          include: {
            section: true,
            server: { select: { id: true, name: true, email: true } },
            orders: { where: { status: 'OPEN' }, take: 1 },
            reservations: { where: { status: 'CONFIRMED' } },
          },
          skip,
          take,
          orderBy: { name: 'asc' },
        }),
        prisma.table.count({ where }),
      ]);

      res.json({
        data: tables,
        pagination: {
          page: Number(page) || 1,
          pageSize: Number(pageSize) || 20,
          total,
          totalPages: Math.ceil(total / (Number(pageSize) || 20)),
        },
      });
    } catch (error) {
      logger.error('Error fetching tables:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/tables
   * Create a new table
   */
  async createTable(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = tableCreateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      // Check if location exists and belongs to tenant
      const location = await prisma.location.findFirst({
        where: { id: validated.locationId, tenantId },
      });

      if (!location) {
        res.status(404).json({ error: 'Location not found or does not belong to your tenant' });
        return;
      }

      // Check for unique table name per location
      const existingTable = await prisma.table.findFirst({
        where: { locationId: validated.locationId, name: validated.name, deletedAt: null },
      });

      if (existingTable) {
        res.status(409).json({ error: 'A table with this name already exists in this location' });
        return;
      }

      const table = await prisma.table.create({
        data: {
          ...validated,
          tenantId,
        },
        include: {
          section: true,
          server: { select: { id: true, name: true, email: true } },
        },
      });

      logger.info(`✅ Table created: ${table.name} (ID: ${table.id})`);
      res.status(201).json(table);
    } catch (error) {
      logger.error('Error creating table:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/tables/:tableId
   * Get a specific table by ID
   */
  async getTableById(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const table = await tableService.getTableById(String(tableId), tenantId);

      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      res.json(table);
    } catch (error) {
      logger.error('Error fetching table:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * PUT /api/tables/:tableId
   * Update a table
   */
  async updateTable(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = tableUpdateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      // Verify table exists and belongs to tenant
      const table = await tableService.getTableById(String(tableId), tenantId);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      // If updating name, check uniqueness
      if (validated.name) {
        const existingTable = await prisma.table.findFirst({
          where: {
            locationId: table.locationId,
            name: validated.name,
            id: { not: String(tableId) },
            deletedAt: null,
          },
        });

        if (existingTable) {
          res.status(409).json({ error: 'A table with this name already exists in this location' });
          return;
        }
      }

      const updatedTable = await prisma.table.update({
        where: { id: String(tableId) },
        data: validated,
        include: {
          section: true,
          server: { select: { id: true, name: true, email: true } },
        },
      });

      logger.info(`✏️ Table updated: ${updatedTable.name} (ID: ${tableId})`);
      res.json(updatedTable);
    } catch (error) {
      logger.error('Error updating table:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * DELETE /api/tables/:tableId
   * Soft delete a table
   */
  async deleteTable(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const table = await tableService.getTableById(String(tableId), tenantId);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const deletedTable = await prisma.table.update({
        where: { id: String(tableId) },
        data: { deletedAt: new Date() },
      });

      logger.info(`🗑️ Table soft deleted: ${table.name} (ID: ${tableId})`);
      res.json({ message: 'Table deleted successfully', table: deletedTable });
    } catch (error) {
      logger.error('Error deleting table:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * PATCH /api/tables/:tableId/status
   * Update table status
   */
  async updateTableStatus(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = tableStatusUpdateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const table = await tableService.getTableById(String(tableId), tenantId);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      // Validate status transition business rules
      if (validated.status === TableStatus.OCCUPIED && table.status === TableStatus.OCCUPIED) {
        res.status(400).json({ error: 'Table is already occupied' });
        return;
      }

      const updatedTable = await tableService.updateTableStatus(String(tableId), tenantId, validated.status);

      logger.info(`🔄 Table status updated: ${table.name} → ${validated.status}`);
      res.json(updatedTable);
    } catch (error) {
      logger.error('Error updating table status:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/tables/floor-plan
   * Get floor plan with all tables and coordinates
   */
  async getFloorPlan(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { locationId, sectionId } = req.query as any;

      if (!tenantId || !locationId) {
        res.status(400).json({ error: 'Missing required parameters: locationId' });
        return;
      }

      const floorPlan = await tableService.getFloorPlan(String(locationId), tenantId);

      res.json({
        locationId: String(locationId),
        tables: floorPlan,
        totalTables: floorPlan.length,
      });
    } catch (error) {
      logger.error('Error fetching floor plan:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * PUT /api/tables/floor-plan
   * Batch update table positions
   */
  async updateFloorPlan(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = batchPositionUpdateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const updatedTables = await Promise.all(
        validated.tables.map((tableUpdate) =>
          prisma.table.update({
            where: { id: tableUpdate.tableId },
            data: {
              x: tableUpdate.x,
              y: tableUpdate.y,
            },
            include: {
              section: true,
              server: { select: { id: true, name: true } },
            },
          })
        )
      );

      logger.info(`📍 Floor plan updated: ${validated.tables.length} tables repositioned`);
      res.json({ message: 'Floor plan updated successfully', tables: updatedTables });
    } catch (error) {
      logger.error('Error updating floor plan:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/tables/:tableId/seat
   * Seat guests at a table
   */
  async seatGuests(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const serverId = (req.user as any)?.id;
      const { tableId } = req.params;

      if (!tenantId || !serverId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = seatGuestsSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const result = await tableService.seatGuests(
        String(tableId),
        validated.guestCount,
        tenantId,
        serverId
      );

      res.status(201).json(result);
    } catch (error) {
      logger.error('Error seating guests:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/tables/:tableId/clear
   * Clear and clean a table
   */
  async clearTable(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = clearTableSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const result = await tableService.releaseTable(String(tableId), tenantId);

      logger.info(`✨ Table cleared: ${result.table?.name || tableId}`);
      res.json(result);
    } catch (error) {
      logger.error('Error clearing table:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/tables/:tableId/current-order
   * Get the active order for a table
   */
  async getCurrentOrder(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const table = await tableService.getTableById(String(tableId), tenantId);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const currentOrder = await prisma.order.findFirst({
        where: {
          tableId: String(tableId),
          tenantId,
          status: 'OPEN',
        },
        include: {
          courses: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!currentOrder) {
        res.status(404).json({ error: 'No active order found for this table' });
        return;
      }

      res.json(currentOrder);
    } catch (error) {
      logger.error('Error fetching current order:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/tables/:tableId/reservations
   * Get reservations for a table
   */
  async getTableReservations(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { tableId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const table = await tableService.getTableById(String(tableId), tenantId);
      if (!table) {
        res.status(404).json({ error: 'Table not found' });
        return;
      }

      const reservations = await prisma.reservation.findMany({
        where: { tableId: String(tableId), tenantId },
        orderBy: { reservedAt: 'desc' },
      });

      res.json(reservations);
    } catch (error) {
      logger.error('Error fetching table reservations:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * GET /api/table-sections
   * Get all table sections for a tenant
   */
  async getAllSections(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const sections = await prisma.tableSection.findMany({
        where: { tenantId },
        include: { _count: { select: { tables: true } } },
        orderBy: { name: 'asc' },
      });

      res.json(sections);
    } catch (error) {
      logger.error('Error fetching table sections:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * POST /api/table-sections
   * Create a new table section
   */
  async createSection(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      try {
        var validated = tableSectionCreateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const section = await prisma.tableSection.create({
        data: {
          ...validated,
          tenantId,
        },
      });

      logger.info(`✅ Table section created: ${section.name}`);
      res.status(201).json(section);
    } catch (error) {
      logger.error('Error creating table section:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * PUT /api/table-sections/:sectionId
   * Update a table section
   */
  async updateSection(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { sectionId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const section = await prisma.tableSection.findFirst({
        where: { id: String(sectionId), tenantId },
      });

      if (!section) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }

      try {
        var validated = tableSectionUpdateSchema.parse(req.body);
      } catch (validationError: any) {
        res.status(400).json({ error: 'Invalid request data', details: validationError.errors });
        return;
      }

      const updatedSection = await prisma.tableSection.update({
        where: { id: String(sectionId) },
        data: validated,
      });

      logger.info(`✏️ Table section updated: ${updatedSection.name}`);
      res.json(updatedSection);
    } catch (error) {
      logger.error('Error updating table section:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * DELETE /api/table-sections/:sectionId
   * Delete a table section
   */
  async deleteSection(req: Request, res: Response): Promise<void> {
    try {
      const tenantId = req.user?.tenantId;
      const { sectionId } = req.params;

      if (!tenantId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const section = await prisma.tableSection.findFirst({
        where: { id: String(sectionId), tenantId },
      });

      if (!section) {
        res.status(404).json({ error: 'Section not found' });
        return;
      }

      // Check if section has tables assigned
      const tableCount = await prisma.table.count({
        where: { sectionId: String(sectionId) },
      });

      if (tableCount > 0) {
        res.status(409).json({
          error: `Cannot delete section. ${tableCount} table(s) are assigned to this section.`,
        });
        return;
      }

      await prisma.tableSection.delete({
        where: { id: String(sectionId) },
      });

      logger.info(`🗑️ Table section deleted: ${section.name}`);
      res.json({ message: 'Section deleted successfully' });
    } catch (error) {
      logger.error('Error deleting table section:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

export const tableController = new TableController();
