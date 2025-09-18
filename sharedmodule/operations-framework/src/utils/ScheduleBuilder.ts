/**
 * Builder utility for creating schedules with fluent API
 */

import { Schedule } from '../types';

export class ScheduleBuilder {
  private schedule: Partial<Schedule> = {};

  constructor(name?: string) {
    if (name) {
      this.withName(name);
    }
  }

  /**
   * Set schedule name
   */
  withName(name: string): ScheduleBuilder {
    this.schedule.name = name;
    return this;
  }

  /**
   * Set cron expression
   */
  withCronExpression(cronExpression: string): ScheduleBuilder {
    this.schedule.cronExpression = cronExpression;
    this.schedule.interval = undefined; // Clear interval if cron is set
    return this;
  }

  /**
   * Set interval in milliseconds
   */
  withInterval(interval: number): ScheduleBuilder {
    this.schedule.interval = interval;
    this.schedule.cronExpression = undefined; // Clear cron if interval is set
    return this;
  }

  /**
   * Set task template
   */
  withTaskTemplate(template: Omit<Schedule['taskTemplate'], 'id' | 'createdAt' | 'updatedAt' | 'status'>): ScheduleBuilder {
    this.schedule.taskTemplate = template;
    return this;
  }

  /**
   * Set enabled state
   */
  withEnabled(enabled: boolean): ScheduleBuilder {
    this.schedule.enabled = enabled;
    return this;
  }

  /**
   * Set maximum runs
   */
  withMaxRuns(maxRuns: number): ScheduleBuilder {
    this.schedule.maxRuns = maxRuns;
    return this;
  }

  /**
   * Set timezone
   */
  withTimezone(timezone: string): ScheduleBuilder {
    this.schedule.timezone = timezone;
    return this;
  }

  /**
   * Set next run time (for testing purposes)
   */
  withNextRun(nextRun: Date): ScheduleBuilder {
    this.schedule.nextRun = nextRun;
    return this;
  }

  /**
   * Set last run time (for testing purposes)
   */
  withLastRun(lastRun: Date): ScheduleBuilder {
    this.schedule.lastRun = lastRun;
    return this;
  }

  /**
   * Set run count (for testing purposes)
   */
  withRunCount(runCount: number): ScheduleBuilder {
    this.schedule.runCount = runCount;
    return this;
  }

  /**
   * Build the schedule
   */
  build(): Schedule {
    const requiredFields = ['name', 'taskTemplate'];
    for (const field of requiredFields) {
      if (!this.schedule[field as keyof Schedule]) {
        throw new Error(`Schedule missing required field: ${field}`);
      }
    }

    if (!this.schedule.cronExpression && !this.schedule.interval) {
      throw new Error('Schedule must have either cronExpression or interval');
    }

    return {
      id: this.schedule.id || generateScheduleId(),
      name: this.schedule.name!,
      cronExpression: this.schedule.cronExpression,
      interval: this.schedule.interval,
      taskTemplate: this.schedule.taskTemplate!,
      enabled: this.schedule.enabled !== undefined ? this.schedule.enabled : true,
      nextRun: this.schedule.nextRun,
      lastRun: this.schedule.lastRun,
      runCount: this.schedule.runCount || 0,
      maxRuns: this.schedule.maxRuns,
      timezone: this.schedule.timezone
    };
  }

  /**
   * Create a copy of the builder
   */
  copy(): ScheduleBuilder {
    const builder = new ScheduleBuilder();
    builder.schedule = JSON.parse(JSON.stringify(this.schedule));
    return builder;
  }
}

/**
 * Generate unique schedule ID
 */
function generateScheduleId(): string {
  return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Predefined schedule helpers
 */
export class ScheduleHelpers {
  /**
   * Create a daily schedule at specific time
   */
  static daily(time: string = '00:00'): ScheduleBuilder {
    const [hours, minutes] = time.split(':').map(Number);
    return new ScheduleBuilder('Daily Task')
      .withCronExpression(`${minutes} ${hours} * * *`);
  }

  /**
   * Create an hourly schedule
   */
  static hourly(minute: number = 0): ScheduleBuilder {
    return new ScheduleBuilder('Hourly Task')
      .withCronExpression(`${minute} * * * *`);
  }

  /**
   * Create a weekly schedule on specific day and time
   */
  static weekly(day: number, time: string = '00:00'): ScheduleBuilder {
    const [hours, minutes] = time.split(':').map(Number);
    return new ScheduleBuilder('Weekly Task')
      .withCronExpression(`${minutes} ${hours} * * ${day}`);
  }

  /**
   * Create an interval-based schedule
   */
  static everyMinutes(minutes: number): ScheduleBuilder {
    return new ScheduleBuilder('Recurring Task')
      .withInterval(minutes * 60 * 1000);
  }

  /**
   * Create an interval-based schedule in seconds
   */
  static everySeconds(seconds: number): ScheduleBuilder {
    return new ScheduleBuilder('Recurring Task')
      .withInterval(seconds * 1000);
  }

  /**
   * Create a monthly schedule on specific day and time
   */
  static monthly(day: number, time: string = '00:00'): ScheduleBuilder {
    const [hours, minutes] = time.split(':').map(Number);
    return new ScheduleBuilder('Monthly Task')
      .withCronExpression(`${minutes} ${hours} ${day} * *`);
  }

  /**
   * Create a business hours schedule (weekdays, 9-5)
   */
  static businessHours(intervalMinutes: number = 60): ScheduleBuilder {
    return new ScheduleBuilder('Business Hours Task')
      .withCronExpression(`*/${intervalMinutes} 9-17 * * 1-5`);
  }

  /**
   * Create a weekend schedule
   */
  static weekends(time: string = '00:00'): ScheduleBuilder {
    const [hours, minutes] = time.split(':').map(Number);
    return new ScheduleBuilder('Weekend Task')
      .withCronExpression(`${minutes} ${hours} * * 0,6`);
  }
}