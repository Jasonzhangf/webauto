/**
 * Pipeline Tracker - Request ID and Pipeline Tracking System
 * 流水线跟踪器 - 请求ID和流水线跟踪系统
 */

import { PipelineBaseModule } from '../modules/PipelineBaseModule';
import { PipelineRequestContext, IRequestContext } from '../interfaces/IRequestContext';
import { IPipelineStage, IPipelineStageFactory, IPipelineStageManager } from '../interfaces/IPipelineStage';
import { PipelineIOEntry } from '../interfaces/IRequestContext';

/**
 * Request Context Implementation
 * 请求上下文实现
 */
class RequestContextImpl implements IRequestContext {
  private data: PipelineRequestContext;

  constructor(data: PipelineRequestContext) {
    this.data = { ...data };
  }

  getRequestId(): string {
    return this.data.requestId;
  }

  getPipelineId(): string {
    return this.data.pipelineId;
  }

  getSessionId(): string | undefined {
    return this.data.sessionId;
  }

  getStartTime(): number {
    return this.data.startTime;
  }

  getEndTime(): number | undefined {
    return this.data.endTime;
  }

  getDuration(): number | undefined {
    if (this.data.endTime) {
      return this.data.endTime - this.data.startTime;
    }
    return undefined;
  }

  getProvider(): string {
    return this.data.provider;
  }

  getModel(): string | undefined {
    return this.data.model;
  }

  getOperation(): string {
    return this.data.operation;
  }

  getStages(): any[] {
    return [...this.data.stages];
  }

  getMetadata(): Record<string, any> | undefined {
    return this.data.metadata ? { ...this.data.metadata } : undefined;
  }

  getStage(stageName: string): any | undefined {
    return this.data.stages.find(s => s.stage === stageName);
  }

  getStageStatus(stageName: string): any | undefined {
    const stage = this.getStage(stageName);
    return stage?.status;
  }

  addStage(stage: any): void {
    this.data.stages.push({ ...stage });
  }

  updateStage(stageName: string, updates: Partial<any>): void {
    const stage = this.getStage(stageName);
    if (stage) {
      Object.assign(stage, updates);
    }
  }

  isCompleted(): boolean {
    return this.data.endTime !== undefined;
  }

  isFailed(): boolean {
    return this.data.stages.some(s => s.status === 'failed');
  }

  getFailedStages(): any[] {
    return this.data.stages.filter(s => s.status === 'failed');
  }

  getCompletedStages(): any[] {
    return this.data.stages.filter(s => s.status === 'completed');
  }

  getRunningStages(): any[] {
    return this.data.stages.filter(s => s.status === 'running');
  }

  getStageDuration(stageName: string): number | undefined {
    const stage = this.getStage(stageName);
    if (stage && stage.endTime) {
      return stage.endTime - stage.startTime;
    }
    return undefined;
  }

  getTotalStageDuration(): number {
    return this.data.stages
      .filter(s => s.endTime)
      .reduce((total, stage) => total + (stage.endTime! - stage.startTime), 0);
  }

  getSummary() {
    const completedStages = this.getCompletedStages();
    const failedStages = this.getFailedStages();

    let status: 'pending' | 'running' | 'completed' | 'failed' = 'pending';
    if (this.isCompleted()) {
      status = failedStages.length > 0 ? 'failed' : 'completed';
    } else if (this.data.stages.length > 0) {
      status = 'running';
    }

    return {
      requestId: this.data.requestId,
      pipelineId: this.data.pipelineId,
      provider: this.data.provider,
      operation: this.data.operation,
      duration: this.getDuration(),
      totalStages: this.data.stages.length,
      completedStages: completedStages.length,
      failedStages: failedStages.length,
      status
    };
  }

  toObject(): PipelineRequestContext {
    return { ...this.data };
  }

  clone(): IRequestContext {
    return new RequestContextImpl(this.toObject());
  }

  setSessionId(sessionId: string): void {
    this.data.sessionId = sessionId;
  }

  setEndTime(endTime: number): void {
    this.data.endTime = endTime;
  }

  setModel(model: string): void {
    this.data.model = model;
  }

  setMetadata(metadata: Record<string, any>): void {
    this.data.metadata = { ...metadata };
  }
}

/**
 * Pipeline Stage Implementation
 * 流水线阶段实现
 */
class PipelineStageImpl implements IPipelineStage {
  private data: any;

  constructor(data: any) {
    this.data = { ...data };
  }

  getStageName(): string {
    return this.data.stage;
  }

  getStartTime(): number {
    return this.data.startTime;
  }

  getEndTime(): number | undefined {
    return this.data.endTime;
  }

  getDuration(): number | undefined {
    if (this.data.endTime) {
      return this.data.endTime - this.data.startTime;
    }
    return undefined;
  }

  getStatus(): any {
    return this.data.status;
  }

