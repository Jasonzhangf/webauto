/**
 * Resource monitoring and health management
 * Monitors system resources, worker health, and provides metrics
 */

import EventEmitter from 'events';
import * as si from 'systeminformation';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  ResourceMetrics,
  HealthIssue
} from '../types';

export class ResourceMonitor extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private isInitialized: boolean = false;
  private isRunning: boolean = false;
  private metricsInterval?: NodeJS.Timeout;
  private currentMetrics: ResourceMetrics;
  private metricsHistory: ResourceMetrics[] = [];
  private maxHistorySize = 1000;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config);
    this.currentMetrics = this.createEmptyMetrics();
  }

  /**
   * Initialize the resource monitor
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing resource monitor');

      // Get initial metrics
      this.currentMetrics = await this.collectMetrics();

      this.isInitialized = true;
      this.isRunning = true;

      // Start periodic metrics collection
      this.startMetricsCollection();

      this.logger.info('Resource monitor initialized');

    } catch (error) {
      this.logger.error('Failed to initialize resource monitor', { error });
      throw error;
    }
  }

  /**
   * Shutdown the resource monitor
   */
  async shutdown(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Shutting down resource monitor');

    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    this.isRunning = false;
    this.logger.info('Resource monitor shutdown completed');
  }

  /**
   * Get current resource metrics
   */
  async getCurrentMetrics(): Promise<ResourceMetrics> {
    if (!this.isInitialized) {
      throw new Error('Resource monitor is not initialized');
    }

    // Refresh metrics if not recently collected
    const now = Date.now();
    if (now - this.currentMetrics.timestamp.getTime() > 5000) { // 5 seconds
      this.currentMetrics = await this.collectMetrics();
    }

    return { ...this.currentMetrics };
  }

  /**
   * Get metrics history
   */
  async getMetricsHistory(limit?: number): Promise<ResourceMetrics[]> {
    const history = [...this.metricsHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get system health summary
   */
  async getHealthSummary(): Promise<{
    overall: 'healthy' | 'warning' | 'critical';
    issues: HealthIssue[];
    components: {
      cpu: 'healthy' | 'warning' | 'critical';
      memory: 'healthy' | 'warning' | 'critical';
      disk: 'healthy' | 'warning' | 'critical';
      network: 'healthy' | 'warning' | 'critical';
    };
  }> {
    const metrics = await this.getCurrentMetrics();
    const issues: HealthIssue[] = [];
    const now = new Date();

    // Check CPU health
    let cpuStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (metrics.cpu.usage > 90) {
      cpuStatus = 'critical';
      issues.push({
        severity: 'critical',
        component: 'cpu',
        message: `CPU usage critical: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.cpu.usage > 80) {
      cpuStatus = 'warning';
      issues.push({
        severity: 'medium',
        component: 'cpu',
        message: `CPU usage high: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Check memory health
    let memoryStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (metrics.memory.percentage > 90) {
      memoryStatus = 'critical';
      issues.push({
        severity: 'critical',
        component: 'memory',
        message: `Memory usage critical: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.memory.percentage > 80) {
      memoryStatus = 'warning';
      issues.push({
        severity: 'medium',
        component: 'memory',
        message: `Memory usage high: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Check disk health
    let diskStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (metrics.disk.percentage > 95) {
      diskStatus = 'critical';
      issues.push({
        severity: 'critical',
        component: 'disk',
        message: `Disk usage critical: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    } else if (metrics.disk.percentage > 85) {
      diskStatus = 'warning';
      issues.push({
        severity: 'medium',
        component: 'disk',
        message: `Disk usage high: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now,
        resolved: false
      });
    }

    // Determine overall health
    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.some(issue => issue.severity === 'critical')) {
      overall = 'critical';
    } else if (issues.some(issue => issue.severity === 'medium')) {
      overall = 'warning';
    }

    return {
      overall,
      issues,
      components: {
        cpu: cpuStatus,
        memory: memoryStatus,
        disk: diskStatus,
        network: 'healthy' // TODO: Implement network health check
      }
    };
  }

  /**
   * Get resource usage statistics
   */
  async getResourceStats(): Promise<{
    averages: {
      cpu: number;
      memory: number;
      disk: number;
    };
    peaks: {
      cpu: number;
      memory: number;
      disk: number;
    };
    trends: {
      cpu: 'increasing' | 'decreasing' | 'stable';
      memory: 'increasing' | 'decreasing' | 'stable';
      disk: 'increasing' | 'decreasing' | 'stable';
    };
  }> {
    const history = await this.getMetricsHistory(60); // Last 60 measurements

    if (history.length < 2) {
      return {
        averages: { cpu: 0, memory: 0, disk: 0 },
        peaks: { cpu: 0, memory: 0, disk: 0 },
        trends: { cpu: 'stable', memory: 'stable', disk: 'stable' }
      };
    }

    // Calculate averages
    const avgCpu = history.reduce((sum, m) => sum + m.cpu.usage, 0) / history.length;
    const avgMemory = history.reduce((sum, m) => sum + m.memory.percentage, 0) / history.length;
    const avgDisk = history.reduce((sum, m) => sum + m.disk.percentage, 0) / history.length;

    // Calculate peaks
    const peakCpu = Math.max(...history.map(m => m.cpu.usage));
    const peakMemory = Math.max(...history.map(m => m.memory.percentage));
    const peakDisk = Math.max(...history.map(m => m.disk.percentage));

    // Calculate trends (simple linear regression)
    const recentHalf = history.slice(Math.floor(history.length / 2));
    const olderHalf = history.slice(0, Math.floor(history.length / 2));

    const avgCpuRecent = recentHalf.reduce((sum, m) => sum + m.cpu.usage, 0) / recentHalf.length;
    const avgCpuOlder = olderHalf.reduce((sum, m) => sum + m.cpu.usage, 0) / olderHalf.length;

    const avgMemoryRecent = recentHalf.reduce((sum, m) => sum + m.memory.percentage, 0) / recentHalf.length;
    const avgMemoryOlder = olderHalf.reduce((sum, m) => sum + m.memory.percentage, 0) / olderHalf.length;

    const calculateTrend = (recent: number, older: number): 'increasing' | 'decreasing' | 'stable' => {
      const threshold = 5; // 5% threshold
      const diff = recent - older;
      if (Math.abs(diff) < threshold) return 'stable';
      return diff > 0 ? 'increasing' : 'decreasing';
    };

    return {
      averages: {
        cpu: avgCpu,
        memory: avgMemory,
        disk: avgDisk
      },
      peaks: {
        cpu: peakCpu,
        memory: peakMemory,
        disk: peakDisk
      },
      trends: {
        cpu: calculateTrend(avgCpuRecent, avgCpuOlder),
        memory: calculateTrend(avgMemoryRecent, avgMemoryOlder),
        disk: 'stable' // Disk usage typically doesn't trend in short periods
      }
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: DaemonConfig): Promise<void> {
    this.logger.info('Updating resource monitor configuration', { config });
    this.config = config;

    // Restart metrics collection with new interval
    if (this.isRunning) {
      this.startMetricsCollection();
    }
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    const interval = Math.max(5000, this.config.healthCheckInterval / 2); // At least 5 seconds

    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = await this.collectMetrics();
        this.currentMetrics = metrics;
        this.addToHistory(metrics);

        // Check for resource warnings
        await this.checkResourceWarnings(metrics);

      } catch (error) {
        this.logger.error('Failed to collect metrics', { error });
      }
    }, interval);

    this.logger.debug('Metrics collection started', { interval });
  }

  /**
   * Collect system metrics
   */
  private async collectMetrics(): Promise<ResourceMetrics> {
    try {
      const [
        memInfo,
        cpuInfo,
        cpuCurrent,
        diskInfo,
        networkInfo,
        processes
      ] = await Promise.all([
        si.mem(),
        si.cpu(),
        si.currentLoad(),
        si.fsSize(),
        si.networkStats(),
        si.processes()
      ]);

      // Calculate task statistics (simplified)
      const taskStats = this.calculateTaskStats(processes);

      const metrics: ResourceMetrics = {
        timestamp: new Date(),
        memory: {
          total: memInfo.total,
          used: memInfo.used,
          free: memInfo.free,
          percentage: (memInfo.used / memInfo.total) * 100
        },
        cpu: {
          usage: cpuCurrent.currentLoad,
          cores: cpuInfo.cores,
          loadAverage: cpuInfo.loadAvg || []
        },
        disk: {
          total: diskInfo[0]?.size || 0,
          used: diskInfo[0]?.used || 0,
          free: diskInfo[0]?.available || 0,
          percentage: diskInfo[0] ? (diskInfo[0].used / diskInfo[0].size) * 100 : 0
        },
        network: {
          bytesReceived: networkInfo.reduce((sum, iface) => sum + iface.rx_bytes, 0),
          bytesSent: networkInfo.reduce((sum, iface) => sum + iface.tx_bytes, 0),
          packetsReceived: networkInfo.reduce((sum, iface) => sum + iface.rx_packets, 0),
          packetsSent: networkInfo.reduce((sum, iface) => sum + iface.tx_packets, 0)
        },
        workers: taskStats.workers,
        tasks: taskStats.tasks
      };

      return metrics;

    } catch (error) {
      this.logger.error('Failed to collect system metrics', { error });
      return this.createEmptyMetrics();
    }
  }

  /**
   * Calculate task statistics from process information
   */
  private calculateTaskStats(processes: any) {
    // This is a simplified implementation
    // In a real implementation, you'd track actual task counts
    return {
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
   * Add metrics to history
   */
  private addToHistory(metrics: ResourceMetrics): void {
    this.metricsHistory.push({ ...metrics });

    // Limit history size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Check for resource warnings and emit events
   */
  private async checkResourceWarnings(metrics: ResourceMetrics): Promise<void> {
    const now = new Date();

    // Check CPU usage
    if (metrics.cpu.usage > 90) {
      this.emit('resource:critical', {
        type: 'cpu',
        usage: metrics.cpu.usage,
        message: `CPU usage critical: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now
      });
    } else if (metrics.cpu.usage > 80) {
      this.emit('resource:warning', {
        type: 'cpu',
        usage: metrics.cpu.usage,
        message: `CPU usage high: ${metrics.cpu.usage.toFixed(1)}%`,
        timestamp: now
      });
    }

    // Check memory usage
    if (metrics.memory.percentage > 90) {
      this.emit('resource:critical', {
        type: 'memory',
        usage: metrics.memory.percentage,
        message: `Memory usage critical: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now
      });
    } else if (metrics.memory.percentage > 80) {
      this.emit('resource:warning', {
        type: 'memory',
        usage: metrics.memory.percentage,
        message: `Memory usage high: ${metrics.memory.percentage.toFixed(1)}%`,
        timestamp: now
      });
    }

    // Check disk usage
    if (metrics.disk.percentage > 95) {
      this.emit('resource:critical', {
        type: 'disk',
        usage: metrics.disk.percentage,
        message: `Disk usage critical: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now
      });
    } else if (metrics.disk.percentage > 85) {
      this.emit('resource:warning', {
        type: 'disk',
        usage: metrics.disk.percentage,
        message: `Disk usage high: ${metrics.disk.percentage.toFixed(1)}%`,
        timestamp: now
      });
    }
  }

  /**
   * Create empty metrics structure
   */
  private createEmptyMetrics(): ResourceMetrics {
    return {
      timestamp: new Date(),
      memory: {
        total: 0,
        used: 0,
        free: 0,
        percentage: 0
      },
      cpu: {
        usage: 0,
        cores: 0,
        loadAverage: []
      },
      disk: {
        total: 0,
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
}