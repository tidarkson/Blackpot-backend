import request from 'supertest';
import { PrismaClient, OrderStatus, CourseType } from '@prisma/client';

/**
 * Integration Tests for Order Management API
 * These tests verify the full order workflow across multiple endpoints
 */

describe('Order Management API Integration Tests', () => {
  const API_URL = process.env.API_URL || 'http://localhost:3000/api';
  const authToken = process.env.TEST_AUTH_TOKEN || 'test-token';

  let orderId: string;
  let courseId: string;
  let tableId: string = 'table-test-001';
  let serverId: string = 'server-test-001';

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
});
