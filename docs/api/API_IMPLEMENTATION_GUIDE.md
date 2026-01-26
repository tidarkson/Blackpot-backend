# BlackPot Backend - API Implementation Guide

**Version**: 1.0  
**Framework**: Express.js + TypeScript  
**Date**: January 23, 2026  

---

## 📌 OVERVIEW

This guide provides step-by-step instructions for implementing the BlackPot Backend API based on the schema, endpoints specification, and RBAC matrix.

### What You're Building

A complete REST API for a fine dining restaurant POS system with:
- Multi-tenant architecture (supports multiple restaurant groups)
- Role-based access control (9 roles with different permissions)
- Real-time order management and kitchen display
- Reservation and table management
- Inventory tracking with financial reconciliation
- Business operations and reporting

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Web/Mobile)                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓ HTTP/REST
┌──────────────────────────────────────────────────────────┐
│                   Express.js Server                       │
├─────────────────────────────────────────────────────────┤
│ Authentication Layer (JWT, Password Reset)               │
│ Authorization Layer (Role-based Middleware)              │
│ Request Validation (Middleware)                          │
│ Error Handling (Global Error Handler)                    │
├─────────────────────────────────────────────────────────┤
│                 Route Handlers (Controllers)             │
│ ├─ Auth Routes     ├─ Orders Routes  ├─ Reports         │
│ ├─ Users Routes    ├─ Menu Routes    ├─ Analytics       │
│ ├─ Tables Routes   ├─ Kitchen Routes ├─ Operations      │
│ └─ Reservation     └─ Inventory      └─ Payments        │
├─────────────────────────────────────────────────────────┤
│              Service Layer (Business Logic)              │
│ ├─ OrderService   ├─ AuthService    ├─ ReservationSvc  │
│ ├─ MenuService    ├─ UserService    ├─ InventorySvc    │
│ └─ KitchenService └─ PaymentService └─ ReportService   │
├─────────────────────────────────────────────────────────┤
│            Data Access Layer (Prisma ORM)               │
│ ├─ User queries    ├─ Order queries  ├─ Menu queries   │
│ ├─ Table queries   ├─ Payment queries└─ Report queries │
└───────────────────┬────────────────────────────────────┘
                    │
                    ↓ SQL
         ┌──────────────────────┐
         │   PostgreSQL DB      │
         │ (28 models, 25+idx)  │
         └──────────────────────┘
```

---

## 🚀 PHASE 1: PROJECT SETUP (1-2 hours)

### Step 1.1: Initialize Express Project

```bash
# Create backend directory structure
cd backend

# Install dependencies
npm install express cors dotenv helmet

# Install TypeScript & types
npm install --save-dev typescript @types/express @types/node ts-node

# Initialize TypeScript config
npx tsc --init

# Create directory structure
mkdir -p src/{routes,controllers,services,middleware,types,utils,config}
```

### Step 1.2: Configure TypeScript

Update `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 1.3: Create Environment Configuration

Create `src/config/environment.ts`:

```typescript
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  PORT: parseInt(process.env.PORT || '3000'),
  HOST: process.env.HOST || 'localhost',
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Database
  DATABASE_URL: process.env.DATABASE_URL!,
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET!,
  JWT_EXPIRY: process.env.JWT_EXPIRY || '24h',
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || '7d',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // API
  API_VERSION: 'v1',
  API_PREFIX: '/api/v1',
};
```

### Step 1.4: Create Main Application File

Create `src/index.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/environment';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Routes (will add later)
app.use(`${config.API_PREFIX}/auth`, (req, res) => {
  res.json({ message: 'Auth routes - coming soon' });
});

// Error handling
app.use(errorHandler);

// Start server
app.listen(config.PORT, config.HOST, () => {
  console.log(`🚀 Server running at http://${config.HOST}:${config.PORT}`);
});
```

### Step 1.5: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "prisma migrate dev",
    "db:seed": "node -r ts-node/register database/seeds/seed.ts",
    "db:studio": "prisma studio",
    "db:reset": "prisma migrate reset"
  }
}
```

---

## 🔐 PHASE 2: AUTHENTICATION (2-3 hours)

### Step 2.1: Install Auth Dependencies

```bash
npm install jsonwebtoken bcryptjs
npm install --save-dev @types/jsonwebtoken @types/bcryptjs
```

### Step 2.2: Create Auth Types

Create `src/types/auth.ts`:

