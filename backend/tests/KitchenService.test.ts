import { KitchenService } from '../src/services/KitchenService';
import { PrismaClient } from '@prisma/client';

jest.mock('@prisma/client');

describe('KitchenService', () => {
  let kitchenService: KitchenService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orderItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      orderCourse: {
        findMany: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
    };

    kitchenService = new KitchenService(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPendingOrders', () => {
    it('should retrieve all pending items across stations', async () => {
      const mockPendingItems = [
        {
          id: 'item-1',
          preparedAt: null,
          menuItem: { name: 'Burger' },
        },
        {
          id: 'item-2',
          preparedAt: null,
          menuItem: { name: 'Fries' },
        },
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockPendingItems);

      const result = await kitchenService.getPendingOrders('tenant-1');

      expect(mockPrisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          preparedAt: null,
          orderCourse: {
            order: { tenantId: 'tenant-1' },
          },
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: {
                include: { table: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array if no pending items', async () => {
      mockPrisma.orderItem.findMany.mockResolvedValue([]);

      const result = await kitchenService.getPendingOrders('tenant-1');

      expect(result).toEqual([]);
    });
  });

  describe('getOrdersByStation', () => {
    it('should retrieve items for specific kitchen station', async () => {
      const mockItems = [
        {
          id: 'item-1',
          menuItem: { name: 'Steak' },
          orderCourse: { kitchenStationId: 'station-1' },
        },
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockItems);

      const result = await kitchenService.getOrdersByStation('station-1', 'tenant-1');

      expect(mockPrisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          orderCourse: {
            kitchenStationId: 'station-1',
            order: { tenantId: 'tenant-1' },
          },
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: {
                include: {
                  table: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter items by status if provided', async () => {
      const mockItems = [
        {
          id: 'item-1',
          preparedAt: new Date(),
          servedAt: null,
          menuItem: { name: 'Pasta' },
        },
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockItems);

      const result = await kitchenService.getOrdersByStation('station-1', 'tenant-1');

      expect(mockPrisma.orderItem.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('completeItem', () => {
    it('should mark item as prepared', async () => {
      const mockItem = {
        id: 'item-1',
        preparedAt: null,
        orderCourse: { order: { tenantId: 'tenant-1' } },
      };

      const mockUpdatedItem = {
        ...mockItem,
        preparedAt: new Date(),
      };

      mockPrisma.orderItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.orderItem.update.mockResolvedValue(mockUpdatedItem);

      const result = await kitchenService.completeItem('item-1', 'tenant-1');

      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { preparedAt: expect.any(Date) },
        include: expect.any(Object),
      });
      expect(result.preparedAt).not.toBeNull();
    });

    it('should throw error if item not found', async () => {
      mockPrisma.orderItem.findUnique.mockResolvedValue(null);

      await expect(kitchenService.completeItem('invalid-id', 'tenant-1')).rejects.toThrow(
        'Item not found'
      );
    });
  });

  describe('fireOrderItem', () => {
    it('should mark item as fired (prepared)', async () => {
      const mockItem = {
        id: 'item-1',
        preparedAt: null,
        menuItem: { name: 'Pizza' },
        orderCourse: { order: { tenantId: 'tenant-1' }, orderId: 'order-1' },
      };

      const mockUpdatedItem = {
        ...mockItem,
        preparedAt: new Date(),
      };

      mockPrisma.orderItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.orderItem.update.mockResolvedValue(mockUpdatedItem);

      const result = await kitchenService.fireOrderItem('item-1', 'tenant-1');

      expect(mockPrisma.orderItem.update).toHaveBeenCalled();
      expect(result.preparedAt).not.toBeNull();
    });

    it('should prevent firing already prepared items', async () => {
      const mockItem = {
        id: 'item-1',
        preparedAt: new Date('2026-01-01'),
        orderCourse: { order: { tenantId: 'tenant-1' } },
      };

      mockPrisma.orderItem.findFirst.mockResolvedValue(mockItem);

      await expect(kitchenService.fireOrderItem('item-1', 'tenant-1')).rejects.toThrow(
        'already prepared'
      );
    });
  });

  describe('serveItem', () => {
    it('should mark item as served', async () => {
      const mockItem = {
        id: 'item-1',
        preparedAt: new Date(),
        servedAt: null,
        menuItem: { name: 'Soup' },
        orderCourse: { order: { tenantId: 'tenant-1' }, orderId: 'order-1' },
      };

      const mockUpdatedItem = {
        ...mockItem,
        servedAt: new Date(),
      };

      mockPrisma.orderItem.findFirst.mockResolvedValue(mockItem);
      mockPrisma.orderItem.update.mockResolvedValue(mockUpdatedItem);

      const result = await kitchenService.serveItem('item-1', 'tenant-1');

      expect(mockPrisma.orderItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { servedAt: expect.any(Date) },
        include: expect.any(Object),
      });
      expect(result.servedAt).not.toBeNull();
    });

    it('should prevent serving unprepared items', async () => {
      const mockItem = {
        id: 'item-1',
        preparedAt: null,
        orderCourse: { order: { tenantId: 'tenant-1' } },
      };

      mockPrisma.orderItem.findFirst.mockResolvedValue(mockItem);

      await expect(kitchenService.serveItem('item-1', 'tenant-1')).rejects.toThrow(
        'must be prepared'
      );
    });
  });

  describe('getKitchenDisplaySystem', () => {
    it('should return items grouped by status', async () => {
      const mockItems = [
        { id: 'item-1', preparedAt: null, servedAt: null }, // PENDING
        { id: 'item-2', preparedAt: new Date(), servedAt: null }, // PREPARED
        { id: 'item-3', preparedAt: new Date(), servedAt: new Date() }, // SERVED
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockItems);

      const result = await kitchenService.getKitchenDisplaySystem('tenant-1');

      expect(result).toHaveProperty('PENDING');
      expect(result).toHaveProperty('PREPARED');
      expect(result).toHaveProperty('SERVED');
      expect(result.PENDING).toHaveLength(1);
      expect(result.PREPARED).toHaveLength(1);
      expect(result.SERVED).toHaveLength(1);
    });

    it('should filter by station if provided', async () => {
      mockPrisma.orderItem.findMany.mockResolvedValue([]);

      await kitchenService.getKitchenDisplaySystem('tenant-1', 'station-1');

      expect(mockPrisma.orderItem.findMany).toHaveBeenCalledWith({
        where: {
          orderCourse: {
            order: { tenantId: 'tenant-1' },
            kitchenStationId: 'station-1',
          },
        },
        include: {
          menuItem: true,
          orderCourse: {
            include: {
              order: {
                include: {
                  table: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
    });
  });

  describe('calculatePrepTime', () => {
    it('should calculate prep time for completed item', async () => {
      const createdAt = new Date('2026-01-01T10:00:00');
      const preparedAt = new Date('2026-01-01T10:15:00');

      const mockItem = {
        id: 'item-1',
        createdAt,
        preparedAt,
        menuItem: { name: 'Rice' },
        orderCourse: { order: { tenantId: 'tenant-1' } },
      };

      mockPrisma.orderItem.findFirst.mockResolvedValue(mockItem);

      const result = await kitchenService.calculatePrepTime('item-1', 'tenant-1');

      expect(result).toBe(15); // 15 minutes
    });

    it('should return null if item not found', async () => {
      mockPrisma.orderItem.findFirst.mockResolvedValue(null);

      await expect(
        kitchenService.calculatePrepTime('invalid-id', 'tenant-1')
      ).rejects.toThrow('Item not found');
    });
  });

  describe('getOrderReadyStatus', () => {
    it('should calculate order completion percentage', async () => {
      const mockItems = [
        { id: 'item-1', preparedAt: new Date(), servedAt: null },
        { id: 'item-2', preparedAt: new Date(), servedAt: null },
        { id: 'item-3', preparedAt: null, servedAt: null },
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockItems);

      const result = await kitchenService.getOrderReadyStatus('order-1', 'tenant-1');

      expect(result.totalItems).toBe(3);
      expect(result.preparedItems).toBe(2);
      expect(result.percentagePrepared).toBe((2 / 3) * 100);
      expect(result.allPrepared).toBe(false);
    });
  });

  describe('getKitchenMetrics', () => {
    it('should return kitchen metrics', async () => {
      const mockItems = [
        {
          id: 'item-1',
          createdAt: new Date(Date.now() - 10 * 60000),
          preparedAt: new Date(Date.now() - 5 * 60000),
        },
        {
          id: 'item-2',
          createdAt: new Date(Date.now() - 15 * 60000),
          preparedAt: new Date(Date.now() - 8 * 60000),
        },
      ];

      mockPrisma.orderItem.findMany.mockResolvedValue(mockItems);
      mockPrisma.orderItem.count.mockResolvedValue(3);

      const result = await kitchenService.getKitchenMetrics('tenant-1');

      expect(result).toHaveProperty('totalPreparedInLastHour');
      expect(result).toHaveProperty('averagePrepTime');
      expect(result).toHaveProperty('allPendingItems');
      expect(result.allPendingItems).toBe(3);
    });
  });
});
