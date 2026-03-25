import { UserRole } from '@prisma/client';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { AuthService } from '../services/AuthService';
import logger from './logger';

type RoomRole = 'admin' | 'customer' | 'floor' | 'kitchen' | 'staff' | 'all';

interface AuthenticatedSocket extends Socket {
  data: Socket['data'] & {
    userId: string;
    tenantId: string;
    role: UserRole;
    email: string;
    locationId: string;
  };
}

let ioInstance: SocketIOServer | null = null;

const authService = new AuthService();
const roomRoles: RoomRole[] = ['admin', 'customer', 'floor', 'kitchen', 'staff', 'all'];

const mapUserRoleToRoomRole = (role: UserRole): RoomRole => {
  switch (role) {
    case UserRole.OWNER:
    case UserRole.MANAGER:
      return 'admin';
    case UserRole.SUPERVISOR:
      return 'kitchen';
    case UserRole.STAFF:
      return 'staff';
    case UserRole.CUSTOMER:
      return 'customer';
    default:
      return 'staff';
  }
};

export const buildTenantRoom = (tenantId: string, role: RoomRole): string => {
  return `tenant_${tenantId}_${role}`;
};

const getHandshakeToken = (socket: Socket): string | undefined => {
  const authToken = socket.handshake.auth?.token;

  if (typeof authToken === 'string' && authToken.trim().length > 0) {
    return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
  }

  const authorizationHeader = socket.handshake.headers.authorization;
  if (typeof authorizationHeader === 'string' && authorizationHeader.trim().length > 0) {
    return authorizationHeader.startsWith('Bearer ')
      ? authorizationHeader.slice(7)
      : authorizationHeader;
  }

  return undefined;
};

const getHandshakeRoomRole = (socket: Socket): RoomRole | undefined => {
  const handshakeRole = socket.handshake.auth?.role;

  if (typeof handshakeRole !== 'string') {
    return undefined;
  }

  const normalizedRole = handshakeRole.trim().toLowerCase() as RoomRole;
  if (!roomRoles.includes(normalizedRole) || normalizedRole === 'all') {
    return undefined;
  }

  return normalizedRole;
};

const authenticateSocket = (socket: Socket, next: (err?: Error) => void) => {
  try {
    const token = getHandshakeToken(socket);

    if (!token) {
      return next(new Error('Authentication token is required'));
    }

    const payload = authService.verifyToken(token);
    const authenticatedSocket = socket as AuthenticatedSocket;

    authenticatedSocket.data.userId = payload.userId;
    authenticatedSocket.data.tenantId = payload.tenantId;
    authenticatedSocket.data.role = payload.role;
    authenticatedSocket.data.email = payload.email;
    authenticatedSocket.data.locationId = payload.locationId;

    return next();
  } catch (error: any) {
    logger.warn('Socket authentication failed', {
      message: error.message,
      socketId: socket.id,
    });

    return next(new Error('Invalid or expired token'));
  }
};

const registerConnectionHandler = (io: SocketIOServer) => {
  io.use(authenticateSocket);

  io.on('connection', (socket: Socket) => {
    const authenticatedSocket = socket as AuthenticatedSocket;
    const tenantRoom = buildTenantRoom(authenticatedSocket.data.tenantId, 'all');
    const requestedRole = getHandshakeRoomRole(authenticatedSocket);
    const roleRoom = buildTenantRoom(
      authenticatedSocket.data.tenantId,
      requestedRole || mapUserRoleToRoomRole(authenticatedSocket.data.role)
    );

    authenticatedSocket.join(tenantRoom);
    authenticatedSocket.join(roleRoom);

    logger.info('Socket client connected', {
      socketId: authenticatedSocket.id,
      tenantId: authenticatedSocket.data.tenantId,
      role: authenticatedSocket.data.role,
      rooms: [tenantRoom, roleRoom],
    });

    authenticatedSocket.on('disconnect', (reason) => {
      logger.info('Socket client disconnected', {
        socketId: authenticatedSocket.id,
        tenantId: authenticatedSocket.data.tenantId,
        reason,
      });
    });
  });
};

export const initializeSocketIO = (io: SocketIOServer): SocketIOServer => {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = io;
  registerConnectionHandler(ioInstance);

  return ioInstance;
};

export const getIO = (): SocketIOServer => {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized');
  }

  return ioInstance;
};