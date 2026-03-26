import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config/environment';

const prisma = new PrismaClient();
const DEFAULT_TEST_PASSWORD = 'TestPassword123!';

declare global {
  // eslint-disable-next-line no-var
  var __TEST_TENANT_IDS__: Set<string> | undefined;
}

const getTenantRegistry = (): Set<string> => {
  if (!global.__TEST_TENANT_IDS__) {
    global.__TEST_TENANT_IDS__ = new Set<string>();
  }
  return global.__TEST_TENANT_IDS__;
};

export const getRegisteredTestTenants = (): string[] => {
  return Array.from(getTenantRegistry());
};

export const generateTestToken = (
  userId: string,
  tenantId: string,
  role: UserRole | string,
  locationId: string = ''
): string => {
  return jwt.sign(
    {
      userId,
      tenantId,
      locationId,
      role,
      email: `test+${userId}@blackpot.local`,
    },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_EXPIRY,
    } as jwt.SignOptions
  );
};

export const createTestTenant = async () => {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Test Tenant ${Date.now()}`,
      isActive: true,
    },
  });

  getTenantRegistry().add(tenant.id);
  return tenant.id;
};

export const createTestLocation = async (tenantId: string) => {
  return prisma.location.create({
    data: {
      tenantId,
      name: `Test Location ${Date.now()}`,
    },
  });
};

export const createTestUser = async (tenantId: string, role: UserRole | string) => {
  let location = await prisma.location.findFirst({ where: { tenantId } });
  if (!location) {
    location = await createTestLocation(tenantId);
  }

  const passwordHash = await bcrypt.hash(DEFAULT_TEST_PASSWORD, 12);
  const user = await prisma.user.create({
    data: {
      tenantId,
      locationId: location.id,
      email: `test-${String(role).toLowerCase()}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}@example.com`,
      name: `Test ${role}`,
      passwordHash,
      role: role as UserRole,
      isActive: true,
    },
    include: {
      tenant: true,
      location: true,
    },
  });

  getTenantRegistry().add(tenantId);

  return {
    user,
    token: generateTestToken(user.id, tenantId, user.role, user.locationId || ''),
    password: DEFAULT_TEST_PASSWORD,
  };
};

export const cleanupTestData = async (tenantId: string) => {
  if (!tenantId) return;

  try {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  } finally {
    getTenantRegistry().delete(tenantId);
  }
};

export { prisma };
