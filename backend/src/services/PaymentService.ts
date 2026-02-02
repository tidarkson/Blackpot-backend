import { PrismaClient, PaymentMethod, PaymentStatus, TipMethod } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

export class PaymentService {
  async getBill(orderId: string, tenantId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        courses: {
          include: { items: { include: { menuItem: true } } },
        },
        payments: true,
        tips: true,
      },
    });

    if (!order) throw new Error('Order not found');

    // Calculate subtotal
    let subtotal = new Decimal(0);
    const items: any[] = [];

    order.courses?.forEach(course => {
      course.items?.forEach(item => {
        const itemTotal = item.menuItem.price.mul(item.quantity);
        subtotal = subtotal.add(itemTotal);
        items.push({
          description: `${item.menuItem.name} × ${item.quantity}`,
          price: Number(itemTotal),
        });
      });
    });

    const tax = subtotal.mul(new Decimal('0.0825'));
    const tipSuggestions = [
      Number(subtotal.mul(new Decimal('0.18')).add(tax)),
      Number(subtotal.mul(new Decimal('0.20')).add(tax)),
      Number(subtotal.mul(new Decimal('0.25')).add(tax)),
    ];

    return {
      orderId,
      subtotal: Number(subtotal),
      tax: Number(tax),
      serviceCharge: 0, // Add if exists
      tipSuggestions,
      total: Number(subtotal.add(tax)),
      items,
    };
  }

  async addPayment(
    orderId: string,
    tenantId: string,
    data: {
      method: PaymentMethod;
      amount: Decimal;
      cardNumber?: string;
      lastFour?: string;
    }
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new Error('Order not found');

    return prisma.payment.create({
      data: {
        tenantId,
        orderId,
        method: data.method,
        amount: data.amount,
        status: PaymentStatus.COMPLETED,
        cardLastFour: data.lastFour,
        processedAt: new Date(),
      },
    });
  }

  async addTip(
    orderId: string,
    tenantId: string,
    data: {
      amount: Decimal;
      method: TipMethod;
    }
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new Error('Order not found');

    return prisma.tip.create({
      data: {
        tenantId,
        orderId,
        serverId: order.serverId,
        amount: data.amount,
        method: data.method,
      },
    });
  }
}