// 执行流引擎 - 支持JSON配置的流程执行
import { BaseModule } from '../utils/rcc-basemodule';
import { SystemStateCenter } from '../core/system-state-center';
import { 
  FlowConfig, 
  FlowStep, 
  FlowResult, 
  FlowBranch,
  ConditionConfig,
  LoopConfig,
  IFlowState,
  IExecutionContext,
  IOperation,
  OperationCategory,
  OperationResult,
  OperationStatus,
  OperationError,
  UserProfile,
  Post
} from '../interfaces/core';
import { BaseContainer } from '../containers/base-container';

export class FlowExecutor extends BaseModule {
  private stateCenter: SystemStateCenter;
  private containerRegistry: Map<string, BaseContainer> = new Map();
  
  // Add public properties for BaseModule compatibility
  public id: string;
  public name: string;
  public version: string;
  public type: string;
  
  constructor(config: any = {}) {
    super({
      id: 'FlowExecutor',
      name: 'Flow Executor',
      version: '1.0.0',
      type: 'flow-executor',
      ...config
    });
    
    this.id = 'FlowExecutor';
    this.name = 'Flow Executor';
    this.version = '1.0.0';
    this.type = 'flow-executor';
    
    this.stateCenter = SystemStateCenter.getInstance();
  }
  
  async initialize(): Promise<void> {
    await super.initialize();
    this.logInfo('FlowExecutor initialized');
  }
  
  // 注册容器
  async registerContainer(container: BaseContainer): Promise<void> {
    this.containerRegistry.set(container.ContainerId, container);
    this.logInfo(`Container registered: ${container.ContainerId}`);
  }
  
  // 获取容器
  getContainer(containerId: string): BaseContainer | undefined {
    return this.containerRegistry.get(containerId);
  }
  
  // 执行流程
  async executeFlow(flowConfig: FlowConfig): Promise<FlowResult> {
    const flowId = flowConfig.id;
    const startTime = Date.now();
    
    this.logInfo(`Starting flow execution: ${flowConfig.name}`, { flowId });
    
    // 初始化流状态
    await this.initializeFlowState(flowConfig);
    
    try {
      const results = await this.executeSteps(flowConfig.steps, flowId);
      
      // 更新流状态为完成
      await this.updateFlowState(flowId, {
        status: 'completed',
        currentStep: flowConfig.steps.length,
        results
      });
      
      const flowResult: FlowResult = {
        success: true,
        results,
        performance: {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime
        }
      };
      
      this.logInfo(`Flow completed successfully: ${flowConfig.name}`, { 
        duration: flowResult.performance.duration,
        resultsCount: results.length 
      });
      
      return flowResult;
      
    } catch (error) {
      // 更新流状态为失败
      await this.updateFlowState(flowId, {
        status: 'failed',
        currentStep: this.stateCenter.getFlowState(flowId)?.currentStep || 0,
        error: (error as Error).message
      });
      
      this.error(`Flow execution failed: ${flowConfig.name}`, { error });
      throw error;
    }
  }
  
  // 执行步骤
  private async executeSteps(steps: FlowStep[], flowId: string): Promise<any[]> {
    const results = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepResult = await this.executeStep(step, flowId);
      
      // 更新当前步骤
      await this.updateFlowState(flowId, {
        currentStep: i + 1
      });
      
      results.push({
        stepId: step.id || `step_${i}`,
        stepName: step.name || `Step ${i + 1}`,
        result: stepResult,
        timestamp: Date.now()
      });
      
      this.logDebug(`Step completed: ${step.name || `Step ${i + 1}`}`, { 
        stepResult,
        stepIndex: i + 1,
        totalSteps: steps.length 
      });
    }
    