  getError(): string | undefined {
    return this.data.error;
  }

  getData(): any {
    return this.data.data;
  }

  setStartTime(startTime: number): void {
    this.data.startTime = startTime;
  }

  setEndTime(endTime: number): void {
    this.data.endTime = endTime;
  }

  setStatus(status: any): void {
    this.data.status = status;
  }

  setError(error: string): void {
    this.data.error = error;
  }

  setData(data: any): void {
    this.data.data = data;
  }

  markAsStarted(): void {
    this.data.startTime = Date.now();
    this.data.status = 'running';
  }

  markAsCompleted(data?: any): void {
    this.data.endTime = Date.now();
    this.data.status = 'completed';
    if (data !== undefined) {
      this.data.data = data;
    }
  }

  markAsFailed(error: string): void {
    this.data.endTime = Date.now();
    this.data.status = 'failed';
    this.data.error = error;
  }

  isCompleted(): boolean {
    return this.data.status === 'completed';
  }

  isFailed(): boolean {
    return this.data.status === 'failed';
  }

  isRunning(): boolean {
    return this.data.status === 'running';
  }

  toObject(): any {
    return { ...this.data };
  }

  clone(): IPipelineStage {
    return new PipelineStageImpl(this.toObject());
  }
}

/**
 * Pipeline Stage Factory Implementation
 * 流水线阶段工厂实现
 */
class PipelineStageFactoryImpl implements IPipelineStageFactory {
  createStage(stageName: string): IPipelineStage {
    return new PipelineStageImpl({
      stage: stageName,
      startTime: Date.now(),
      status: 'pending'
    });
  }

  createStageWithData(stageName: string, data: any): IPipelineStage {
    return new PipelineStageImpl({
      stage: stageName,
      startTime: Date.now(),
      status: 'pending',
      data
    });
  }

  createStageFromObject(stageObject: any): IPipelineStage {
    return new PipelineStageImpl(stageObject);
  }
}

/**
 * Pipeline Stage Manager Implementation
 * 流水线阶段管理器实现
 */
class PipelineStageManagerImpl implements IPipelineStageManager {
  private stages: Map<string, IPipelineStage> = new Map();
  private stageFactory: IPipelineStageFactory;

  constructor(stageFactory: IPipelineStageFactory) {
    this.stageFactory = stageFactory;
  }

  addStage(stage: IPipelineStage): void {
    this.stages.set(stage.getStageName(), stage);
  }

  getStage(stageName: string): IPipelineStage | undefined {
    return this.stages.get(stageName);
  }

  removeStage(stageName: string): boolean {
    return this.stages.delete(stageName);
  }

  updateStage(stageName: string, updates: Partial<IPipelineStage>): boolean {
    const stage = this.getStage(stageName);
    if (stage) {
      if (updates.getStageName && updates.getStageName() !== undefined) {
        const newStageName = updates.getStageName();
        this.stages.delete(stageName);
        this.stages.set(newStageName, stage);
      }
      return true;
    }
    return false;
  }

  getAllStages(): IPipelineStage[] {
    return Array.from(this.stages.values());
  }

  getStagesByStatus(status: any): IPipelineStage[] {
    return this.getAllStages().filter(stage => stage.getStatus() === status);
  }

  getCompletedStages(): IPipelineStage[] {
    return this.getStagesByStatus('completed');
  }

  getFailedStages(): IPipelineStage[] {
    return this.getStagesByStatus('failed');
  }

  getRunningStages(): IPipelineStage[] {
    return this.getStagesByStatus('running');
  }

  clearAllStages(): void {
    this.stages.clear();
  }

  getStageStatistics() {
    const stages = this.getAllStages();
    return {
      total: stages.length,
      completed: stages.filter(s => s.isCompleted()).length,
      failed: stages.filter(s => s.isFailed()).length,
      running: stages.filter(s => s.isRunning()).length,
      pending: stages.filter(s => s.getStatus() === 'pending').length
    };
  }
}

/**
 * Pipeline Tracker Main Class
 * 流水线跟踪器主类
 */
export class PipelineTracker extends PipelineBaseModule {
  private activeRequests: Map<string, IRequestContext> = new Map();
  private stageFactory: IPipelineStageFactory;
  private stageManager: IPipelineStageManager;

  constructor() {
    const config = {
      id: 'pipeline-tracker',
      name: 'Pipeline Tracker',
      version: '1.0.0',
      description: 'Pipeline request tracking and stage management system',
      type: 'tracker' as const,
      enableTwoPhaseDebug: true,
      enableIOTracking: true,
      debugBaseDirectory: '~/.rcc/debug-logs'
    };

    super(config);

    this.stageFactory = new PipelineStageFactoryImpl();
    this.stageManager = new PipelineStageManagerImpl(this.stageFactory);

    this.logInfo('Pipeline tracker initialized', {}, 'constructor');
  }

