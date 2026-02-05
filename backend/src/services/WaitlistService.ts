import { PrismaClient, WaitlistStatus } from '@prisma/client';
import logger from '../config/logger';

const prisma = new PrismaClient();

export class WaitlistService {
  /**
   * WAITLIST SERVICE
   * 
   * Manages walk-in guest queuing system
   * 
   * Features:
   * - Add guests to waitlist
   * - Track position in queue
   * - Notify when table available
   * - Convert to reservation when seated
   * - Manage cancellations
   * 
   * Future integrations:
   * - SMS notifications via Twilio
   * - Email notifications via EmailService
   * - Estimated wait time calculation
   * - Table preference hints to host stand
   * - Analytics on wait times
   */

  /**
   * Add guest to waitlist
   * 
   * @param guestName Guest name
   * @param guestPhone Phone number
   * @param partySize Number of guests
   * @param tenantId Tenant context
   * @param notes Optional notes
   * @returns Waitlist entry with position
   */
  async addToWaitlist(
    guestName: string,
    guestPhone: string,
    partySize: number,
    tenantId: string,
    guestEmail?: string,
    notes?: string
  ) {
    try {
      // Get current max position
      const maxPosition = await prisma.waitlist.aggregate({
        where: {
          tenantId,
          status: WaitlistStatus.WAITING,
        },
        _max: {
          position: true,
        },
      });

      const newPosition = (maxPosition._max.position || 0) + 1;

      const entry = await prisma.$transaction(async (tx) => {
        const created = await tx.waitlist.create({
          data: {
            tenantId,
            guestName,
            guestPhone,
            guestEmail,
            partySize,
            position: newPosition,
            status: WaitlistStatus.WAITING,
            notes,
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            tenantId,
            action: 'WAITLIST_ADD',
            entity: 'Waitlist',
            entityId: created.id,
            metadata: {
              guestName,
              partySize,
              position: newPosition,
            },
          },
        });

        return created;
      });

      logger.info(
        `⏳ Guest ${guestName} added to waitlist at position ${newPosition}`
      );

      return entry;
    } catch (error) {
      logger.error('Error adding to waitlist:', error);
      throw error;
    }
  }

  /**
   * Get current waitlist
   * 
   * @param tenantId Tenant context
   * @returns Ordered list of waiting guests
   */
  async getWaitlist(tenantId: string) {
    try {
      return prisma.waitlist.findMany({
        where: {
          tenantId,
          status: WaitlistStatus.WAITING,
        },
        orderBy: { position: 'asc' },
      });
    } catch (error) {
      logger.error('Error fetching waitlist:', error);
      throw error;
    }
  }

  /**
   * Notify guest that table is ready
   * 
   * @param waitlistId Waitlist entry ID
   * @param tenantId Tenant context
   * @returns Updated entry
   * 
   * Future: Integrate with EmailService and SMS (Twilio)
   */
  async notifyGuest(waitlistId: string, tenantId: string) {
    try {
      const entry = await prisma.waitlist.findFirst({
        where: { id: waitlistId, tenantId },
      });

      if (!entry) {
        throw new Error(`Waitlist entry ${waitlistId} not found`);
      }

      const updated = await prisma.$transaction(async (tx) => {
        const res = await tx.waitlist.update({
          where: { id: waitlistId },
          data: {
            status: WaitlistStatus.NOTIFIED,
            notifiedAt: new Date(),
          },
        });

        // Log notification
        await tx.activityLog.create({
          data: {
            tenantId,
            action: 'WAITLIST_NOTIFY',
            entity: 'Waitlist',
            entityId: waitlistId,
            metadata: {
              notifiedAt: new Date().toISOString(),
            },
          },
        });

        return res;
      });

      logger.info(`📞 Guest ${entry.guestName} notified for table`);

      return updated;
    } catch (error) {
      logger.error('Error notifying guest:', error);
      throw error;
    }
  }

  /**
   * Seat guest from waitlist (convert to reservation/order)
   * 
   * @param waitlistId Waitlist entry ID
   * @param tableId Table they're seated at
   * @param tenantId Tenant context
   * @param serverId Server seating guest
   * @returns Waitlist entry + created reservation
   * 
   * Future: Create Reservation automatically when seating from waitlist
   */
  async seatFromWaitlist(
    waitlistId: string,
    tableId: string,
    tenantId: string,
    serverId: string
  ) {
    try {
      // Implementation will follow similar pattern to seatReservation
      // Creates Reservation + Order + updates Waitlist
      throw new Error('Not yet implemented - Phase 5');
    } catch (error) {
      logger.error('Error seating from waitlist:', error);
      throw error;
    }
  }

  /**
   * Remove guest from waitlist
   * 
   * @param waitlistId Waitlist entry ID
   * @param tenantId Tenant context
   */
  async removeFromWaitlist(waitlistId: string, tenantId: string) {
    try {
      const entry = await prisma.waitlist.findFirst({
        where: { id: waitlistId, tenantId },
      });

      if (!entry) {
        throw new Error(`Waitlist entry ${waitlistId} not found`);
      }

      await prisma.$transaction(async (tx) => {
        await tx.waitlist.update({
          where: { id: waitlistId },
          data: {
            status: WaitlistStatus.CANCELLED,
            cancelledAt: new Date(),
          },
        });

        // Log cancellation
        await tx.activityLog.create({
          data: {
            tenantId,
            action: 'WAITLIST_REMOVE',
            entity: 'Waitlist',
            entityId: waitlistId,
            metadata: {
              cancelledAt: new Date().toISOString(),
            },
          },
        });
      });

      logger.info(`❌ Guest ${entry.guestName} removed from waitlist`);
    } catch (error) {
      logger.error('Error removing from waitlist:', error);
      throw error;
    }
  }
}

export default new WaitlistService();