    return results;
  }
  
  // 执行单个步骤
  private async executeStep(step: FlowStep, flowId: string): Promise<any> {
    this.logDebug(`Executing step: ${step.type}`, { step });
    
    switch (step.type) {
      case 'operation':
        return await this.executeOperationStep(step, flowId);
      case 'condition':
        return await this.executeConditionStep(step, flowId);
      case 'loop':
        return await this.executeLoopStep(step, flowId);
      case 'parallel':
        return await this.executeParallelStep(step, flowId);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
  
  // 执行操作步骤
  private async executeOperationStep(step: FlowStep, flowId: string): Promise<any> {
    const { container: containerId, operation: operationName, params = {} } = step;
    
    if (!containerId || !operationName) {
      throw new Error('Operation step requires container and operation');
    }
    
    const container = this.getContainer(containerId);
    if (!container) {
      throw new Error(`Container not found: ${containerId}`);
    }
    
    // 执行操作
    const result = await container.executeOperation(operationName, params);
    
    this.logDebug(`Operation executed: ${operationName}`, { 
      container: containerId,
      params,
      result 
    });
    
    return result;
  }
  
  // 执行条件步骤
  private async executeConditionStep(step: FlowStep, flowId: string): Promise<any> {
    const { condition, trueBranch, falseBranch } = step;
    
    if (!condition) {
      throw new Error('Condition step requires condition');
    }
    
    // 评估条件 - 简化实现
    const conditionResult = await this.evaluateCondition(condition, {
      flowId,
      stateCenter: this.stateCenter
    });
    
    this.logDebug(`Condition evaluated: ${conditionResult}`, { condition });
    
    let branch: FlowBranch | undefined;
    let branchName: string = 'unknown';
    
    if (conditionResult && trueBranch) {
      branch = trueBranch;
      branchName = 'true';
    } else if (!conditionResult && falseBranch) {
      branch = falseBranch;
      branchName = 'false';
    }
    
    if (branch) {
      this.logDebug(`Executing ${branchName} branch`, { stepsCount: branch.steps.length });
      const branchResults = await this.executeSteps(branch.steps, flowId);
      return { conditionResult, branch: branchName, results: branchResults };
    }
    
    return { conditionResult };
  }
  
  // 执行循环步骤
  private async executeLoopStep(step: FlowStep, flowId: string): Promise<any[]> {
    const { loop, steps } = step;
    
    if (!loop || !steps) {
      throw new Error('Loop step requires loop config and steps');
    }
    
    const results = [];
    let iteration = 0;
    let shouldContinue = true;
    const maxIterations = loop.maxIterations || 10;
    
    this.logDebug('Starting loop execution', { 
      loopType: loop.type,
      maxIterations 
    });
    
    while (shouldContinue && iteration < maxIterations) {
      this.logDebug(`Loop iteration ${iteration + 1}`);
      
      // 执行循环体
      const iterationResults = await this.executeSteps(steps, flowId);
      results.push(...iterationResults);
      
      // 检查循环条件
      shouldContinue = await this.evaluateLoopCondition(loop, iteration, flowId);
      iteration++;
    }
    
    this.logDebug('Loop completed', { 
      iterations: iteration,
      resultsCount: results.length 
    });
    
    return results;
  }
  
  // 执行并行步骤
  private async executeParallelStep(step: FlowStep, flowId: string): Promise<any[]> {
    const { steps: parallelSteps } = step;
    
    if (!parallelSteps || parallelSteps.length === 0) {
      return [];
    }
    
    this.logDebug('Starting parallel execution', { stepsCount: parallelSteps.length });
    
    // 并行执行所有步骤
    const promises = parallelSteps.map(async (parallelStep, index) => {
      try {
        const result = await this.executeStep(parallelStep, flowId);
        return { stepIndex: index, result, success: true };
      } catch (error) {
        this.error(`Parallel step ${index} failed`, { error });
        return { stepIndex: index, error: (error as Error).message, success: false };
      }
    });
    
    return await Promise.all(promises);
  }
  
  // 评估循环条件
  private async evaluateLoopCondition(loop: LoopConfig, iteration: number, flowId: string): Promise<boolean> {
    switch (loop.type) {
      case 'fixed':
        return iteration < (loop.count || 1) - 1;
        
      case 'while_has_more':
        // 检查容器状态判断是否还有更多内容
        return await this.checkHasMoreCondition(flowId);
        
      case 'until_condition':
        if (loop.condition) {
          const conditionResult = await this.evaluateCondition(loop.condition, {
            flowId,
            iteration,
            stateCenter: this.stateCenter
          });
          return !conditionResult; // 直到条件满足才停止
        }
        return false;
        
      default:
        this.warn(`Unknown loop type: ${loop.type}`);
        return false;
    }
  }
  
  // 检查是否有更多内容
  private async checkHasMoreCondition(flowId: string): Promise<boolean> {
    // 这里可以根据实际需求实现更复杂的逻辑
    // 例如检查特定容器的状态
    
    // 简化实现：检查流是否被取消
    const flowState = this.stateCenter.getFlowState(flowId);
    return flowState?.status === 'running';
  }
  
  // 初始化流状态
  private async initializeFlowState(flowConfig: FlowConfig): Promise<void> {
    await this.stateCenter.createFlowState(
      flowConfig.id,
      flowConfig.name,
      flowConfig.steps.length
    );
    
    await this.stateCenter.updateFlowState(flowConfig.id, {
      status: 'running',
      currentStep: 0
    });
    
    this.logDebug(`Flow state initialized: ${flowConfig.id}`);
  }
  
  // 更新流状态
  private async updateFlowState(flowId: string, updates: Partial<IFlowState>): Promise<void> {
    await this.stateCenter.updateFlowState(flowId, updates);
  }
  
  // 取消流程执行
  async cancelFlow(flowId: string): Promise<void> {
    const flowState = this.stateCenter.getFlowState(flowId);
    if (!flowState) {
      throw new Error(`Flow not found: ${flowId}`);
    }
    
    if (flowState.status === 'running') {
      await this.updateFlowState(flowId, {
        status: 'cancelled'
      });
      
      this.logInfo(`Flow cancelled: ${flowId}`);
    }
  }
  
  // 获取流程状态
  getFlowStatus(flowId: string): IFlowState | undefined {
    return this.stateCenter.getFlowState(flowId);
  }
  
  // 获取所有流程状态
  getAllFlowStatuses(): Map<string, IFlowState> {
    // 这里需要从状态中心获取所有流状态
    // 简化实现
    return new Map();
  }
  
  // 解析JSON配置
  parseFlowConfig(jsonConfig: string | object): FlowConfig {
    try {
      const config = typeof jsonConfig === 'string' ? JSON.parse(jsonConfig) : jsonConfig;
      
      // 验证配置结构
      this.validateFlowConfig(config);
      
      return config as FlowConfig;
      
    } catch (error) {
      this.error('Failed to parse flow config', { error });
      throw new Error(`Invalid flow config: ${(error as Error).message}`);
    }
  }
  
  // 验证流程配置
  private validateFlowConfig(config: any): void {
    if (!config.id || typeof config.id !== 'string') {
      throw new Error('Flow config must have a valid id');
    }
    
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Flow config must have a valid name');
    }
    
    if (!Array.isArray(config.steps)) {
      throw new Error('Flow config must have a steps array');
    }
    
    // 验证每个步骤
    for (const step of config.steps) {
      this.validateStep(step);
    }
  }
  
  // 验证步骤配置
  private validateStep(step: any): void {
    if (!step.type || typeof step.type !== 'string') {
      throw new Error('Step must have a valid type');
    }
    
    const validTypes = ['operation', 'condition', 'loop', 'parallel'];
    if (!validTypes.includes(step.type)) {
      throw new Error(`Invalid step type: ${step.type}`);
    }
    
    // 根据步骤类型验证必需字段
    switch (step.type) {
      case 'operation':
        if (!step.container || !step.operation) {
          throw new Error('Operation step requires container and operation');
        }
        break;
        
      case 'condition':
        if (!step.condition) {
          throw new Error('Condition step requires condition');
        }
        break;
        
      case 'loop':
        if (!step.loop || !step.steps) {
          throw new Error('Loop step requires loop config and steps');
        }
        break;
        
      case 'parallel':
        if (!step.steps || !Array.isArray(step.steps)) {
          throw new Error('Parallel step requires steps array');
        }
        break;
    }
  }
  
  // 获取执行器统计信息
  getStats(): {
    registeredContainers: number;
    activeFlows: number;
    totalExecutions: number;
    successRate: number;
  } {
    const flowStates = this.getAllFlowStatuses();
    const activeFlows = Array.from(flowStates.values()).filter(
      state => state.status === 'running'
    ).length;
    
    // 这里可以添加更多的统计逻辑
    return {
      registeredContainers: this.containerRegistry.size,
      activeFlows,
      totalExecutions: 0, // 需要从状态中心获取
      successRate: 0 // 需要从历史执行记录计算
    };
  }
  
  // 清理资源
  async cleanup(): Promise<void> {
    this.containerRegistry.clear();
    this.logInfo('FlowExecutor cleaned up');
  }
  
  // 简化的条件评估方法
  private async evaluateCondition(condition: ConditionConfig, context: any): Promise<boolean> {
    // 简化实现 - 根据实际需求扩展
    if (condition.type === 'container_state' && condition.containerId && condition.property) {
      const entityState = this.stateCenter.getEntityState(condition.containerId);
      if (entityState && entityState.properties) {
        const value = entityState.properties.get(condition.property);
        
        if (condition.operator === 'equals') {
          return value === condition.value;
        } else if (condition.operator === 'not_equals') {
          return value !== condition.value;
        } else if (condition.operator === 'greater_than') {
          return Number(value) > Number(condition.value);
        } else if (condition.operator === 'less_than') {
          return Number(value) < Number(condition.value);
        } else if (condition.operator === 'contains') {
          return String(value).includes(String(condition.value));
        }
      }
    }
    
    // 默认返回true
    return true;
  }
}