/**
 * 配置驱动的工作流执行器
 * 支持从配置文件加载和执行工作流，无需编码
 */

import { globalRegistry } from './OperationRegistry.js';
import ConfigurationManager from './config/ConfigurationManager.js';
import ExecutionContext from './execution/ExecutionContext.js';
import ExecutionContextManager from './execution/ExecutionContextManager.js';

export class ConfigurableWorkflowExecutor {
  constructor(config = {}) {
    this.configManager = new ConfigurationManager(config);
    this.contextManager = new ExecutionContextManager(config);
    this.logger = config.logger || console;
    this.workflows = new Map();
    this.activeExecutions = new Map();
    
    // 内置操作映射
    this.operationMappings = {
      // 控制流操作
      'loop': './control-flow/LoopOperation.js',
      'conditional': './control-flow/ConditionalOperation.js',
      
      // 通用操作
      'web-scraper': './generic/GenericWebScraperOperation.js',
      'data-processor': './generic/ConfigurableDataProcessorOperation.js',
      'ai-service': './generic/AIServiceOperation.js',
      'notification': './generic/NotificationOperation.js',
      
      // 后处理操作
      'file-organizer': './post-processing/FileOrganizerOperation.js',
      'html-formatter': './post-processing/HTMLFormatterOperation.js',
      'ai-summarizer': './post-processing/AISummarizerOperation.js'
    };
    
    // 初始化
    this.initialize();
  }

  /**
   * 初始化执行器
   */
  async initialize() {
    this.logger.info('Initializing ConfigurableWorkflowExecutor');
    
    // 注册内置操作
    await this.registerBuiltinOperations();
    
    // 加载工作流配置
    await this.loadWorkflowConfigs();
    
    this.logger.info('ConfigurableWorkflowExecutor initialized successfully');
  }

  /**
   * 注册内置操作
   */
  async registerBuiltinOperations() {
    this.logger.info('Registering builtin operations');
    
    for (const [name, path] of Object.entries(this.operationMappings)) {
      try {
        // 动态导入操作类
        const operationModule = await import(path);
        const OperationClass = operationModule.default || operationModule;
        
        // 注册到全局注册表
        globalRegistry.register(OperationClass, {
          name: name,
          description: OperationClass.description || `Configurable ${name} operation`,
          category: 'configurable',
          configurable: true
        });
        
        this.logger.info('Builtin operation registered', { name });
        
      } catch (error) {
        this.logger.error('Failed to register builtin operation', { 
          name, 
          path, 
          error: error.message 
        });
      }
    }
  }

  /**
   * 加载工作流配置
   */
  async loadWorkflowConfigs() {
    this.logger.info('Loading workflow configurations');
    
    try {
      // 扫描配置目录
      const configDir = this.configManager.configPath;
      const workflowFiles = await this.scanWorkflowConfigs(configDir);
      
      for (const file of workflowFiles) {
        try {
          const workflowConfig = await this.configManager.loadConfig(file, 'json');
          await this.registerWorkflow(workflowConfig);
          
          this.logger.info('Workflow config loaded', { 
            name: workflowConfig.name, 
            file 
          });
          
        } catch (error) {
          this.logger.error('Failed to load workflow config', { 
            file, 
            error: error.message 
          });
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to load workflow configs', { 
        error: error.message 
      });
    }
  }

  /**
   * 扫描工作流配置文件
   */
  async scanWorkflowConfigs(configDir) {
    // 实际实现会扫描目录中的配置文件
    // 这里返回示例文件路径
    return [
      `${configDir}/workflows/weibo-search-workflow.json`,
      `${configDir}/workflows/weibo-content-extraction-workflow.json`,
      `${configDir}/workflows/weibo-content-processing-workflow.json`
    ];
  }

