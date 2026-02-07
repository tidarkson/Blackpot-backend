import { OrderService } from '../src/services/OrderService';
import { OrderStatus, CourseType } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

// Mock Prisma Client
jest.mock('@prisma/client');

describe('OrderService', () => {
  let orderService: OrderService;
  let mockPrisma: any;

  beforeEach(() => {
    // Create mock Prisma client
    mockPrisma = {
      order: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      orderCourse: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      orderItem: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    orderService = new OrderService(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create a new order with OPEN status', async () => {
      const mockOrder = {
        id: 'order-1',
        tenantId: 'tenant-1',
        tableId: 'table-1',
        serverId: 'server-1',
        status: OrderStatus.OPEN,
        guestCount: 4,
        subtotal: 0,
        tax: 0,
        total: 0,
        createdAt: new Date(),
      };

      mockPrisma.order.create.mockResolvedValue(mockOrder);

      const result = await orderService.createOrder(
        'tenant-1',
        'table-1',
        'server-1',
        4,
        'user-1'
      );

      expect(mockPrisma.order.create).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.OPEN);
      expect(result.guestCount).toBe(4);
    });

    it('should throw error if table not found', async () => {
      mockPrisma.order.create.mockRejectedValue(new Error('Table not found'));

      await expect(
        orderService.createOrder('tenant-1', 'invalid-table', 'server-1', 4, 'user-1')
      ).rejects.toThrow();
    });
  });

  describe('getOrderById', () => {
    it('should retrieve order by ID with full details', async () => {
      const mockOrder = {
        id: 'order-1',
        tenantId: 'tenant-1',
        status: OrderStatus.OPEN,
        courses: [],
        payments: [],
      };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

      const result = await orderService.getOrderById('order-1', 'tenant-1');

      expect(mockPrisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', tenantId: 'tenant-1' },
        include: expect.any(Object),
      });
      expect(result).toBe(mockOrder);
    });

    it('should return null if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      const result = await orderService.getOrderById('invalid-id', 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('updateOrderStatus', () => {
    it('should validate state transition before updating', async () => {
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.OPEN,
        courses: [],
      };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.IN_PROGRESS });

      const result = await orderService.updateOrderStatus(
        'order-1',
        OrderStatus.IN_PROGRESS,
        'tenant-1'
      );

      expect(mockPrisma.order.update).toHaveBeenCalled();
      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('should reject invalid state transitions', async () => {
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.CLOSED,
        courses: [],
      };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

      // Closed orders cannot transition to other states
      await expect(
        orderService.updateOrderStatus('order-1', OrderStatus.OPEN, 'tenant-1')
      ).rejects.toThrow('Invalid state transition');
    });
  });

  describe('addCourse', () => {
    it('should add a course to an order', async () => {
      const mockOrder = { id: 'order-1', tenantId: 'tenant-1' };
      const mockCourse = { id: 'course-1', courseType: CourseType.MAIN };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.orderCourse.create.mockResolvedValue(mockCourse);

      const result = await orderService.addCourse('order-1', 'tenant-1', CourseType.MAIN);

      expect(mockPrisma.orderCourse.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          orderId: 'order-1',
          courseType: CourseType.MAIN,
        }),
      });
      expect(result.courseType).toBe(CourseType.MAIN);
    });

    it('should throw error if order not found', async () => {
      mockPrisma.order.findFirst.mockResolvedValue(null);

      await expect(
        orderService.addCourse('invalid-order', 'tenant-1', CourseType.MAIN,)
      ).rejects.toThrow('Order not found');
    });
  });

  describe('addItemToOrder', () => {
    it('should add item to order course', async () => {
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.OPEN,
        tenantId: 'tenant-1',
      };
      const mockCourse = { id: 'course-1', orderId: 'order-1' };
      const mockItem = { 
        id: 'item-1', 
        quantity: 2,
        menuItem: { name: 'Test Item' }
      };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);
      mockPrisma.orderCourse.findFirst.mockResolvedValue(mockCourse);
      mockPrisma.orderItem.create.mockResolvedValue(mockItem);

      const result = await orderService.addItemToOrder(
        'order-1',
        'course-1',
        'menu-item-1',
        2,
        'Special notes',
        'tenant-1'
      );

      expect(mockPrisma.orderItem.create).toHaveBeenCalled();
      expect(result.quantity).toBe(2);
    });

    it('should prevent adding items to closed order', async () => {
      const mockOrder = {
        id: 'order-1',
        status: OrderStatus.CLOSED,
        tenantId: 'tenant-1',
      };

      mockPrisma.order.findFirst.mockResolvedValue(mockOrder);

      await expect(
        orderService.addItemToOrder(
          'order-1',
          'course-1',
          'menu-item-1',
          2,
          'Notes',
          'tenant-1'
        )
      ).rejects.toThrow('Cannot add items to closed order');
    });
  });

  describe('listOrders', () => {
    it('should list orders with pagination', async () => {
      const mockOrders = [
        { id: 'order-1', status: OrderStatus.OPEN },
        { id: 'order-2', status: OrderStatus.IN_PROGRESS },
      ];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.order.count.mockResolvedValue(2);

      const result = await orderService.listOrders('tenant-1', {
        page: 1,
        pageSize: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should filter orders by status', async () => {
      const mockOrders = [{ id: 'order-1', status: OrderStatus.OPEN }];

      mockPrisma.order.findMany.mockResolvedValue(mockOrders);
      mockPrisma.order.count.mockResolvedValue(1);

      const result = await orderService.listOrders('tenant-1', {
        status: OrderStatus.OPEN,
        page: 1,
        pageSize: 10,
      });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: OrderStatus.OPEN }),
        })
      );
      expect(result.data).toHaveLength(1);
    });
  });
});
