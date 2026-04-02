import { OrderStatus, UserRole } from '@prisma/client';
import logger from '../config/logger';
import { buildTenantRoom, getIO } from '../config/socket';

type RoomRole = 'admin' | 'customer' | 'floor' | 'kitchen' | 'staff' | 'all';

class SocketService {
  private emitToRoom(event: string, tenantId: string, role: RoomRole, payload: unknown) {
    try {
      const room = buildTenantRoom(tenantId, role);
      getIO().to(room).emit(event, payload);
      logger.info('Socket event emitted', { event, tenantId, role, room });
    } catch (error: any) {
      logger.warn('Socket emit skipped', {
        event,
        tenantId,
        role,
        message: error.message,
      });
    }
  }

  emitOrderCreated(tenantId: string, order: unknown) {
    this.emitToRoom('order:created', tenantId, 'kitchen', {
      tenantId,
      order,
      emittedAt: new Date().toISOString(),
    });
  }

  emitOrderStatusUpdated(
    tenantId: string,
    orderId: string,
    status: OrderStatus,
    order?: unknown
  ) {
    this.emitToRoom('order:status_updated', tenantId, 'kitchen', {
      tenantId,
      orderId,
      status,
      order,
      emittedAt: new Date().toISOString(),
    });
  }

  emitKitchenAlert(tenantId: string, alert: unknown) {
    this.emitToRoom('kitchen:alert', tenantId, 'kitchen', {
      tenantId,
      alert,
      emittedAt: new Date().toISOString(),
    });
  }

  emitTableStatusChanged(
    tenantId: string,
    tableId: string,
    status: string,
    metadata?: unknown
  ) {
    this.emitToRoom('table:status_changed', tenantId, 'floor', {
      tenantId,
      tableId,
      status,
      metadata,
      emittedAt: new Date().toISOString(),
    });
  }

  emitStaffStatusUpdated(
    tenantId: string,
    staffId: string,
    status: 'CLOCKED_IN' | 'CLOCKED_OUT' | 'ON_BREAK',
    metadata?: unknown
  ) {
    this.emitToRoom('staff:status_updated', tenantId, 'all', {
      tenantId,
      staffId,
      status,
      metadata,
      emittedAt: new Date().toISOString(),
    });
  }
}

export const socketService = new SocketService();