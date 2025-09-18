/**
 * Builder utility for creating tasks with fluent API
 */

import { Task, TaskStatus } from '../types';

export class TaskBuilder {
  private task: Partial<Task> = {};

  constructor(name?: string) {
    if (name) {
      this.withName(name);
    }
  }

  /**
   * Set task name
   */
  withName(name: string): TaskBuilder {
    this.task.name = name;
    return this;
  }

  /**
   * Set task type
   */
  withType(type: 'workflow' | 'operation' | 'schedule'): TaskBuilder {
    this.task.type = type;
    return this;
  }

  /**
   * Set task category
   */
  withCategory(category: 'browser' | 'file' | 'ai' | 'communication'): TaskBuilder {
    this.task.category = category;
    return this;
  }

  /**
   * Set operation to execute
   */
  withOperation(operation: string): TaskBuilder {
    this.task.operation = operation;
    return this;
  }

  /**
   * Set task parameters
   */
  withParameters(parameters: Record<string, any>): TaskBuilder {
    this.task.parameters = parameters;
    return this;
  }

  /**
   * Add a parameter
   */
  withParameter(key: string, value: any): TaskBuilder {
    if (!this.task.parameters) {
      this.task.parameters = {};
    }
    this.task.parameters[key] = value;
    return this;
  }

  /**
   * Set task priority
   */
  withPriority(priority: 'low' | 'medium' | 'high' | 'critical'): TaskBuilder {
    this.task.priority = priority;
    return this;
  }

  /**
   * Set scheduled time
   */
  withScheduledTime(time: Date): TaskBuilder {
    this.task.scheduledTime = time;
    return this;
  }

  /**
   * Set retry configuration
   */
  withRetries(maxRetries: number, retryCount?: number): TaskBuilder {
    this.task.maxRetries = maxRetries;
    if (retryCount !== undefined) {
      this.task.retryCount = retryCount;
    }
    return this;
  }

  /**
   * Set timeout
   */
  withTimeout(timeout: number): TaskBuilder {
    this.task.timeout = timeout;
    return this;
  }

  /**
   * Add metadata
   */
  withMetadata(key: string, value: any): TaskBuilder {
    if (!this.task.metadata) {
      this.task.metadata = {};
    }
    this.task.metadata[key] = value;
    return this;
  }

  /**
   * Set all metadata
   */
  withAllMetadata(metadata: Record<string, any>): TaskBuilder {
    this.task.metadata = metadata;
    return this;
  }

  /**
   * Add dependency
   */
  withDependency(taskId: string): TaskBuilder {
    if (!this.task.dependencies) {
      this.task.dependencies = [];
    }
    this.task.dependencies.push(taskId);
    return this;
  }

  /**
   * Add tag
   */
  withTag(tag: string): TaskBuilder {
    if (!this.task.tags) {
      this.task.tags = [];
    }
    this.task.tags.push(tag);
    return this;
  }

  /**
   * Build the task
   */
  build(): Task {
    const now = new Date();

    const requiredFields = ['name', 'operation'];
    for (const field of requiredFields) {
      if (!this.task[field as keyof Task]) {
        throw new Error(`Task missing required field: ${field}`);
      }
    }

    return {
      id: this.task.id || generateTaskId(),
      name: this.task.name!,
      type: this.task.type || 'operation',
      category: this.task.category || 'browser',
      operation: this.task.operation!,
      parameters: this.task.parameters || {},
      priority: this.task.priority || 'medium',
      scheduledTime: this.task.scheduledTime,
      retryCount: this.task.retryCount || 0,
      maxRetries: this.task.maxRetries || 3,
      timeout: this.task.timeout || 300000,
      metadata: this.task.metadata,
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      dependencies: this.task.dependencies,
      tags: this.task.tags
    };
  }

  /**
   * Create a copy of the builder
   */
  copy(): TaskBuilder {
    const builder = new TaskBuilder();
    builder.task = JSON.parse(JSON.stringify(this.task));
    return builder;
  }
}

/**
 * Generate unique task ID
 */
function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}