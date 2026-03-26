import redisClient from '../utils/redisClient';

export class TokenBlacklistService {
  private readonly BLACKLIST_PREFIX = 'auth:blacklist:';
  private readonly REFRESH_BLACKLIST_PREFIX = 'auth:refresh:blacklist:';

  // Store token in Redis blacklist with TTL based on remaining token lifetime
  async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
    if (!token || ttlSeconds <= 0) {
      return;
    }

    const key = `${this.BLACKLIST_PREFIX}${token}`;
    await redisClient.set(key, '1', ttlSeconds);
  }

  // Check if token is blacklisted
  async isBlacklisted(token: string): Promise<boolean> {
    if (!token) return false;
    const key = `${this.BLACKLIST_PREFIX}${token}`;
    return redisClient.exists(key);
  }

  async revokeRefreshToken(refreshToken: string, ttlSeconds: number): Promise<void> {
    if (!refreshToken || ttlSeconds <= 0) {
      return;
    }

    const key = `${this.REFRESH_BLACKLIST_PREFIX}${refreshToken}`;
    await redisClient.set(key, '1', ttlSeconds);
  }

  async isRefreshTokenRevoked(refreshToken: string): Promise<boolean> {
    if (!refreshToken) return false;
    const key = `${this.REFRESH_BLACKLIST_PREFIX}${refreshToken}`;
    return redisClient.exists(key);
  }
}