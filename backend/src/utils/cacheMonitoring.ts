import cacheService from '../services/CacheService';
import logger from '../config/logger';

/**
 * Cache Monitoring & Analytics Service
 * Tracks cache hit/miss rates, performance metrics, and health
 */
export class CacheMonitoring {
  private hitCount: Map<string, number> = new Map();
  private missCount: Map<string, number> = new Map();
  private invalidationCount: Map<string, number> = new Map();
  private lastReset: Date = new Date();

  /**
   * Record a cache hit
   * @param endpoint The API endpoint that was hit
   */
  recordHit(endpoint: string): void {
    const current = this.hitCount.get(endpoint) || 0;
    this.hitCount.set(endpoint, current + 1);
  }

  /**
   * Record a cache miss
   * @param endpoint The API endpoint that was missed
   */
  recordMiss(endpoint: string): void {
    const current = this.missCount.get(endpoint) || 0;
    this.missCount.set(endpoint, current + 1);
  }

  /**
   * Record a cache invalidation
   * @param entityType The entity type that was invalidated
   */
  recordInvalidation(entityType: string): void {
    const current = this.invalidationCount.get(entityType) || 0;
    this.invalidationCount.set(entityType, current + 1);
  }

  /**
   * Get hit rate statistics
   * @returns Object with hit rates per endpoint
   */
  getHitRateStats(): Record<string, { hits: number; misses: number; hitRate: string }> {
    const stats: Record<string, any> = {};

    const allEndpoints = new Set([...this.hitCount.keys(), ...this.missCount.keys()]);

    for (const endpoint of allEndpoints) {
      const hits = this.hitCount.get(endpoint) || 0;
      const misses = this.missCount.get(endpoint) || 0;
      const total = hits + misses;
      const hitRate = total === 0 ? '0%' : `${((hits / total) * 100).toFixed(2)}%`;

      stats[endpoint] = {
        hits,
        misses,
        hitRate,
      };
    }

    return stats;
  }

  /**
   * Get overall cache statistics
   */
  async getOverallStats(): Promise<{
    hitRate: string;
    totalRequests: number;
    hits: number;
    misses: number;
    uptime: string;
    endpoints: Record<string, any>;
  }> {
    const hitRateStats = this.getHitRateStats();
    let totalHits = 0;
    let totalMisses = 0;

    Object.values(hitRateStats).forEach((stat) => {
      totalHits += stat.hits;
      totalMisses += stat.misses;
    });

    const total = totalHits + totalMisses;
    const hitRate = total === 0 ? '0%' : `${((totalHits / total) * 100).toFixed(2)}%`;

    const uptime = this.getUptimeDuration();

    return {
      hitRate,
      totalRequests: total,
      hits: totalHits,
      misses: totalMisses,
      uptime,
      endpoints: hitRateStats,
    };
  }

  /**
   * Get invalidation statistics
   */
  getInvalidationStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.invalidationCount.forEach((count, entity) => {
      stats[entity] = count;
    });
    return stats;
  }

  /**
   * Reset all statistics
   * Useful for daily/weekly reporting
   */
  resetStats(): void {
    this.hitCount.clear();
    this.missCount.clear();
    this.invalidationCount.clear();
    this.lastReset = new Date();
    logger.info('Cache monitoring stats reset');
  }

  /**
   * Get uptime since last reset
   */
  private getUptimeDuration(): string {
    const now = new Date();
    const diff = now.getTime() - this.lastReset.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get cache health status
   */
  async getCacheHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    hitRate: string;
    keysCount: number;
    issues: string[];
  }> {
    try {
      const stats = await cacheService.getStats();
      const hitRateStats = this.getHitRateStats();

      let totalHits = 0;
      let totalMisses = 0;

      Object.values(hitRateStats).forEach((stat) => {
        totalHits += stat.hits;
        totalMisses += stat.misses;
      });

      const total = totalHits + totalMisses;
      const hitRate = total === 0 ? '0%' : `${((totalHits / total) * 100).toFixed(2)}%`;

      const issues: string[] = [];

      // Check Redis connectivity
      if (!stats.healthy) {
        issues.push('Redis connection is unhealthy');
        return {
          status: 'critical',
          message: 'Redis is not responding',
          hitRate,
          keysCount: stats.keysCount || 0,
          issues,
        };
      }

      // Check hit rate
      const hitRatePercent = total === 0 ? 0 : (totalHits / total) * 100;
      if (hitRatePercent < 50) {
        issues.push(`Low cache hit rate: ${hitRatePercent.toFixed(2)}%`);
      }

      // Check cache size
      if ((stats.keysCount || 0) > 1000000) {
        issues.push(`Large cache size: ${stats.keysCount} keys`);
      }

      // Determine status
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (issues.length > 2 || hitRatePercent < 30) {
        status = 'critical';
      } else if (issues.length > 0) {
        status = 'warning';
      }

      return {
        status,
        message: issues.length === 0 ? 'Cache is healthy' : `${issues.length} issues detected`,
        hitRate,
        keysCount: stats.keysCount || 0,
        issues,
      };
    } catch (error) {
      logger.error('Error getting cache health:', error);
      return {
        status: 'critical',
        message: 'Failed to check cache health',
        hitRate: 'unknown',
        keysCount: 0,
        issues: ['Failed to get cache metrics'],
      };
    }
  }

  /**
   * Generate a detailed report
   */
  async generateReport(): Promise<string> {
    const health = await this.getCacheHealth();
    const overall = await this.getOverallStats();
    const invalidations = this.getInvalidationStats();

    let report = '## Cache Performance Report\n\n';
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Uptime:** ${overall.uptime}\n\n`;

    report += '### Overall Metrics\n';
    report += `- **Status:** ${health.status.toUpperCase()}\n`;
    report += `- **Hit Rate:** ${overall.hitRate}\n`;
    report += `- **Total Requests:** ${overall.totalRequests}\n`;
    report += `- **Cache Hits:** ${overall.hits}\n`;
    report += `- **Cache Misses:** ${overall.misses}\n`;
    report += `- **Cached Keys:** ${health.keysCount}\n\n`;

    report += '### Hit Rate by Endpoint\n';
    Object.entries(overall.endpoints).forEach(([endpoint, stats]) => {
      report += `- **${endpoint}:** ${stats.hitRate} (${stats.hits} hits, ${stats.misses} misses)\n`;
    });
    report += '\n';

    report += '### Invalidations\n';
    Object.entries(invalidations).forEach(([entity, count]) => {
      report += `- **${entity}:** ${count} invalidations\n`;
    });

    if (health.issues.length > 0) {
      report += '\n### ⚠️  Issues\n';
      health.issues.forEach((issue) => {
        report += `- ${issue}\n`;
      });
    }

    return report;
  }
}

// Export singleton instance
export const cacheMonitoring = new CacheMonitoring();

export default cacheMonitoring;
