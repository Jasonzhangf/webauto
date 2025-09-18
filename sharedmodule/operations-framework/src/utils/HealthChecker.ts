/**
 * Health checking utility for monitoring system components
 */

import { HealthStatus, HealthIssue, ResourceMetrics } from '../types';

export class HealthChecker {
  private checks: Map<string, HealthCheck> = new Map();
  private thresholds: HealthThresholds;

  constructor(thresholds?: Partial<HealthThresholds>) {
    this.thresholds = {
      cpu: { warning: 80, critical: 90 },
      memory: { warning: 80, critical: 90 },
      disk: { warning: 85, critical: 95 },
      responseTime: { warning: 5000, critical: 10000 },
      errorRate: { warning: 0.05, critical: 0.1 },
      ...thresholds
    };
  }

  /**
   * Register a health check
   */
  register(name: string, check: HealthCheck): void {
    this.checks.set(name, check);
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): void {
    this.checks.delete(name);
  }

  /**
   * Run all health checks
   */
  async runAllChecks(): Promise<HealthStatus> {
    const issues: HealthIssue[] = [];
    const components: Record<string, boolean> = {};
    const now = new Date();

    // Run all registered checks
    for (const [name, check] of this.checks) {
      try {
        const result = await check.execute();
        components[name] = result.healthy;

        if (!result.healthy) {
          issues.push({
            severity: result.severity || 'medium',
            component: name,
            message: result.message || `${name} health check failed`,
            timestamp: now,
            resolved: false,
            details: result.details
          });
        }

      } catch (error) {
        components[name] = false;
        issues.push({
          severity: 'critical',
          component: name,
          message: `Health check error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: now,
          resolved: false,
          details: { error }
        });
      }
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.some(issue => issue.severity === 'critical')) {
      status = 'unhealthy';
    } else if (issues.some(issue => issue.severity === 'high' || issue.severity === 'medium')) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: now,
      uptime: process.uptime() * 1000,
      version: '1.0.0',
      components,
      issues,
      metrics: await this.getSystemMetrics()
    };
  }

  /**
   * Run a specific health check
   */
  async runCheck(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check not found: ${name}`);
    }

    return await check.execute();
  }

  /**
   * Check resource health based on metrics
   */
  checkResourceHealth(metrics: ResourceMetrics): HealthStatus {
    const issues: HealthIssue[] = [];
    const now = new Date();

    // Check CPU
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      issues.push({
        severity: 'critical',
        component: 'cpu',
        message: `CPU usage critical: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      issues.push({
        severity: 'medium',
        component: 'cpu',
        message: `CPU usage high: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Check Memory
    if (metrics.memory.percentage > this.thresholds.memory.critical) {
      issues.push({
        severity: 'critical',
        component: 'memory',
        message: `Memory usage critical: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.memory.percentage > this.thresholds.memory.warning) {
      issues.push({
        severity: 'medium',
        component: 'memory',
        message: `Memory usage high: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Check Disk
    if (metrics.disk.percentage > this.thresholds.disk.critical) {
      issues.push({
        severity: 'critical',
        component: 'disk',
        message: `Disk usage critical: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.disk.percentage > this.thresholds.disk.warning) {
      issues.push({
        severity: 'medium',
        component: 'disk',
        message: `Disk usage high: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.some(issue => issue.severity === 'critical')) {
      status = 'unhealthy';
    } else if (issues.some(issue => issue.severity === 'high' || issue.severity === 'medium')) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: now,
      uptime: process.uptime() * 1000,
      version: '1.0.0',
      components: {
        cpu: issues.filter(i => i.component === 'cpu').length === 0,
        memory: issues.filter(i => i.component === 'memory').length === 0,
        disk: issues.filter(i => i.component === 'disk').length === 0,
        scheduler: true,
        workers: true,
        storage: true,
        communication: true,
        metrics: true
      },
      issues,
      metrics
    };
  }

  /**
   * Get current system metrics
   */
  private async getSystemMetrics(): Promise<ResourceMetrics> {
    const now = new Date();
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      timestamp: now,
      memory: {
        total: memUsage.heapTotal,
        used: memUsage.heapUsed,
        free: memUsage.heapTotal - memUsage.heapUsed,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 10000, // Convert to percentage
        cores: require('os').cpus().length,
        loadAverage: require('os').loadavg()
      },
      disk: {
        total: 0, // Would need systeminformation for real values
        used: 0,
        free: 0,
        percentage: 0
      },
      network: {
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0
      },
      workers: {
        active: 0,
        idle: 0,
        total: 0
      },
      tasks: {
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0
      }
    };
  }

  /**
   * Create standard health checks
   */
  createStandardChecks(): void {
    // Process health check
    this.register('process', {
      execute: async () => {
        const memUsage = process.memoryUsage();
        const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;

        if (heapPercentage > this.thresholds.memory.critical) {
          return {
            healthy: false,
            severity: 'critical',
            message: `Process memory usage critical: ${heapPercentage.toFixed(1)}%`,
            details: { heapUsed: memUsage.heapUsed, heapTotal: memUsage.heapTotal }
          };
        }

        if (heapPercentage > this.thresholds.memory.warning) {
          return {
            healthy: false,
            severity: 'medium',
            message: `Process memory usage high: ${heapPercentage.toFixed(1)}%`,
            details: { heapUsed: memUsage.heapUsed, heapTotal: memUsage.heapTotal }
          };
        }

        return { healthy: true };
      }
    });

    // Event loop health check
    this.register('event_loop', {
      execute: async () => {
        const start = process.hrtime.bigint();
        await new Promise(resolve => setImmediate(resolve));
        const end = process.hrtime.bigint();
        const delay = Number(end - start) / 1000000; // Convert to milliseconds

        if (delay > this.thresholds.responseTime.critical) {
          return {
            healthy: false,
            severity: 'critical',
            message: `Event loop delay critical: ${delay.toFixed(2)}ms`,
            details: { delay }
          };
        }

        if (delay > this.thresholds.responseTime.warning) {
          return {
            healthy: false,
            severity: 'medium',
            message: `Event loop delay high: ${delay.toFixed(2)}ms`,
            details: { delay }
          };
        }

        return { healthy: true };
      }
    });

    // File system health check
    this.register('filesystem', {
      execute: async () => {
        const fs = await import('fs');
        const path = await import('path');

        try {
          const testDir = path.join(process.cwd(), '.healthcheck');
          const testFile = path.join(testDir, 'test.tmp');

          // Try to create directory and file
          if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
          }

          fs.writeFileSync(testFile, 'health check test');
          const content = fs.readFileSync(testFile, 'utf8');
          fs.unlinkSync(testFile);

          if (content !== 'health check test') {
            return {
              healthy: false,
              severity: 'critical',
              message: 'File system read/write test failed',
              details: { expected: 'health check test', actual: content }
            };
          }

          return { healthy: true };

        } catch (error) {
          return {
            healthy: false,
            severity: 'critical',
            message: `File system check failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    });

    // Network connectivity check
    this.register('network', {
      execute: async () => {
        try {
          const https = await import('https');

          return new Promise((resolve) => {
            const req = https.get('https://www.google.com', (res) => {
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
                resolve({ healthy: true });
              } else {
                resolve({
                  healthy: false,
                  severity: 'medium',
                  message: `Network request failed with status: ${res.statusCode}`,
                  details: { statusCode: res.statusCode }
                });
              }
              res.destroy();
            });

            req.on('error', (error) => {
              resolve({
                healthy: false,
                severity: 'medium',
                message: `Network request failed: ${error.message}`,
                details: { error }
              });
            });

            req.setTimeout(5000, () => {
              req.destroy();
              resolve({
                healthy: false,
                severity: 'medium',
                message: 'Network request timeout',
                details: { timeout: 5000 }
              });
            });
          });

        } catch (error) {
          return {
            healthy: false,
            severity: 'medium',
            message: `Network check failed: ${error instanceof Error ? error.message : String(error)}`,
            details: { error }
          };
        }
      }
    });
  }
}

/**
 * Health check interface
 */
export interface HealthCheck {
  execute(): Promise<HealthCheckResult>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  message?: string;
  details?: any;
}

/**
 * Health thresholds
 */
export interface HealthThresholds {
  cpu: { warning: number; critical: number };
  memory: { warning: number; critical: number };
  disk: { warning: number; critical: number };
  responseTime: { warning: number; critical: number };
  errorRate: { warning: number; critical: number };
}