  /**
   * 注册工作流
   */
  async registerWorkflow(config) {
    if (!config.name) {
      throw new Error('Workflow name is required');
    }

    // 验证工作流配置
    const validationResult = await this.configManager.validateConfig(config, 'workflow');
    if (!validationResult.valid) {
      throw new Error(`Invalid workflow config: ${validationResult.errors.join(', ')}`);
    }

    // 预处理工作流
    const processedWorkflow = await this.preprocessWorkflow(config);
    
    // 注册工作流
    this.workflows.set(config.name, processedWorkflow);
    
    this.logger.info('Workflow registered', { 
      name: config.name,
      stepCount: processedWorkflow.steps.length 
    });
  }

  /**
   * 预处理工作流
   */
  async preprocessWorkflow(config) {
    const processed = {
      ...config,
      steps: [],
      variables: new Map(),
      dependencies: new Map()
    };

    // 处理变量
    if (config.variables) {
      for (const variable of config.variables) {
        processed.variables.set(variable.name, variable);
      }
    }

    // 处理步骤
    for (let i = 0; i < config.steps.length; i++) {
      const step = config.steps[i];
      const processedStep = await this.preprocessStep(step, i, processed);
      processed.steps.push(processedStep);
    }

    // 构建依赖图
    await this.buildDependencyGraph(processed);

    return processed;
  }

  /**
   * 预处理步骤
   */
  async preprocessStep(step, index, workflow) {
    const processedStep = {
      ...step,
      index,
      id: step.id || `step_${index}`,
      dependencies: [],
      dependents: [],
      retry: step.retry || { maxRetries: 0, delay: 1000 },
      timeout: step.timeout || 30000,
      condition: step.condition || null,
      loop: step.loop || null
    };

    // 处理条件
    if (step.condition) {
      processedStep.condition = await this.preprocessCondition(step.condition);
    }

    // 处理循环
    if (step.loop) {
      processedStep.loop = await this.preprocessLoop(step.loop);
    }

    // 处理变量引用
    if (step.params) {
      processedStep.params = await this.resolveVariableReferences(step.params, workflow.variables);
    }

    return processedStep;
  }

  /**
   * 预处理条件
   */
  async preprocessCondition(condition) {
    return {
      ...condition,
      type: condition.type || 'expression',
      config: condition.config || {},
      negated: condition.negated || false
    };
  }

  /**
   * 预处理循环
   */
  async preprocessLoop(loop) {
    return {
      ...loop,
      type: loop.type || 'forEach',
      maxIterations: loop.maxIterations || 1000,
      breakCondition: loop.breakCondition || null,
      continueCondition: loop.continueCondition || null
    };
  }

  /**
   * 解析变量引用
   */
  async resolveVariableReferences(params, variables) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        // 变量引用
        const variableName = value.slice(2, -1);
        const variable = variables.get(variableName);
        
