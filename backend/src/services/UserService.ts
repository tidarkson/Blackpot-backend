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