/**
 * Pipeline Request Context Interface
 * 流水线请求上下文接口
 */

/**
 * Pipeline I/O Entry for tracking pipeline operations
 * 流水线I/O条目用于跟踪流水线操作
 */
export interface PipelineIOEntry {
  timestamp: number;
  pipelineId: string;
  pipelineName?: string;
  moduleId: string;
  operationId: string;
  operationType: 'pipeline_start' | 'pipeline_end' | 'module_operation' | 'data_transfer';
  input?: any;
  output?: any;
  duration?: number;
  success: boolean;
  error?: string;
  method?: string;
  context?: {
    phase?: string;
    stage?: number;
    previousOperation?: string;
    nextOperation?: string;
  };
}

/**
 * Pipeline Stage Status
 * 流水线阶段状态
 */
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Pipeline Stage Information
 * 流水线阶段信息
 */
export interface PipelineStage {
  stage: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: PipelineStageStatus;
  error?: string;
  data?: any;
}

/**
 * Pipeline Request Context
 * 流水线请求上下文
 */
export interface PipelineRequestContext {
  // Unique identifiers
  requestId: string;
  pipelineId: string;
  sessionId?: string;

  // Timestamps
  startTime: number;
  endTime?: number;

  // Request information
  provider: string;
  model?: string;
  operation: 'chat' | 'streamChat' | 'healthCheck';

  // Pipeline stages
  stages: PipelineStage[];

  // Metadata
  metadata?: Record<string, any>;

  // I/O tracking entry
  ioEntry?: PipelineIOEntry;
}

/**
 * Request Context Interface
 * 请求上下文接口
 */
export interface IRequestContext {
  // Basic getters
  getRequestId(): string;
  getPipelineId(): string;
  getSessionId(): string | undefined;
  getStartTime(): number;
  getEndTime(): number | undefined;
  getDuration(): number | undefined;
  getProvider(): string;
  getModel(): string | undefined;
  getOperation(): string;
  getStages(): PipelineStage[];
  getMetadata(): Record<string, any> | undefined;

  // Stage management
  getStage(stageName: string): PipelineStage | undefined;
  getStageStatus(stageName: string): PipelineStageStatus | undefined;
  addStage(stage: PipelineStage): void;
  updateStage(stageName: string, updates: Partial<PipelineStage>): void;

  // Status checks
  isCompleted(): boolean;
  isFailed(): boolean;
  getFailedStages(): PipelineStage[];
  getCompletedStages(): PipelineStage[];
  getRunningStages(): PipelineStage[];

  // Performance metrics
  getStageDuration(stageName: string): number | undefined;
  getTotalStageDuration(): number;

  // Summary
  getSummary(): {
    requestId: string;
    pipelineId: string;
    provider: string;
    operation: string;
    duration: number | undefined;
    totalStages: number;
    completedStages: number;
    failedStages: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
  };

  // Data export
  toObject(): PipelineRequestContext;
  clone(): IRequestContext;

  // Setters
  setSessionId(sessionId: string): void;
  setEndTime(endTime: number): void;
  setModel(model: string): void;
  setMetadata(metadata: Record<string, any>): void;
}