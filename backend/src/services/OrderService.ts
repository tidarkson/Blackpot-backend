import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

export class OrderService {
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
      include: { courses: true, payments: true },
    });
  }

  async closeOrder(orderId: string, tenantId: string) {
    const order = await this.getOrderById(orderId, tenantId);
    if (!order) throw new Error('Order not found');

    // Calculate final total
    let subtotal = new Decimal(0);
    order.courses?.forEach(course => {
      course.items?.forEach(item => {
        const itemTotal = item.menuItem.price.mul(item.quantity);
        subtotal = subtotal.add(itemTotal);
      });
    });

    const tax = subtotal.mul(new Decimal('0.0825')); // 8.25% tax
    const total = subtotal.add(tax);

    return prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CLOSED,
        subtotal,
        tax,
        total,
        closedAt: new Date(),
      },
    });
  }

  async addCourse(
    orderId: string,
    tenantId: string,
    courseType: CourseType
  ) {
    const order = await this.getOrderById(orderId, tenantId);
    if (!order) throw new Error('Order not found');

    return prisma.orderCourse.create({
      data: {
        orderId,
        courseType,
        status: 'PENDING',
      },
    });
  }

  async addItemToCourse(
    courseId: string,
    menuItemId: string,
    quantity: number,
    specialNotes?: string
  ) {
    return prisma.orderItem.create({
      data: {
        courseId,
        menuItemId,
        quantity,
        specialNotes,
      },
      include: { menuItem: true },
    });
  }
}