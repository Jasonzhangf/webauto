/**
 * Core types and interfaces for the WebAuto Operations Framework
 */

export interface DaemonConfig {
  name: string;
  version: string;
  port?: number;
  host?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxWorkers: number;
  taskTimeout: number;
  healthCheckInterval: number;
  storagePath: string;
  enableMetrics: boolean;
  enableWebSocket: boolean;
}

export interface Task {
  id: string;
  name: string;
  type: 'workflow' | 'operation' | 'schedule';
  category: 'browser' | 'file' | 'ai' | 'communication';
  operation: string;
  parameters: Record<string, any>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  scheduledTime?: Date;
  retryCount: number;
  maxRetries: number;
  timeout: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  status: TaskStatus;
  dependencies?: string[];
  tags?: string[];
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: {
    message: string;
    code: string;
    stack?: string;
    details?: any;
  };
  duration: number;
  metrics?: {
    memoryUsed: number;
    cpuUsed: number;
    networkRequests: number;
  };
  timestamp: Date;
  logs: LogEntry[];
}

export interface Worker {
  id: string;
  pid: number;
  status: WorkerStatus;
  currentTask?: Task;
  startTime: Date;
  lastHeartbeat: Date;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface Schedule {
  id: string;
  name: string;
  cronExpression?: string;
  interval?: number;
  taskTemplate: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>;
  enabled: boolean;
  nextRun?: Date;
  lastRun?: Date;
  runCount: number;
  maxRuns?: number;
  timezone?: string;
}

export interface ResourceMetrics {
  timestamp: Date;
  memory: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  cpu: {
    usage: number;
    cores: number;
    loadAverage: number[];
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percentage: number;
  };
  network: {
    bytesReceived: number;
    bytesSent: number;
    packetsReceived: number;
    packetsSent: number;
  };
  workers: {
    active: number;
    idle: number;
    total: number;
  };
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source: string;
  taskId?: string;
  workerId?: string;
  metadata?: Record<string, any>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  components: {
    scheduler: boolean;
    workers: boolean;
    storage: boolean;
    communication: boolean;
    metrics: boolean;
  };
  issues: HealthIssue[];
  metrics: ResourceMetrics;
}

export interface HealthIssue {
  severity: 'low' | 'medium' | 'high' | 'critical';
  component: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  details?: any;
}

export interface WebSocketMessage {
  type: 'task_update' | 'worker_update' | 'metrics_update' | 'log' | 'error' | 'health_check' |
         'subscription_confirmed' | 'subscription_removed' | 'connection_established' | 'pong' |
         'status_response' | 'status:update';
  payload: any;
  timestamp: Date;
}

export interface OperationDefinition {
  name: string;
  category: string;
  description: string;
  version: string;
  parameters: {
    [key: string]: {
      type: string;
      required: boolean;
      description: string;
      default?: any;
    };
  };
  returnType: string;
  timeout: number;
  retryable: boolean;
  maxRetries: number;
  dependencies?: string[];
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  timeout?: number;
  retryable: boolean;
  maxRetries: number;
  variables?: Record<string, any>;
}

export interface WorkflowStep {
  id: string;
  name: string;
  operation: string;
  category: string;
  parameters: Record<string, any>;
  timeout?: number;
  retryable: boolean;
  maxRetries: number;
  condition?: string;
  onFailure?: 'continue' | 'stop' | 'retry';
  outputMappings?: Record<string, string>;
}

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'retrying';
export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'restarting' | 'terminating';

export interface DaemonEvent {
  type: 'task_created' | 'task_started' | 'task_completed' | 'task_failed' | 'task_cancelled' |
         'worker_started' | 'worker_stopped' | 'worker_crashed' | 'schedule_triggered' |
         'health_check' | 'config_updated' | 'shutdown_requested';
  timestamp: Date;
  data: any;
}

export interface StorageBackend {
  type: 'file' | 'memory' | 'redis' | 'database';
  config: Record<string, any>;
}

export interface ConfigUpdate {
  path: string;
  value: any;
  timestamp: Date;
  source: 'file' | 'api' | 'cli';
}