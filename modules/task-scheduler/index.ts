/**
 * Task Scheduler Module
 * 
 * Handles:
 * - Task queuing with priority
 * - Conflict detection (same profile)
 * - Task lifecycle management
 * - Max runs tracking
 */

import { EventEmitter } from 'events';

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledTask {
  id: string;
  name: string;
  profile: string;
  platform: 'xiaohongshu' | 'weibo' | '1688';
  taskType: 'search' | 'timeline' | 'user-monitor';
  config: Record<string, any>;
  schedule: {
    type: 'interval' | 'daily' | 'once';
    intervalMinutes?: number;
    dailyTime?: string; // HH:MM
  };
  maxRuns: number | null;
  currentRuns: number;
  priority: number;
  status: TaskStatus;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  pid: number | null;
}

export interface TaskRunResult {
  taskId: string;
  runId: string;
  success: boolean;
  error?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map();
  private runningProfiles: Map<string, string> = new Map(); // profile -> taskId
  private queue: string[] = [];
  private maxRunTimeMs: number;
  
  constructor(options: { maxRunTimeMs?: number } = {}) {
    super();
    this.maxRunTimeMs = options.maxRunTimeMs || 30 * 60 * 1000; // 30 min default
  }

  /**
   * Add a new scheduled task
   */
  addTask(task: Omit<ScheduledTask, 'currentRuns' | 'status' | 'lastRunAt' | 'nextRunAt' | 'pid'>): string {
    const fullTask: ScheduledTask = {
      ...task,
      currentRuns: 0,
      status: 'pending',
      lastRunAt: null,
      nextRunAt: null,
      pid: null
    };
    
    this.tasks.set(task.id, fullTask);
    this.emit('task:added', { task: fullTask });
    
    return task.id;
  }

  /**
   * Check if a profile is available (not running another task)
   */
  isProfileAvailable(profile: string): boolean {
    return !this.runningProfiles.has(profile);
  }

  /**
   * Get running task for a profile
   */
  getRunningTaskForProfile(profile: string): ScheduledTask | null {
    const taskId = this.runningProfiles.get(profile);
    return taskId ? this.tasks.get(taskId) || null : null;
  }

  /**
   * Queue a task for execution
   * Returns false if conflict detected
   */
  queueTask(taskId: string): { queued: boolean; reason?: string; conflictingTask?: ScheduledTask } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { queued: false, reason: 'Task not found' };
    }

    // Check max runs
    if (task.maxRuns !== null && task.currentRuns >= task.maxRuns) {
      return { queued: false, reason: 'Max runs reached' };
    }

    // Check for profile conflict
    const runningTask = this.getRunningTaskForProfile(task.profile);
    if (runningTask) {
      // Already running - add to queue
      task.status = 'queued';
      this.queue.push(taskId);
      this.queue.sort((a, b) => {
        const taskA = this.tasks.get(a)!;
        const taskB = this.tasks.get(b)!;
        return taskB.priority - taskA.priority;
      });
      
      return { 
        queued: true, 
        reason: `Profile ${task.profile} busy with task ${runningTask.id}`,
        conflictingTask: runningTask
      };
    }

    // Profile available - add to queue
    task.status = 'queued';
    this.queue.push(taskId);
    this.emit('task:queued', { task });
    
    return { queued: true };
  }

  /**
   * Start next task in queue
   */
  async startNext(): Promise<ScheduledTask | null> {
    // Find next task that can run
    while (this.queue.length > 0) {
      const taskId = this.queue.shift()!;
      const task = this.tasks.get(taskId);
      
      if (!task) continue;
      if (task.status !== 'queued') continue;
      
      // Check profile availability
      if (!this.isProfileAvailable(task.profile)) {
        // Put back at front of queue
        this.queue.unshift(taskId);
        return null;
      }

      // Start task
      task.status = 'running';
      task.lastRunAt = new Date().toISOString();
      task.currentRuns++;
      this.runningProfiles.set(task.profile, taskId);
      
      this.emit('task:started', { task });
      
      return task;
    }
    
    return null;
  }

  /**
   * Mark task as completed
   */
  completeTask(taskId: string, result: TaskRunResult): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = result.success ? 'completed' : 'failed';
    task.pid = null;
    
    // Release profile
    this.runningProfiles.delete(task.profile);
    
    this.emit('task:completed', { task, result });
    
    // Check if task should continue
    if (task.maxRuns !== null && task.currentRuns >= task.maxRuns) {
      this.emit('task:max-runs-reached', { task });
    }
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Remove from queue if pending
    const queueIndex = this.queue.indexOf(taskId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }

    // If running, mark for termination
    if (task.status === 'running') {
      task.status = 'cancelled';
      if (task.pid) {
        process.kill(task.pid, 'SIGTERM');
      }
      this.runningProfiles.delete(task.profile);
    }

    this.emit('task:cancelled', { task });
    return true;
  }

  /**
   * Get all tasks
   */
  getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: TaskStatus): ScheduledTask[] {
    return this.getTasks().filter(t => t.status === status);
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Simulate task overlap scenario
   */
  simulateOverlap(): {
    scenario: string;
    queue: string[];
    running: Array<{ profile: string; taskId: string }>;
    conflicts: string[];
  } {
    const running = Array.from(this.runningProfiles.entries()).map(([profile, taskId]) => ({
      profile,
      taskId
    }));
    
    const conflicts: string[] = [];
    const profileMap = new Map<string, string[]>();
    
    for (const task of this.tasks.values()) {
      if (task.status === 'queued' || task.status === 'running') {
        const existing = profileMap.get(task.profile) || [];
        existing.push(task.id);
        profileMap.set(task.profile, existing);
        
        if (existing.length > 1) {
          conflicts.push(...existing);
        }
      }
    }
    
    return {
      scenario: 'Task overlap simulation',
      queue: [...this.queue],
      running,
      conflicts
    };
  }
}

export default TaskScheduler;
