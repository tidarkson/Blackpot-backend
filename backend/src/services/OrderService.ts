import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class OrderService {

    private validTransitions: Record<OrderStatus, OrderStatus[]> = {
    OPEN: [OrderStatus.IN_PROGRESS, OrderStatus.CLOSED, OrderStatus.CANCELLED],
    IN_PROGRESS: [OrderStatus.READY, OrderStatus.OPEN, OrderStatus.CLOSED, OrderStatus.CANCELLED],
    READY: [OrderStatus.COMPLETED, OrderStatus.IN_PROGRESS, OrderStatus.CLOSED, OrderStatus.CANCELLED],
    COMPLETED: [OrderStatus.PAID, OrderStatus.CLOSED],
    PAID: [OrderStatus.CLOSED],
    CLOSED: [],
    CANCELLED: [],
  };

  async createOrder(
    tenantId: string,
    data: {
      tableId: string;
      serverId: string;
      guestCount: number;
    }
  ) {
    return prisma.order.create({
      data: {
        tableId: data.tableId,
        serverId: data.serverId,
        tenantId,
        guestCount: data.guestCount,
        status: OrderStatus.OPEN,
        subtotal: new Decimal(0),
        tax: new Decimal(0),
        total: new Decimal(0),
      },
      include: {
        courses: true,
        payments: true,
        table: true,
        server: true,
      },
    });
  }

  async getOrderById(orderId: string, tenantId: string) {
    return prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        courses: {
          include: { items: { include: { menuItem: true } } },
        },
        payments: true,
        tips: true,
        serviceCharge: true,
        table: true,
        server: true,
      },
    });
  }

  async getOrdersByTable(tableId: string, tenantId: string) {
    return prisma.order.findMany({
      where: { tableId, tenantId, status: OrderStatus.OPEN },
      include: {
        courses: { include: { items: { include: { menuItem: true } } } },
        payments: true,
        table: true,
        server: true,
      },
    });
  }

  async addCourse(
    orderId: string,
    tenantId: string,
    courseType: CourseType,
    kitchenStationId?: string
  ) {
    const order = await this.getOrderById(orderId, tenantId);
    if (!order) throw new Error('Order not found');

    return prisma.orderCourse.create({
      data: {
        tenantId,
        orderId,
        courseType,
        kitchenStationId,
      },
    });
  }

  async addItemToCourse(
    orderCourseId: string,
    tenantId: string,
    menuItemId: string,
    quantity: number,
    specialNotes?: string
  ) {
    return prisma.orderItem.create({
      data: {
        tenantId,
        orderCourseId,
        menuItemId,
        quantity,
        specialNotes,
      },
      include: { menuItem: true },
    });
  }

    async validateStateTransition(
    orderId: string,
    newStatus: OrderStatus,
    tenantId: string
  ): Promise<boolean> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          courses: true,
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      const currentStatus = order.status;

      // Check if transition is valid
      if (!this.validTransitions[currentStatus].includes(newStatus)) {
        throw new Error(
          `Invalid state transition from ${currentStatus} to ${newStatus}. ` +
            `Valid transitions: ${this.validTransitions[currentStatus].join(', ')}`
        );
      }

      // Additional validations for specific transitions
      if (newStatus === OrderStatus.READY) {
        // All courses must have items before marking order as READY
        const coursesWithItems = await prisma.orderCourse.findMany({
          where: { orderId },
          include: { items: true },
        });
        
        const coursesWithoutItems = coursesWithItems.filter(c => c.items.length === 0);
        if (coursesWithoutItems.length > 0) {
          throw new Error(
            `Cannot mark order as READY. ${coursesWithoutItems.length} courses have no items.`
          );
        }
      }

      if (newStatus === OrderStatus.COMPLETED) {
        // Order must have at least one course
        if (order.courses.length === 0) {
          throw new Error('Cannot complete order with no courses');
        }
      }

      if (newStatus === OrderStatus.PAID) {
        // Order must be completed
        if (order.status !== OrderStatus.COMPLETED) {
          throw new Error('Order must be completed before marking as paid');
        }
      }

      logger.info(`✅ Valid state transition: ${currentStatus} → ${newStatus} (Order: ${orderId})`);
      return true;
    } catch (error: any) {
      logger.error(`State validation error for order ${orderId}:`, error.message);
      throw error;
    }
  }

  async updateOrderStatus(orderId: string, newStatus: OrderStatus, tenantId: string): Promise<any> {
    try {
      // Validate transition
      await this.validateStateTransition(orderId, newStatus, tenantId);

      // Update status
      const updatedOrder = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: newStatus,
          closedAt: newStatus === OrderStatus.CLOSED ? new Date() : undefined,
        },
        include: {
          courses: {
            include: { items: true },
          },
        },
      });

      logger.info(`📝 Order status updated: ${orderId} → ${newStatus}`);
      return updatedOrder;
    } catch (error: any) {
      logger.error(`Error updating order status:`, error.message);
      throw error;
    }
  }

  async addItemToOrder(
    orderId: string,
    courseId: string,
    menuItemId: string,
    quantity: number,
    notes: string,
    tenantId: string
  ): Promise<any> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === OrderStatus.CLOSED) {
        throw new Error('Cannot add items to closed order');
      }

      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Verify the course exists and belongs to this order
      const course = await prisma.orderCourse.findFirst({
        where: { id: courseId, orderId },
      });

      if (!course) {
        throw new Error('Course not found for this order');
      }

      // Create order item
      const orderItem = await prisma.orderItem.create({
        data: {
          tenantId,
          orderCourseId: courseId,
          menuItemId,
          quantity,
          specialNotes: notes || '',
        },
        include: {
          menuItem: true,
        },
      });

      logger.info(`➕ Item added to order ${orderId}: ${orderItem.menuItem.name} x${quantity}`);
      return orderItem;
    } catch (error: any) {
      logger.error(`Error adding item to order:`, error.message);
      throw error;
    }
  }

  async getOrderDetails(orderId: string, tenantId: string): Promise<any> {
    try {
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          table: true,
          server: true,
          courses: {
            include: {
              items: {
                include: {
                  menuItem: true,
                },
              },
            },
          },
          payments: true,
          tips: true,
          serviceCharge: true,
        },
      });

      if (!order) {
        throw new Error('Order not found');
      }

      return order;
    } catch (error: any) {
      logger.error(`Error fetching order details:`, error.message);
      throw error;
    }
  }

  async closeOrder(orderId: string, tenantId: string): Promise<any> {
    try {
      return await this.updateOrderStatus(orderId, OrderStatus.CLOSED, tenantId);
    } catch (error: any) {
      logger.error(`Error closing order:`, error.message);
      throw error;
    }
  }
}