/**
 * Scheduler for managing timed and recurring tasks
 * Supports cron expressions, intervals, and monitoring-based scheduling
 */

import EventEmitter from 'events';
import * as cron from 'node-cron';
import { Logger } from '../utils/Logger';
import {
  DaemonConfig,
  Task,
  Schedule,
  DaemonEvent
} from '../types';

export class Scheduler extends EventEmitter {
  private config: DaemonConfig;
  private logger: Logger;
  private schedules: Map<string, Schedule> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private intervalTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private isInitialized: boolean = false;

  constructor(config: DaemonConfig) {
    super();
    this.config = config;
    this.logger = new Logger(config);
  }

  /**
   * Initialize the scheduler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing scheduler');

      // Load existing schedules from storage
      await this.loadSchedules();

      this.isInitialized = true;
      this.isRunning = true;

      this.logger.info('Scheduler initialized', {
        schedulesCount: this.schedules.size
      });

    } catch (error) {
      this.logger.error('Failed to initialize scheduler', { error });
      throw error;
    }
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping scheduler');

    // Stop all cron jobs
    for (const [scheduleId, cronJob] of this.cronJobs) {
      cronJob.stop();
      this.logger.debug('Stopped cron job', { scheduleId });
    }
    this.cronJobs.clear();

    // Clear all interval timers
    for (const [scheduleId, timer] of this.intervalTimers) {
      clearInterval(timer);
      this.logger.debug('Cleared interval timer', { scheduleId });
    }
    this.intervalTimers.clear();

    this.isRunning = false;
  }

  /**
   * Add a new schedule
   */
  async addSchedule(schedule: Omit<Schedule, 'id' | 'runCount'>): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('Scheduler is not initialized');
    }

    // Validate schedule
    this.validateSchedule(schedule);

    const scheduleId = this.generateScheduleId();
    const fullSchedule: Schedule = {
      ...schedule,
      id: scheduleId,
      runCount: 0
    };

    this.schedules.set(scheduleId, fullSchedule);

    // Schedule the task if enabled
    if (fullSchedule.enabled) {
      await this.scheduleTask(fullSchedule);
    }

    // Save to storage
    await this.saveSchedule(fullSchedule);

    this.logger.info('Schedule added', {
      scheduleId,
      name: fullSchedule.name,
      enabled: fullSchedule.enabled
    });

    return scheduleId;
  }

  /**
   * Update an existing schedule
   */
  async updateSchedule(scheduleId: string, updates: Partial<Schedule>): Promise<void> {
    const existingSchedule = this.schedules.get(scheduleId);
    if (!existingSchedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Stop existing scheduling
    await this.unscheduleTask(scheduleId);

    // Update schedule
    const updatedSchedule = { ...existingSchedule, ...updates };
    this.schedules.set(scheduleId, updatedSchedule);

    // Reschedule if enabled
    if (updatedSchedule.enabled) {
      await this.scheduleTask(updatedSchedule);
    }

    // Save to storage
    await this.saveSchedule(updatedSchedule);

    this.logger.info('Schedule updated', {
      scheduleId,
      enabled: updatedSchedule.enabled
    });
  }

  /**
   * Remove a schedule
   */
  async removeSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Stop scheduling
    await this.unscheduleTask(scheduleId);

    // Remove from memory
    this.schedules.delete(scheduleId);

    // Remove from storage
    await this.deleteSchedule(scheduleId);

    this.logger.info('Schedule removed', { scheduleId });
  }

  /**
   * Enable a schedule
   */
  async enableSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (schedule.enabled) {
      return;
    }

    schedule.enabled = true;
    await this.scheduleTask(schedule);
    await this.saveSchedule(schedule);

    this.logger.info('Schedule enabled', { scheduleId });
  }

  /**
   * Disable a schedule
   */
  async disableSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    if (!schedule.enabled) {
      return;
    }

    schedule.enabled = false;
    await this.unscheduleTask(scheduleId);
    await this.saveSchedule(schedule);

    this.logger.info('Schedule disabled', { scheduleId });
  }

  /**
   * Get all schedules
   */
  async getSchedules(): Promise<Schedule[]> {
    return Array.from(this.schedules.values());
  }

  /**
   * Get a specific schedule
   */
  async getSchedule(scheduleId: string): Promise<Schedule | undefined> {
    return this.schedules.get(scheduleId);
  }

  /**
   * Get scheduler status
   */
  async getStatus(): Promise<{
    healthy: boolean;
    running: boolean;
    schedulesCount: number;
    activeSchedules: number;
    nextRuns: Array<{ scheduleId: string; nextRun: Date }>;
  }> {
    const activeSchedules = Array.from(this.schedules.values()).filter(s => s.enabled);
    const nextRuns = activeSchedules
      .filter(s => s.nextRun)
      .map(s => ({ scheduleId: s.id, nextRun: s.nextRun! }))
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());

    return {
      healthy: this.isRunning,
      running: this.isRunning,
      schedulesCount: this.schedules.size,
      activeSchedules: activeSchedules.length,
      nextRuns: nextRuns.slice(0, 10) // Return next 10 runs
    };
  }

  /**
   * Get scheduler statistics
   */
  async getStats() {
    const status = await this.getStatus();
    const schedules = Array.from(this.schedules.values());

    return {
      ...status,
      totalRuns: schedules.reduce((sum, s) => sum + s.runCount, 0),
      schedulesByType: {
        cron: schedules.filter(s => s.cronExpression).length,
        interval: schedules.filter(s => s.interval).length
      },
      averageRunsPerSchedule: schedules.length > 0
        ? schedules.reduce((sum, s) => sum + s.runCount, 0) / schedules.length
        : 0
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: DaemonConfig): Promise<void> {
    this.logger.info('Updating scheduler configuration', { config });
    this.config = config;

    // Restart scheduler with new config
    this.stop();
    this.isRunning = true;

    // Reschedule all enabled schedules
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled) {
        await this.scheduleTask(schedule);
      }
    }
  }

  /**
   * Manually trigger a schedule
   */
  async triggerSchedule(scheduleId: string): Promise<void> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    this.logger.info('Manually triggering schedule', { scheduleId });

    // Create and emit task
    const task = this.createTaskFromSchedule(schedule);
    this.emit('schedule:triggered', schedule);
    this.emit('task:created', task);
  }

  /**
   * Schedule a task based on schedule configuration
   */
  private async scheduleTask(schedule: Schedule): Promise<void> {
    if (schedule.cronExpression) {
      await this.scheduleCronTask(schedule);
    } else if (schedule.interval) {
      await this.scheduleIntervalTask(schedule);
    } else {
      this.logger.warn('Schedule has no timing configuration', { scheduleId: schedule.id });
    }
  }

  /**
   * Schedule a cron-based task
   */
  private async scheduleCronTask(schedule: Schedule): Promise<void> {
    if (!schedule.cronExpression) {
      return;
    }

    try {
      const cronJob = cron.schedule(schedule.cronExpression, async () => {
        await this.executeScheduledTask(schedule);
      }, {
        scheduled: false,
        timezone: schedule.timezone
      });

      this.cronJobs.set(schedule.id, cronJob);
      cronJob.start();

      // Calculate next run time
      schedule.nextRun = this.calculateNextCronRun(schedule.cronExpression, schedule.timezone);

      this.logger.debug('Cron task scheduled', {
        scheduleId: schedule.id,
        cronExpression: schedule.cronExpression,
        nextRun: schedule.nextRun
      });

    } catch (error) {
      this.logger.error('Failed to schedule cron task', {
        scheduleId: schedule.id,
        cronExpression: schedule.cronExpression,
        error
      });
      throw error;
    }
  }

  /**
   * Schedule an interval-based task
   */
  private async scheduleIntervalTask(schedule: Schedule): Promise<void> {
    if (!schedule.interval) {
      return;
    }

    try {
      const timer = setInterval(async () => {
        await this.executeScheduledTask(schedule);
      }, schedule.interval);

      this.intervalTimers.set(schedule.id, timer);

      // Set next run time
      schedule.nextRun = new Date(Date.now() + schedule.interval);

      this.logger.debug('Interval task scheduled', {
        scheduleId: schedule.id,
        interval: schedule.interval,
        nextRun: schedule.nextRun
      });

    } catch (error) {
      this.logger.error('Failed to schedule interval task', {
        scheduleId: schedule.id,
        interval: schedule.interval,
        error
      });
      throw error;
    }
  }

  /**
   * Unschedule a task
   */
  private async unscheduleTask(scheduleId: string): Promise<void> {
    // Stop cron job
    const cronJob = this.cronJobs.get(scheduleId);
    if (cronJob) {
      cronJob.stop();
      this.cronJobs.delete(scheduleId);
      this.logger.debug('Stopped cron job', { scheduleId });
    }

    // Clear interval timer
    const timer = this.intervalTimers.get(scheduleId);
    if (timer) {
      clearInterval(timer);
      this.intervalTimers.delete(scheduleId);
      this.logger.debug('Cleared interval timer', { scheduleId });
    }

    // Clear next run time
    const schedule = this.schedules.get(scheduleId);
    if (schedule) {
      schedule.nextRun = undefined;
    }
  }

  /**
   * Execute a scheduled task
   */
  private async executeScheduledTask(schedule: Schedule): Promise<void> {
    try {
      // Check max runs limit
      if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
        this.logger.info('Schedule reached max runs, disabling', {
          scheduleId: schedule.id,
          runCount: schedule.runCount,
          maxRuns: schedule.maxRuns
        });

        await this.disableSchedule(schedule.id);
        return;
      }

      // Update run count and last run time
      schedule.runCount++;
      schedule.lastRun = new Date();

      // Calculate next run time
      if (schedule.cronExpression) {
        schedule.nextRun = this.calculateNextCronRun(schedule.cronExpression, schedule.timezone);
      } else if (schedule.interval) {
        schedule.nextRun = new Date(Date.now() + schedule.interval);
      }

      // Save updated schedule
      await this.saveSchedule(schedule);

      // Create and emit task
      const task = this.createTaskFromSchedule(schedule);

      this.logger.info('Scheduled task triggered', {
        scheduleId: schedule.id,
        taskId: task.id,
        runCount: schedule.runCount
      });

      this.emit('schedule:triggered', schedule);
      this.emit('task:created', task);

    } catch (error) {
      this.logger.error('Failed to execute scheduled task', {
        scheduleId: schedule.id,
        error
      });
    }
  }

  /**
   * Create a task from schedule template
   */
  private createTaskFromSchedule(schedule: Schedule): Task {
    const now = new Date();
    return {
      ...schedule.taskTemplate,
      id: this.generateTaskId(),
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      scheduledTime: now
    };
  }

  /**
   * Calculate next cron run time
   */
  private calculateNextCronRun(cronExpression: string, timezone?: string): Date {
    // This is a simplified implementation
    // In a real implementation, you'd use a proper cron parser
    try {
      const now = new Date();
      // For now, return a rough estimate
      // TODO: Implement proper cron next run calculation
      return new Date(now.getTime() + 60000); // 1 minute from now
    } catch (error) {
      this.logger.error('Failed to calculate next cron run', { cronExpression, error });
      return new Date(Date.now() + 60000); // Default to 1 minute
    }
  }

  /**
   * Validate schedule configuration
   */
  private validateSchedule(schedule: Omit<Schedule, 'id' | 'runCount'>): void {
    if (!schedule.name) {
      throw new Error('Schedule must have a name');
    }

    if (!schedule.cronExpression && !schedule.interval) {
      throw new Error('Schedule must have either cronExpression or interval');
    }

    if (schedule.cronExpression && schedule.interval) {
      throw new Error('Schedule cannot have both cronExpression and interval');
    }

    if (schedule.interval && schedule.interval <= 0) {
      throw new Error('Interval must be positive');
    }

    if (schedule.maxRuns && schedule.maxRuns <= 0) {
      throw new Error('Max runs must be positive');
    }

    // Validate task template
    if (!schedule.taskTemplate.name) {
      throw new Error('Task template must have a name');
    }

    if (!schedule.taskTemplate.operation) {
      throw new Error('Task template must specify an operation');
    }
  }

  /**
   * Load schedules from storage
   */
  private async loadSchedules(): Promise<void> {
    // TODO: Implement loading from persistent storage
    // For now, we'll start with an empty schedule set
    this.logger.debug('No schedules loaded from storage (empty)');
  }

  /**
   * Save schedule to storage
   */
  private async saveSchedule(schedule: Schedule): Promise<void> {
    // TODO: Implement saving to persistent storage
    this.logger.debug('Schedule saved to storage', { scheduleId: schedule.id });
  }

  /**
   * Delete schedule from storage
   */
  private async deleteSchedule(scheduleId: string): Promise<void> {
    // TODO: Implement deletion from persistent storage
    this.logger.debug('Schedule deleted from storage', { scheduleId });
  }

  /**
   * Generate unique schedule ID
   */
  private generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}