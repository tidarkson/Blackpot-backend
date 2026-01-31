import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ReportService {
  async getDailyReport(tenantId: string, date: Date) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        closedAt: { gte: dayStart, lte: dayEnd },
      },
      include: {
        courses: { include: { items: { include: { menuItem: true } } } },
        payments: true,
        tips: true,
      },
    });

    let totalSales = 0;
    let totalGuests = 0;
    const itemCounts: { [key: string]: number } = {};

    orders.forEach(order => {
      totalSales += Number(order.total || 0);
      totalGuests += order.guestCount || 0;

      order.courses?.forEach(course => {
        course.items?.forEach(item => {
          const itemName = item.menuItem.name;
          itemCounts[itemName] = (itemCounts[itemName] || 0) + item.quantity;
        });
      });
    });

    const topItems = Object.entries(itemCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => ({ item: name, quantity: count }));

    return {
      date: date.toISOString().split('T')[0],
      totalSales,
      totalOrders: orders.length,
      averageOrderValue: orders.length > 0 ? totalSales / orders.length : 0,
      totalGuests,
      topItems,
    };
  }

  async getWeeklyReport(tenantId: string) {
    const reports = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const daily = await this.getDailyReport(tenantId, date);
      reports.push(daily);
    }
    return reports;
  }
}