```typescript
import { UserRole } from '@prisma/client';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  locationId: string;
  role: UserRole;
  email: string;
}

export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    tenantId: string;
    locationId: string;
  };
}

export interface PasswordResetRequest {
  email: string;
  newPassword: string;
  resetToken?: string;
}
```

### Step 2.3: Create Auth Service

Create `src/services/AuthService.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment';
import { JWTPayload, AuthResponse } from '../types/auth';

const prisma = new PrismaClient();

export class AuthService {
  // Hash password
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  // Verify password
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate tokens
  generateTokens(payload: Omit<JWTPayload, 'tenantId'> & { tenantId: string }): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessToken = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRY,
    });

    const refreshToken = jwt.sign(
      { userId: payload.userId, tenantId: payload.tenantId },
      config.JWT_SECRET,
      { expiresIn: config.REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
  }

  // Verify token
  verifyToken(token: string): JWTPayload {
    try {
      return jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  // Login
  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true, location: true },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordMatch = await this.verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      throw new Error('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.generateTokens({
      userId: user.id,
      tenantId: user.tenantId,
      locationId: user.locationId,
      role: user.role,
      email: user.email,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        locationId: user.locationId,
      },
    };
  }

  // Change password
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const passwordMatch = await this.verifyPassword(currentPassword, user.passwordHash);
    if (!passwordMatch) throw new Error('Current password incorrect');

    const hashedPassword = await this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hashedPassword },
    });
  }
}
```

### Step 2.4: Create Auth Middleware

Create `src/middleware/auth.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/AuthService';
import { JWTPayload } from '../types/auth';

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

const authService = new AuthService();

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_TOKEN',
        message: 'No authentication token provided',
      });
    }

    const payload = authService.verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      code: 401,
      error: 'INVALID_TOKEN',
      message: 'Invalid or expired token',
    });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_TOKEN',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        code: 403,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `This action requires one of: ${roles.join(', ')}`,
      });
    }

    next();
  };
};
```

### Step 2.5: Create Auth Controller

Create `src/controllers/AuthController.ts`:

```typescript
import { Request, Response } from 'express';
import { AuthService } from '../services/AuthService';

const authService = new AuthService();

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      
      return res.status(200).json({
        status: 'success',
        code: 200,
        data: result,
      });
    } catch (error: any) {
      return res.status(401).json({
        status: 'error',
        code: 401,
        error: 'INVALID_CREDENTIALS',
        message: error.message,
      });
    }
  }

  static async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.userId;

      await authService.changePassword(userId, currentPassword, newPassword);

      return res.status(200).json({
        status: 'success',
        code: 200,
        message: 'Password updated successfully',
      });
    } catch (error: any) {
      return res.status(400).json({
        status: 'error',
        code: 400,
        error: 'PASSWORD_UPDATE_FAILED',
        message: error.message,
      });
    }
  }
}
```

### Step 2.6: Create Auth Routes

Create `src/routes/auth.ts`:

```typescript
import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/login', AuthController.login);
router.put('/password', authenticate, AuthController.changePassword);

export default router;
```

---

## 👥 PHASE 3: CORE MODELS (Orders, Tables, Users) (3-4 hours)

### Step 3.1: Create User Service

Create `src/services/UserService.ts`:

```typescript
import { PrismaClient, UserRole } from '@prisma/client';
import { AuthService } from './AuthService';

const prisma = new PrismaClient();
const authService = new AuthService();

export class UserService {
  async getAllUsers(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        tenantId: true,
        locationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createUser(
    tenantId: string,
    data: {
      email: string;
      name: string;
      password: string;
      role: UserRole;
      locationId: string;
    }
  ) {
    const passwordHash = await authService.hashPassword(data.password);

    return prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role,
        tenantId,
        locationId: data.locationId,
        isActive: true,
      },
    });
  }

  async updateUser(userId: string, data: Partial<{
    name: string;
    role: UserRole;
    isActive: boolean;
  }>) {
    return prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  async deactivateUser(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }
}
```

### Step 3.2: Create Order Service

Create `src/services/OrderService.ts`:

```typescript
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
```

### Step 3.3: Create Table Service

Create `src/services/TableService.ts`:

```typescript
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
```

### Step 3.4: Create User Controller

Create `src/controllers/UserController.ts`:

