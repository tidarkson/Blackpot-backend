import { PrismaClient, TableStatus } from '@prisma/client';

const prisma = new PrismaClient();

export class TableService {
  async getTablesByLocation(locationId: string) {
    return prisma.table.findMany({
      where: { locationId },
      include: {
        currentOrder: true,
        reservations: { where: { status: 'CONFIRMED' } },
      },
    });
  }

  async getTableById(tableId: string) {
    return prisma.table.findUnique({
      where: { id: tableId },
      include: {
        currentOrder: { include: { courses: true } },
        reservations: { where: { status: 'CONFIRMED' } },
      },
    });
  }

  async updateTableStatus(tableId: string, status: TableStatus) {
    return prisma.table.update({
      where: { id: tableId },
      data: { status },
    });
  }

  async getFloorPlan(locationId: string) {
    return prisma.table.findMany({
      where: { locationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        capacity: true,
        status: true,
        x: true,
        y: true,
        width: true,
        height: true,
        currentOrderId: true,
        reservations: { select: { guestName: true, reservedAt: true } },
      },
    });
  }
}