  /**
   * Create new request context with I/O tracking
   * 创建新的请求上下文并启用I/O跟踪
   */
  createRequestContext(
    provider: string,
    operation: 'chat' | 'streamChat' | 'healthCheck',
    metadata?: Record<string, any>
  ): IRequestContext {
    const contextData: PipelineRequestContext = {
      requestId: this.generateRequestId(),
      pipelineId: this.generatePipelineId(),
      startTime: Date.now(),
      provider,
      operation,
      stages: [],
      metadata
    };

    const context = new RequestContextImpl(contextData);
    this.activeRequests.set(context.getRequestId(), context);

    // Start I/O tracking if enabled
    if (this.twoPhaseDebugSystem) {
      const ioEntry: PipelineIOEntry = {
        timestamp: Date.now(),
        pipelineId: contextData.pipelineId,
        moduleId: this.info.id,
        operationId: contextData.requestId,
        operationType: 'pipeline_start',
        input: { provider, operation, metadata },
        success: true,
        method: 'createRequestContext'
      };

      // Use appropriate method based on operation type
      if (ioEntry.operationType === 'pipeline_start') {
        this.twoPhaseDebugSystem.recordPipelineStart(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.input,
          ioEntry.context
        );
      } else if (ioEntry.operationType === 'pipeline_end') {
        this.twoPhaseDebugSystem.recordPipelineEnd(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.output,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      } else {
        this.twoPhaseDebugSystem.recordPipelineOperation(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.moduleId,
          ioEntry.operationId,
          ioEntry.input,
          ioEntry.output,
          ioEntry.method,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      }
      contextData.ioEntry = ioEntry;
    }

    this.logInfo('Request context created', {
      requestId: contextData.requestId,
      provider,
      operation
    }, 'createRequestContext');

    return context;
  }

  /**
   * Get request context by ID
   * 根据ID获取请求上下文
   */
  getRequestContext(requestId: string): IRequestContext | undefined {
    return this.activeRequests.get(requestId);
  }

  /**
   * Add pipeline stage with I/O tracking
   * 添加流水线阶段并记录I/O
   */
  addStage(requestId: string, stageName: string): void {
    const context = this.activeRequests.get(requestId);
    if (context) {
      const stage = this.stageFactory.createStage(stageName);
      stage.markAsStarted();
      context.addStage(stage.toObject());
      this.stageManager.addStage(stage);

      // Record stage operation in I/O tracking
      if (this.twoPhaseDebugSystem) {
        const ioEntry: PipelineIOEntry = {
          timestamp: Date.now(),
          pipelineId: context.getPipelineId(),
          moduleId: this.info.id,
          operationId: `${requestId}-${stageName}`,
          operationType: 'module_operation',
          input: { stageName, action: 'start' },
          success: true,
          method: 'addStage'
        };

        // Use appropriate method based on operation type
      if (ioEntry.operationType === 'pipeline_start') {
        this.twoPhaseDebugSystem.recordPipelineStart(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.input,
          ioEntry.context
        );
      } else if (ioEntry.operationType === 'pipeline_end') {
        this.twoPhaseDebugSystem.recordPipelineEnd(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.output,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      } else {
        this.twoPhaseDebugSystem.recordPipelineOperation(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.moduleId,
          ioEntry.operationId,
          ioEntry.input,
          ioEntry.output,
          ioEntry.method,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      }
      }

      this.logInfo('Pipeline stage added', {
        requestId,
        stageName,
        status: 'started'
      }, 'addStage');
    }
  }

  /**
   * Complete pipeline stage with I/O tracking
   * 完成流水线阶段并记录I/O
   */
  completeStage(requestId: string, stageName: string, data?: any): void {
    const context = this.activeRequests.get(requestId);
    if (context) {
      const stage = this.stageManager.getStage(stageName);
      if (stage) {
        stage.markAsCompleted(data);
        context.updateStage(stageName, stage.toObject());

        // Record stage completion in I/O tracking
        if (this.twoPhaseDebugSystem) {
          const ioEntry: PipelineIOEntry = {
            timestamp: Date.now(),
            pipelineId: context.getPipelineId(),
            moduleId: this.info.id,
            operationId: `${requestId}-${stageName}`,
            operationType: 'module_operation',
            input: { stageName, action: 'complete' },
            output: { data },
            success: true,
            method: 'completeStage'
          };

          // Use appropriate method based on operation type
      if (ioEntry.operationType === 'pipeline_start') {
        this.twoPhaseDebugSystem.recordPipelineStart(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.input,
          ioEntry.context
        );
      } else if (ioEntry.operationType === 'pipeline_end') {
        this.twoPhaseDebugSystem.recordPipelineEnd(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.output,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      } else {
        this.twoPhaseDebugSystem.recordPipelineOperation(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.moduleId,
          ioEntry.operationId,
          ioEntry.input,
          ioEntry.output,
          ioEntry.method,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      }
        }

        this.logInfo('Pipeline stage completed', {
          requestId,
          stageName,
          duration: stage.getDuration()
        }, 'completeStage');
      }
    }
  }

  /**
   * Mark stage as failed with I/O tracking
   * 标记阶段为失败并记录I/O
   */
  failStage(requestId: string, stageName: string, error: string): void {
    const context = this.activeRequests.get(requestId);
    if (context) {
      const stage = this.stageManager.getStage(stageName);
      if (stage) {
        stage.markAsFailed(error);
        context.updateStage(stageName, stage.toObject());

        // Record stage failure in I/O tracking
        if (this.twoPhaseDebugSystem) {
          const ioEntry: PipelineIOEntry = {
            timestamp: Date.now(),
            pipelineId: context.getPipelineId(),
            moduleId: this.info.id,
            operationId: `${requestId}-${stageName}`,
            operationType: 'module_operation',
            input: { stageName, action: 'fail' },
            success: false,
            error,
            method: 'failStage'
          };

          // Use appropriate method based on operation type
      if (ioEntry.operationType === 'pipeline_start') {
        this.twoPhaseDebugSystem.recordPipelineStart(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.input,
          ioEntry.context
        );
      } else if (ioEntry.operationType === 'pipeline_end') {
        this.twoPhaseDebugSystem.recordPipelineEnd(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.output,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      } else {
        this.twoPhaseDebugSystem.recordPipelineOperation(
          ioEntry.pipelineId,
          ioEntry.pipelineName || ioEntry.pipelineId,
          ioEntry.moduleId,
          ioEntry.operationId,
          ioEntry.input,
          ioEntry.output,
          ioEntry.method,
          ioEntry.success,
          ioEntry.error,
          ioEntry.context
        );
      }
        }

        this.twoPhaseDebugSystem?.error('Pipeline stage failed', {
          requestId,
          stageName,
          error
        }, 'failStage');
      }
    }
  }

  /**
   * Complete request context with I/O tracking
   * 完成请求上下文并记录I/O
   */
  completeRequest(requestId: string): IRequestContext | undefined {
    const context = this.activeRequests.get(requestId);
    if (context) {
      context.setEndTime(Date.now());

      // Record pipeline completion in I/O tracking
      if (this.twoPhaseDebugSystem && context.toObject().ioEntry) {
        const completionEntry: PipelineIOEntry = {
          timestamp: Date.now(),
          pipelineId: context.getPipelineId(),
          moduleId: this.info.id,
          operationId: requestId,
          operationType: 'pipeline_end',
          input: { action: 'complete' },
          output: { duration: context.getDuration(), stages: context.getStages() },
          success: !context.isFailed(),
          method: 'completeRequest'
        };

        this.twoPhaseDebugSystem.recordPipelineEnd(
          completionEntry.pipelineId,
          completionEntry.pipelineName || completionEntry.pipelineId,
          completionEntry.output,
          completionEntry.success,
          completionEntry.error,
          completionEntry.context
        );
      }

      this.activeRequests.delete(requestId);

      this.logInfo('Request context completed', {
        requestId,
        duration: context.getDuration(),
        success: !context.isFailed()
      }, 'completeRequest');

      return context;
    }
    return undefined;
  }

  /**
   * Get all active requests
   * 获取所有活动请求
   */
  getActiveRequests(): IRequestContext[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Get request statistics
   * 获取请求统计
   */
  getRequestStatistics() {
    const activeRequests = this.getActiveRequests();
    return {
      activeRequests: activeRequests.length,
      totalStages: activeRequests.reduce((total, req) => total + req.getStages().length, 0),
      completedStages: activeRequests.reduce((total, req) => total + req.getCompletedStages().length, 0),
      failedStages: activeRequests.reduce((total, req) => total + req.getFailedStages().length, 0),
      runningStages: activeRequests.reduce((total, req) => total + req.getRunningStages().length, 0)
    };
  }

  /**
   * Clear all active requests
   * 清除所有活动请求
   */
  clearAllRequests(): void {
    this.activeRequests.clear();
    this.stageManager.clearAllStages();
    this.logInfo('All requests cleared', {}, 'clearAllRequests');
  }

  /**
   * Generate unique request ID
   * 生成唯一请求ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique pipeline ID
   * 生成唯一流水线ID
   */
  private generatePipelineId(): string {
    return `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get stage factory
   * 获取阶段工厂
   */
  getStageFactory(): IPipelineStageFactory {
    return this.stageFactory;
  }

  /**
   * Get stage manager
   * 获取阶段管理器
   */
  getStageManager(): IPipelineStageManager {
    return this.stageManager;
  }
}