```typescript
import { Request, Response } from 'express';
import { UserService } from '../services/UserService';

const userService = new UserService();

export class UserController {
  static async listUsers(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;
      const users = await userService.getAllUsers(tenantId);
      return res.json({ status: 'success', data: users });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  static async getUser(req: Request, res: Response) {
    try {
      const user = await userService.getUserById(req.params.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }

  static async createUser(req: Request, res: Response) {
    try {
      const tenantId = req.user!.tenantId;
      const user = await userService.createUser(tenantId, req.body);
      return res.status(201).json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
  }

  static async updateUser(req: Request, res: Response) {
    try {
      const user = await userService.updateUser(req.params.userId, req.body);
      return res.json({ status: 'success', data: user });
    } catch (error: any) {
      return res.status(500).json({ status: 'error', message: error.message });
    }
  }
}
```

---

## 🏗️ PHASE 4: ERROR HANDLING & MIDDLEWARE (1-2 hours)

### Step 4.1: Create Error Handler

Create `src/middleware/errorHandler.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public code: number,
    public error: string,
    message: string,
    public details?: any
  ) {
    super(message);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof AppError) {
    return res.status(err.code).json({
      status: 'error',
      code: err.code,
      error: err.error,
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
    });
  }

  console.error('Unexpected error:', err);
  return res.status(500).json({
    status: 'error',
    code: 500,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
};
```

### Step 4.2: Create Request Logger

Create `src/middleware/requestLogger.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const originalSend = res.send;

  res.send = function(data: any) {
    const duration = Date.now() - start;
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      user: (req as any).user?.userId || 'anonymous',
    });
    return originalSend.call(this, data);
  };

  next();
};
```

---

## 📊 PHASE 5: KITCHEN DISPLAY SYSTEM (2-3 hours)

### Step 5.1: Create Kitchen Service

Create `src/services/KitchenService.ts`:

```typescript
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
```

---

## 💳 PHASE 6: PAYMENTS & BILLING (2 hours)

### Step 6.1: Create Payment Service

Create `src/services/PaymentService.ts`:

```typescript
import { PrismaClient, PaymentMethod, PaymentStatus } from '@prisma/client';
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
      method: string;
    }
  ) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new Error('Order not found');

    return prisma.tip.create({
      data: {
        orderId,
        amount: data.amount,
        method: data.method,
      },
    });
  }
}
```

---

## 📈 PHASE 7: REPORTS & ANALYTICS (2-3 hours)

### Step 7.1: Create Report Service

Create `src/services/ReportService.ts`:

```typescript
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
```

---

## 📝 DEPLOYMENT CHECKLIST

### Pre-Production

- [ ] All environment variables configured (.env file)
- [ ] Database migrations applied (`npm run db:migrate`)
- [ ] Seed data loaded (`npm run db:seed`)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Security: JWT secrets configured
- [ ] Security: CORS origins configured
- [ ] Performance: Indexes created (`database/sql/indexes.sql`)
- [ ] Logging: Structured logging configured
- [ ] Error handling: All endpoints have proper error responses

### Production

- [ ] Database backups configured
- [ ] SSL/TLS certificates installed
- [ ] Rate limiting enabled
- [ ] DDOS protection enabled (Cloudflare/AWS WAF)
- [ ] Monitoring/alerting configured (Sentry/DataDog)
- [ ] Log aggregation configured (CloudWatch/Elasticsearch)
- [ ] Database connection pooling optimized
- [ ] CDN configured for static assets

---

## 🧪 TESTING EXAMPLES

### Test Login Endpoint

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@blackpot.com",
    "password": "password123"
  }'
```

### Test Create Order (with auth)

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your_token>" \
  -d '{
    "tableId": "table-1",
    "guestCount": 2,
    "serverId": "user-123"
  }'
```

### Test Get Floor Plan

```bash
curl -X GET http://localhost:3000/api/v1/locations/location-1/tables \
  -H "Authorization: Bearer <your_token>"
```

---

## 🚀 NEXT STEPS

1. **Complete Phase 1-4** - Basic API infrastructure
2. **Complete Phase 5-6** - Core business logic
3. **Complete Phase 7** - Reporting and analytics
4. **Add Tests** - Unit and integration tests
5. **Deploy** - Follow production checklist
6. **Connect Frontend** - Integrate with React/Vue app

---

**See Also**:
- `ENDPOINTS_SPECIFICATION.md` - Complete API endpoint definitions
- `RBAC_MATRIX.md` - Role-based access control rules
- `DATABASE_SETUP_GUIDE.md` - Database initialization
- `COMPREHENSIVE_ANALYSIS.md` - Project analysis and feedback
