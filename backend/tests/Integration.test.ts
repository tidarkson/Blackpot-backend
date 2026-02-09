import request from 'supertest';
import { PrismaClient, OrderStatus, CourseType, ReservationStatus } from '@prisma/client';
import ReservationService from '../src/services/ReservationService';
import AvailabilityService from '../src/services/AvailabilityService';

/**
 * Integration Tests for Order Management API
 * These tests verify the full order workflow across multiple endpoints
 */

describe('Order Management API Integration Tests', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000/api';
  const authToken = process.env.TEST_AUTH_TOKEN || 'test-token';

  const prisma = new PrismaClient();

  let orderId: string;
  let courseId: string;
  let tableId: string = 'table-test-001';
  let serverId: string = 'server-test-001';
  let testTenantId: string;
  let testTableId: string;
  let testUserId: string;
  let reservationData: any;

  beforeAll(async () => {
    // Setup test data
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Restaurant',
        isActive: true,
      },
    });

    testTenantId = tenant.id;

    const location = await prisma.location.create({
      data: {
        tenantId: testTenantId,
        name: 'Main Location',
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: `test-server-${Date.now()}@restaurant.com`,
        name: 'Test Server',
        passwordHash: 'hashed',
        role: 'STAFF',
        locationId: location.id,
        positions: ['SERVER'],
      },
    });

    testUserId = user.id;

    const table = await prisma.table.create({
      data: {
        tenantId: testTenantId,
        locationId: location.id,
        name: 'Table 1',
        capacity: 4,
        status: 'AVAILABLE',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      },
    });

    testTableId = table.id;

    reservationData = {
      tableId: testTableId,
      guestName: 'John Test',
      guestEmail: 'john.test@example.com',
      guestPhone: '+1-555-1234',
      guestCount: 4,
      reservedAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      notes: 'Test reservation',
    };
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.reservation.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.table.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.location.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.tenant.deleteMany({ where: { id: testTenantId } });
    await prisma.$disconnect();
  });

  describe('Order Creation and Management Workflow', () => {
    it('should create a new order', async () => {
      const response = await request(API_URL)
        .post('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tableId,
          serverId,
          guestCount: 4,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.status).toBe(OrderStatus.OPEN);

      orderId = response.body.data.id;
    });

    it('should retrieve created order by ID', async () => {
      const response = await request(API_URL)
        .get(`/orders/${orderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(orderId);
    });

    it('should list orders with pagination', async () => {
      const response = await request(API_URL)
        .get('/orders?page=1&pageSize=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('total');
    });

    it('should filter orders by status', async () => {
      const response = await request(API_URL)
        .get('/orders?status=OPEN')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every((order: any) => order.status === OrderStatus.OPEN)).toBe(
        true
      );
    });
  });

  describe('Course Management', () => {
    it('should add a course to order', async () => {
      const response = await request(API_URL)
        .post(`/orders/${orderId}/courses`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseType: CourseType.MAIN,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.courseType).toBe(CourseType.MAIN);

      courseId = response.body.data.id;
    });

    it('should add multiple courses to same order', async () => {
      const response = await request(API_URL)
        .post(`/orders/${orderId}/courses`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseType: CourseType.DESSERT,
        });

      expect(response.status).toBe(201);
      expect(response.body.data.courseType).toBe(CourseType.DESSERT);
    });
  });

  describe('Order Items Management', () => {
    it('should add item to order course', async () => {
      const response = await request(API_URL)
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId,
          menuItemId: 'menu-item-001',
          quantity: 2,
          notes: 'No onions',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.quantity).toBe(2);
      expect(response.body.data.specialNotes).toBe('No onions');
    });

    it('should prevent adding items to closed order', async () => {
      // First, close the order
      await request(API_URL)
        .patch(`/orders/${orderId}/close`)
        .set('Authorization', `Bearer ${authToken}`);

      const response = await request(API_URL)
        .post(`/orders/${orderId}/items`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          courseId,
          menuItemId: 'menu-item-002',
          quantity: 1,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Order Status Updates', () => {
    let testOrderId: string;

    beforeEach(async () => {
      // Create a fresh order for status tests
      const response = await request(API_URL)
        .post('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tableId,
          serverId,
          guestCount: 2,
        });
      testOrderId = response.body.data.id;
    });

    it('should transition order from OPEN to IN_PROGRESS', async () => {
      const response = await request(API_URL)
        .patch(`/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: OrderStatus.IN_PROGRESS,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('should prevent invalid state transitions', async () => {
      const response = await request(API_URL)
        .patch(`/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: OrderStatus.CLOSED,
        });

      // Assuming OPEN -> CLOSED is not valid (should go OPEN -> IN_PROGRESS -> READY -> COMPLETED -> PAID -> CLOSED)
      expect(response.status).toBe(400);
    });

    it('should close order', async () => {
      const response = await request(API_URL)
        .patch(`/orders/${testOrderId}/close`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(OrderStatus.CLOSED);
    });
  });

  describe('Kitchen Display System', () => {
    it('should retrieve all pending orders', async () => {
      const response = await request(API_URL)
        .get('/kitchen/orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get kitchen display system view', async () => {
      const response = await request(API_URL)
        .get('/kitchen/display')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('pending');
      expect(response.body.data).toHaveProperty('prepared');
      expect(response.body.data).toHaveProperty('served');
    });

    it('should retrieve items by status', async () => {
      const response = await request(API_URL)
        .get('/kitchen/items?status=PENDING&limit=20')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get kitchen metrics', async () => {
      const response = await request(API_URL)
        .get('/kitchen/metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('totalPreparedInLastHour');
      expect(response.body.data).toHaveProperty('averagePrepTime');
      expect(response.body.data).toHaveProperty('allPendingItems');
    });
  });

  describe('Order Item Lifecycle (Kitchen Operations)', () => {
    let testItemId: string;

    it('should fire order item (start preparation)', async () => {
      // Assuming item was already created in previous tests
      const response = await request(API_URL)
        .patch(`/kitchen/items/item-test-001/fire`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('preparedAt');
    });

    it('should mark item as complete', async () => {
      const response = await request(API_URL)
        .patch(`/kitchen/items/item-test-001/complete`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });

    it('should serve item', async () => {
      const response = await request(API_URL)
        .patch(`/kitchen/items/item-test-001/serve`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveProperty('servedAt');
    });
  });

  describe('Special Requests', () => {
    let specialRequestId: string;

    it('should create special request for order', async () => {
      const response = await request(API_URL)
        .post(`/orders/${orderId}/special-requests`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Extra napkins',
          description: 'Customer requested extra napkins',
          priority: 'LOW',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toHaveProperty('id');
      specialRequestId = response.body.data.id;
    });

    it('should retrieve special requests for order', async () => {
      const response = await request(API_URL)
        .get(`/orders/${orderId}/special-requests`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should update special request status', async () => {
      const response = await request(API_URL)
        .put(`/special-requests/${specialRequestId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'IN_PROGRESS',
        });

      expect(response.status).toBe(200);
    });

    it('should get high priority requests', async () => {
      const response = await request(API_URL)
        .get('/special-requests/priority/HIGH')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent order', async () => {
      const response = await request(API_URL)
        .get('/orders/non-existent-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(API_URL)
        .get('/orders');

      expect(response.status).toBe(401);
    });

    it('should validate request body', async () => {
      const response = await request(API_URL)
        .post('/orders')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tableId: 'table-1',
          // Missing required fields
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Reservation Workflow Integration', () => {
  it('should complete full reservation lifecycle', async () => {
    // 1. Create (PENDING)
    const created = await ReservationService.createReservation(
      { ...reservationData },
      testTenantId,
      testUserId
    );

    // 2. Confirm (CONFIRMED)
    const confirmed = await ReservationService.updateReservationStatus(
      created.id,
      ReservationStatus.CONFIRMED,
      testTenantId,
      testUserId
    );

    // 3. Checkin/Seat (SEATED)
    const seated = await ReservationService.seatReservation(
      confirmed.id,
      testTableId,
      testTenantId,
      testUserId
    );

    // 4. Complete (COMPLETED)
    const completed = await ReservationService.updateReservationStatus(
      seated.reservation.id,
      ReservationStatus.COMPLETED,
      testTenantId,
      testUserId
    );

    expect(completed.status).toBe(ReservationStatus.COMPLETED);
  });

  it('should prevent double-bookings', async () => {
    // Create first reservation
    const first = await ReservationService.createReservation(
      { ...reservationData, tableId: testTableId },
      testTenantId,
      testUserId
    );

    // Try to create overlapping reservation on same table
    // Should fail with AvailabilityService check
    const available = await AvailabilityService.isTableAvailable(
      testTableId,
      reservationData.reservedAt,
      '19:00',
      reservationData.guestCount,
      testTenantId
    );

    expect(available).toBe(false);
  });
});
});