        if (variable) {
          resolved[key] = variable.value;
        } else {
          // 保留原样，运行时解析
          resolved[key] = value;
        }
      } else if (typeof value === 'object' && value !== null) {
        // 递归处理对象
        resolved[key] = await this.resolveVariableReferences(value, variables);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 构建依赖图
   */
  async buildDependencyGraph(workflow) {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      
      // 查找依赖
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          const depStep = workflow.steps.find(s => s.id === depId);
          if (depStep) {
            step.dependencies.push(depStep);
            depStep.dependents.push(step);
          }
        }
      }
      
      // 顺序依赖
      if (i > 0) {
        const prevStep = workflow.steps[i - 1];
        if (!step.dependencies.includes(prevStep)) {
          step.dependencies.push(prevStep);
          prevStep.dependents.push(step);
        }
      }
    }
  }

  /**
   * 执行工作流
   */
  async executeWorkflow(workflowName, inputParams = {}) {
    this.logger.info('Executing workflow', { 
      workflowName,
      inputParams: Object.keys(inputParams) 
    });

    // 获取工作流配置
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowName}`);
    }

    // 创建执行上下文
    const context = await this.createExecutionContext(workflow, inputParams);
    
    // 创建执行实例
    const execution = {
      id: this.generateExecutionId(),
      workflowName,
      context,
      startTime: Date.now(),
      status: 'running',
      steps: [],
      results: [],
      errors: []
    };

    this.activeExecutions.set(execution.id, execution);

    try {
      // 执行工作流
      const result = await this.runWorkflow(workflow, context, execution);
      
      // 更新执行状态
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;
      
      this.logger.info('Workflow execution completed', { 
        workflowName,
        executionId: execution.id,
        duration: execution.endTime - execution.startTime 
      });

      return {
        success: true,
        executionId: execution.id,
        workflowName,
        result,
        metadata: {
          startTime: execution.startTime,
          endTime: execution.endTime,
          duration: execution.endTime - execution.startTime,
          stepsExecuted: execution.steps.length,
          errorsCount: execution.errors.length
        }
      };

    } catch (error) {
      // 更新执行状态
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error;
      execution.errors.push({
        type: 'workflow',
        message: error.message,
        timestamp: Date.now()
      });

      this.logger.error('Workflow execution failed', { 
        workflowName,
        executionId: execution.id,
        error: error.message 
      });

      throw error;

    } finally {
      // 清理上下文
      await this.cleanupExecutionContext(context);
      
      // 如果配置了，从活动执行中移除
      if (this.config.cleanupAfterComplete) {
        this.activeExecutions.delete(execution.id);
      }
    }
  }

  /**
   * 创建执行上下文
   */
  async createExecutionContext(workflow, inputParams) {
    const context = new ExecutionContext({
      workflowName: workflow.name,
      executionId: this.generateExecutionId(),
      logger: this.logger
    });

    // 设置工作流变量
    for (const [name, variable] of workflow.variables) {
      context.setVariable(name, variable.value);
    }

    // 设置输入参数
    for (const [key, value] of Object.entries(inputParams)) {
      context.setVariable(key, value);
    }

    // 注册工作流操作
    await this.registerWorkflowOperations(context, workflow);

    return context;
  }

  /**
   * 注册工作流操作
   */
  async registerWorkflowOperations(context, workflow) {
    // 注册工作流中使用的操作
    const operations = new Set();
    
    for (const step of workflow.steps) {
      operations.add(step.operation);
    }

    for (const operationName of operations) {
      try {
        const OperationClass = globalRegistry.getOperationClass(operationName);
        if (OperationClass) {
          const operation = new OperationClass({
            logger: this.logger
          });
          await context.registerOperation(operationName, operation);
        }
      } catch (error) {
        this.logger.error('Failed to register workflow operation', { 
          operationName, 
          error: error.message 
        });
      }
    }
  }

  /**
   * 运行工作流
   */
  async runWorkflow(workflow, context, execution) {
    this.logger.info('Running workflow', { 
      workflowName: workflow.name,
      stepCount: workflow.steps.length 
    });

    const results = [];
    const executedSteps = new Set();

    // 拓扑排序执行步骤
    const sortedSteps = this.topologicalSort(workflow.steps);
    
    for (const step of sortedSteps) {
      try {
        // 检查步骤是否应该执行
        if (!await this.shouldExecuteStep(step, context, execution)) {
          this.logger.info('Skipping step', { 
            stepId: step.id,
            reason: 'condition_not_met' 
          });
          continue;
        }

        // 执行步骤
        const stepResult = await this.executeStep(step, context, execution);
        
        executedSteps.add(step.id);
        results.push(stepResult);
        
        // 更新执行状态
        execution.steps.push({
          stepId: step.id,
          status: 'completed',
          startTime: stepResult.startTime,
          endTime: stepResult.endTime,
          duration: stepResult.duration,
          result: stepResult
        });

        this.logger.info('Step completed', { 
          stepId: step.id,
          duration: stepResult.duration 
        });

      } catch (error) {
        this.logger.error('Step execution failed', { 
          stepId: step.id,
          error: error.message 
        });

        execution.steps.push({
          stepId: step.id,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });

        execution.errors.push({
          type: 'step',
          stepId: step.id,
          message: error.message,
          timestamp: Date.now()
        });

        // 根据错误处理策略决定是否继续
        if (step.errorHandling === 'stop') {
          throw error;
        } else if (step.errorHandling === 'continue') {
          continue;
        } else if (step.errorHandling === 'retry' && step.retry.maxRetries > 0) {
          // 重试逻辑
          const retryResult = await this.retryStep(step, context, execution);
          if (retryResult.success) {
            executedSteps.add(step.id);
            results.push(retryResult.result);
          } else {
            throw retryResult.error;
          }
        }
      }
    }

    return {
      success: true,
      workflowName: workflow.name,
      stepsExecuted: executedSteps.size,
      totalSteps: workflow.steps.length,
      results,
      metadata: {
        timestamp: new Date().toISOString(),
        executionId: execution.id
      }
    };
  }

  /**
   * 检查步骤是否应该执行
   */
  async shouldExecuteStep(step, context, execution) {
    // 检查条件
    if (step.condition) {
      const conditionResult = await this.evaluateCondition(step.condition, context);
      if (step.condition.negated) {
        return !conditionResult;
      }
      return conditionResult;
    }

    // 检查循环
    if (step.loop) {
      return await this.evaluateLoopCondition(step.loop, context);
    }

    return true;
  }

  /**
   * 执行步骤
   */
  async executeStep(step, context, execution) {
    const startTime = Date.now();
    
    this.logger.info('Executing step', { 
      stepId: step.id,
      operation: step.operation 
    });

    // 获取操作实例
    const operation = await context.getOperation(step.operation);
    if (!operation) {
      throw new Error(`Operation not found: ${step.operation}`);
    }

    // 解析参数
    const params = await this.resolveStepParams(step.params, context);

    // 执行操作
    const result = await this.executeWithRetry(operation, params, step.retry);

    // 保存结果到上下文
    if (step.outputVariable) {
      context.setVariable(step.outputVariable, result);
    }

    const endTime = Date.now();

    return {
      stepId: step.id,
      operation: step.operation,
      success: true,
      result,
      startTime,
      endTime,
      duration: endTime - startTime
    };
  }

  /**
   * 重试步骤
   */
  async retryStep(step, context, execution) {
    const { maxRetries, delay, backoffFactor = 2 } = step.retry;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info('Retrying step', { 
          stepId: step.id,
          attempt,
          maxRetries 
        });

        const result = await this.executeStep(step, context, execution);
        
        return {
          success: true,
          attempt,
          result
        };

      } catch (error) {
        this.logger.warn('Retry attempt failed', { 
          stepId: step.id,
          attempt,
          error: error.message 
        });

        if (attempt < maxRetries) {
          // 计算延迟时间
          const retryDelay = delay * Math.pow(backoffFactor, attempt - 1);
          await this.sleep(retryDelay);
        } else {
          return {
            success: false,
            attempt,
            error
          };
        }
      }
    }
  }

  /**
   * 执行带重试的操作
   */
  async executeWithRetry(operation, params, retryConfig) {
    if (!retryConfig || retryConfig.maxRetries === 0) {
      return await operation.execute(params);
    }

    const { maxRetries, delay, backoffFactor = 2 } = retryConfig;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation.execute(params);
      } catch (error) {
        if (attempt < maxRetries) {
          const retryDelay = delay * Math.pow(backoffFactor, attempt - 1);
          await this.sleep(retryDelay);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * 解析步骤参数
   */
  async resolveStepParams(params, context) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // 解析变量引用
        resolved[key] = await this.resolveValue(value, context);
      } else if (Array.isArray(value)) {
        // 递归处理数组
        resolved[key] = await Promise.all(
          value.map(item => this.resolveValue(item, context))
        );
      } else if (typeof value === 'object' && value !== null) {
        // 递归处理对象
        resolved[key] = await this.resolveObjectParams(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 解析对象参数
   */
  async resolveObjectParams(obj, context) {
    const resolved = {};

    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = await this.resolveValue(value, context);
    }

    return resolved;
  }

  /**
   * 解析值
   */
  async resolveValue(value, context) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      // 变量引用
      const variableName = value.slice(2, -1);
      return context.getVariable(variableName);
    }

    if (typeof value === 'string' && value.startsWith('eval:')) {
      // 表达式求值
      const expression = value.slice(5);
      return await this.evaluateExpression(expression, context);
    }

    return value;
  }

  /**
   * 评估条件
   */
  async evaluateCondition(condition, context) {
    // 使用条件控制操作来评估条件
    const conditionalOp = context.getOperation('conditional');
    if (conditionalOp) {
      return await conditionalOp.evaluateCondition(context, condition.condition, condition.type, condition.config);
    }

    // 简单的条件评估
    if (typeof condition.condition === 'boolean') {
      return condition.condition;
    }

    if (typeof condition.condition === 'string') {
      return await this.evaluateExpression(condition.condition, context);
    }

    return !!condition.condition;
  }

  /**
   * 评估循环条件
   */
  async evaluateLoopCondition(loop, context) {
    // 使用循环控制操作来评估循环条件
    const loopOp = context.getOperation('loop');
    if (loopOp) {
      return await loopOp.evaluateCondition(context, loop.condition);
    }

    return true;
  }

  /**
   * 评估表达式
   */
  async evaluateExpression(expression, context) {
    try {
      const safeEval = new Function('context', `
        "use strict";
        try {
          return ${expression};
        } catch (e) {
          return null;
        }
      `);
      return await safeEval(context);
    } catch (error) {
      this.logger.error('Expression evaluation failed', { 
        expression, 
        error: error.message 
      });
      return null;
    }
  }

  /**
   * 拓扑排序
   */
  topologicalSort(steps) {
    const visited = new Set();
    const visiting = new Set();
    const result = [];

    const visit = (step) => {
      if (visiting.has(step)) {
        throw new Error('Circular dependency detected');
      }
      if (visited.has(step)) {
        return;
      }

      visiting.add(step);

      for (const dep of step.dependencies) {
        visit(dep);
      }

      visiting.delete(step);
      visited.add(step);
      result.push(step);
    };

    for (const step of steps) {
      if (!visited.has(step)) {
        visit(step);
      }
    }

    return result;
  }

  /**
   * 清理执行上下文
   */
  async cleanupExecutionContext(context) {
    await context.cleanup();
  }

  /**
   * 生成执行ID
   */
  generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 睡眠函数
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取工作流列表
   */
  getWorkflows() {
    return Array.from(this.workflows.keys());
  }

  /**
   * 获取工作流配置
   */
  getWorkflowConfig(workflowName) {
    return this.workflows.get(workflowName);
  }

  /**
   * 获取活动执行
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * 获取执行状态
   */
  getExecutionStatus(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    return {
      id: execution.id,
      workflowName: execution.workflowName,
      status: execution.status,
      startTime: execution.startTime,
      endTime: execution.endTime,
      duration: execution.endTime ? execution.endTime - execution.startTime : null,
      steps: execution.steps,
      errors: execution.errors,
      result: execution.result
    };
  }

  /**
   * 停止执行
   */
  async stopExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    execution.status = 'stopped';
    execution.endTime = Date.now();

    // 清理上下文
    await this.cleanupExecutionContext(execution.context);

    this.logger.info('Execution stopped', { 
      executionId,
      workflowName: execution.workflowName 
    });

    return {
      success: true,
      executionId,
      status: 'stopped'
    };
  }

  /**
   * 获取执行器状态
   */
  getStatus() {
    return {
      workflows: {
        total: this.workflows.size,
        names: Array.from(this.workflows.keys())
      },
      activeExecutions: this.activeExecutions.size,
      operationMappings: Object.keys(this.operationMappings),
      configurationManager: this.configManager.getCacheStats(),
      contextManager: this.contextManager.getStatus()
    };
  }
}

export default ConfigurableWorkflowExecutor;