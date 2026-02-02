import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';

const prisma = new PrismaClient();

export class KitchenService {
  async getOrdersByStation(stationId: string, tenantId: string) {
    return prisma.orderCourse.findMany({
      where: {
        kitchenStationId: stationId,
        order: { tenantId },
      },
      include: {
        order: {
          include: {
            table: true,
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
      data: { completedAt: new Date() },
    });
  }

  async fireCourse(courseId: string, stationId: string, notes?: string) {
    return prisma.orderCourse.update({
      where: { id: courseId },
      data: {
        kitchenStationId: stationId,
        firedAt: new Date(),
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
        completedAt: { not: null },
      },
    });

    const avgPrepTime = lastHourOrders.reduce((sum, course) => {
      const prepTime = course.completedAt!.getTime() - course.firedAt!.getTime();
      return sum + prepTime;
    }, 0) / Math.max(lastHourOrders.length, 1);

    return {
      totalFiredInLastHour: lastHourOrders.length,
      averagePrepTime: Math.round(avgPrepTime / 1000), // seconds
      allPendingCourses: await prisma.orderCourse.count({
        where: { firedAt: { not: null }, completedAt: null, order: { tenantId } },
      }),
    };
  }
}