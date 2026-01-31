import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';

const prisma = new PrismaClient();

export class KitchenService {
  async getOrdersByStation(stationId: string, tenantId: string) {
    return prisma.orderCourse.findMany({
      where: {
        kitchenStationId: stationId,
        status: 'FIRED',
        order: { tenantId },
      },
      include: {
        order: {
          include: {
            table: true,
            items: { include: { menuItem: true } },
          },
        },
        items: { include: { menuItem: true } },
      },
      orderBy: { firedAt: 'asc' },
    });
  }

  async getPendingOrders(tenantId: string) {
    return prisma.orderCourse.findMany({
      where: {
        order: { tenantId },
        status: 'FIRED',
      },
      include: {
        order: { include: { table: true } },
        items: { include: { menuItem: true } },
      },
      orderBy: { firedAt: 'asc' },
    });
  }

  async completeCourse(courseId: string, tenantId: string) {
    const course = await prisma.orderCourse.findUnique({
      where: { id: courseId },
      include: { order: true },
    });

    if (!course || course.order.tenantId !== tenantId) {
      throw new Error('Course not found');
    }

    return prisma.orderCourse.update({
      where: { id: courseId },
      data: { status: 'READY', readyAt: new Date() },
    });
  }

  async fireCourse(courseId: string, stationId: string, notes?: string) {
    return prisma.orderCourse.update({
      where: { id: courseId },
      data: {
        status: 'FIRED',
        kitchenStationId: stationId,
        firedAt: new Date(),
        kitchenNotes: notes,
      },
    });
  }

  async getKitchenMetrics(tenantId: string) {
    const lastHourOrders = await prisma.orderCourse.findMany({
      where: {
        order: { tenantId },
        firedAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000),
        },
        readyAt: { not: null },
      },
    });

    const avgPrepTime = lastHourOrders.reduce((sum, course) => {
      const prepTime = course.readyAt!.getTime() - course.firedAt!.getTime();
      return sum + prepTime;
    }, 0) / Math.max(lastHourOrders.length, 1);

    return {
      totalFiredInLastHour: lastHourOrders.length,
      averagePrepTime: Math.round(avgPrepTime / 1000), // seconds
      allPendingCourses: await prisma.orderCourse.count({
        where: { status: 'FIRED', order: { tenantId } },
      }),
    };
  }
}