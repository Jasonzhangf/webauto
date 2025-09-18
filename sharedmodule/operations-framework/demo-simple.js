/**
 * 简化版WebAuto Operator Framework Demo
 * 绕过TypeScript编译问题，直接使用JavaScript测试核心功能
 */

const { EventEmitter } = require('events');

// 简化的基础类型定义
const OperatorState = {
  IDLE: 'idle',
  RUNNING: 'running',
  COMPLETED: 'completed',
  ERROR: 'error',
  PAUSED: 'paused'
};

const OperatorType = {
  PAGE_BASED: 'page-based',
  NON_PAGE: 'non-page',
  COMPOSITE: 'composite'
};

const OperatorCategory = {
  BROWSER: 'browser',
  CONTROL: 'control',
  DATA: 'data',
  UTILITY: 'utility'
};

// 简化的操作结果类
class OperationResult {
  constructor(success, data = null, error = null) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.executionTime = 0;
    this.state = success ? OperatorState.COMPLETED : OperatorState.ERROR;
    this.timestamp = Date.now();
  }

  static success(data) {
    return new OperationResult(true, data);
  }

  static error(error) {
    return new OperationResult(false, null, error);
  }
}

// 简化的通用操作子基类
class UniversalOperator extends EventEmitter {
  constructor(config) {
    super();
    this._config = {
      id: config.id || 'unknown',
      name: config.name || 'Unknown Operator',
      type: config.type || OperatorType.NON_PAGE,
      category: config.category || OperatorCategory.UTILITY,
      description: config.description || '',
      ...config
    };
    this._state = OperatorState.IDLE;
    this._executionHistory = [];
    this._capabilities = this.initializeCapabilities();
  }

  initializeCapabilities() {
    return {
      observe: true,
      list: true,
      capabilities: true,
      operate: true,
      status: true,
      context: true,
      connect: true
    };
  }

  async execute(params) {
    throw new Error('execute method must be implemented by subclass');
  }

  async observe() {
    return OperationResult.success({
      state: this._state,
      timestamp: Date.now(),
      uptime: process.uptime()
    });
  }

  async list() {
    return OperationResult.success({
      operations: ['execute', 'observe', 'list', 'capabilities', 'status', 'context'],
      category: this._config.category
    });
  }

  async capabilities() {
    return OperationResult.success(this._capabilities);
  }

  async status() {
    return OperationResult.success({
      state: this._state,
      healthy: this._state !== OperatorState.ERROR,
      lastExecution: this._executionHistory[this._executionHistory.length - 1]
    });
  }

  async context() {
    return OperationResult.success({
      config: this._config,
      state: this._state,
      history: this._executionHistory
    });
  }

  async connect(target) {
    return OperationResult.success({
      connected: true,
      target: target,
      timestamp: Date.now()
    });
  }

  createSuccessResult(data) {
    return OperationResult.success(data);
  }

  createErrorResult(message) {
    return OperationResult.error(message);
  }

  addToExecutionHistory(result) {
    this._executionHistory.push({
      ...result,
      timestamp: Date.now()
    });
  }

  log(message) {
    console.log(`[${this._config.name}] ${message}`);
  }
}

// 简化的状态操作子
class StateOperator extends UniversalOperator {
  constructor(config = {}) {
    super({
      id: 'state-operator',
      name: '状态操作子',
      type: OperatorType.NON_PAGE,
      category: OperatorCategory.CONTROL,
      description: '管理工作流状态和持久化存储',
      ...config
    });
    this._stateStore = new Map();
    this._persistencePath = config.persistencePath || './state.json';
  }

  async execute(params) {
    const { action, key, value, path, namespace } = params;

    try {
      switch (action) {
        case 'set':
          return this.setState(key, value, namespace);
        case 'get':
          return this.getState(key, namespace);
        case 'list':
          return this.listStates(namespace);
        case 'clear':
          return this.clearStates(namespace);
        default:
          return this.createErrorResult(`未知操作: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(`操作失败: ${error.message}`);
    }
  }

  async setState(key, value, namespace = 'default') {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this._stateStore.set(fullKey, {
      key,
      value,
      namespace,
      timestamp: Date.now()
    });
    this.log(`状态已设置: ${fullKey}`);
    return this.createSuccessResult({
      set: true,
      key: fullKey,
      value,
      namespace
    });
  }

  async getState(key, namespace = 'default') {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    const entry = this._stateStore.get(fullKey);

    if (!entry) {
      return this.createErrorResult(`状态不存在: ${fullKey}`);
    }

    return this.createSuccessResult({
      key: fullKey,
      value: entry.value,
      namespace: entry.namespace,
      timestamp: entry.timestamp
    });
  }

  async listStates(namespace) {
    const states = [];
    for (const [fullKey, entry] of this._stateStore) {
      if (!namespace || entry.namespace === namespace) {
        states.push(entry);
      }
    }

    return this.createSuccessResult({
      states,
      count: states.length,
      namespace: namespace || 'all'
    });
  }

  async clearStates(namespace) {
    let clearedCount = 0;

    if (namespace) {
      for (const [fullKey, entry] of this._stateStore) {
        if (entry.namespace === namespace) {
          this._stateStore.delete(fullKey);
          clearedCount++;
        }
      }
    } else {
      clearedCount = this._stateStore.size;
      this._stateStore.clear();
    }

    this.log(`已清除 ${clearedCount} 个状态`);
    return this.createSuccessResult({
      cleared: true,
      namespace: namespace || 'all',
      count: clearedCount
    });
  }
}

// 简化的条件操作子
class ConditionOperator extends UniversalOperator {
  constructor(config = {}) {
    super({
      id: 'condition-operator',
      name: '条件操作子',
      type: OperatorType.NON_PAGE,
      category: OperatorCategory.CONTROL,
      description: '评估条件和控制流程',
      ...config
    });
  }

  async execute(params) {
    const { condition, data } = params;

    try {
      const result = await this.evaluateCondition(condition, data);
      return this.createSuccessResult({
        condition,
        result,
        timestamp: Date.now()
      });
    } catch (error) {
      return this.createErrorResult(`条件评估失败: ${error.message}`);
    }
  }

  async evaluateCondition(condition, data = {}) {
    if (typeof condition === 'boolean') {
      return condition;
    }

    if (typeof condition === 'string') {
      // 简单的条件表达式解析
      if (condition.includes('==')) {
        const [left, right] = condition.split('==').map(s => s.trim());
        const leftValue = this.resolveValue(left, data);
        const rightValue = this.resolveValue(right, data);
        return leftValue == rightValue;
      } else if (condition.includes('>')) {
        const [left, right] = condition.split('>').map(s => s.trim());
        const leftValue = this.resolveValue(left, data);
        const rightValue = this.resolveValue(right, data);
        return Number(leftValue) > Number(rightValue);
      } else if (condition.includes('<')) {
        const [left, right] = condition.split('<').map(s => s.trim());
        const leftValue = this.resolveValue(left, data);
        const rightValue = this.resolveValue(right, data);
        return Number(leftValue) < Number(rightValue);
      }
    }

    return !!condition;
  }

  resolveValue(value, data) {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const key = value.slice(2, -1);
      return data[key] !== undefined ? data[key] : value;
    }
    return value;
  }
}

// 简化的工作流引擎
class SimpleWorkflowEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this._workflows = new Map();
    this._operators = new Map();
    this._runningWorkflows = new Map();
    this._state = new StateOperator();

    this.initializeOperators();
  }

  initializeOperators() {
    // 注册内置操作子
    this.registerOperator('state', new StateOperator());
    this.registerOperator('condition', new ConditionOperator());
  }

  registerOperator(name, operator) {
    this._operators.set(name, operator);
    this.log(`操作子已注册: ${name}`);
  }

  async registerWorkflow(workflowConfig) {
    const { id, name, description, steps } = workflowConfig;

    if (!id || !steps || !Array.isArray(steps)) {
      throw new Error('工作流配置无效：缺少id或steps');
    }

    this._workflows.set(id, {
      id,
      name: name || id,
      description: description || '',
      steps,
      createdAt: Date.now()
    });

    this.log(`工作流已注册: ${id}`);
  }

  async executeWorkflow(workflowId, inputData = {}) {
    const workflow = this._workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`工作流不存在: ${workflowId}`);
    }

    const context = {
      id: `${workflowId}_${Date.now()}`,
      workflowId,
      inputData,
      outputData: {},
      currentStep: 0,
      state: 'running',
      startTime: Date.now(),
      steps: []
    };

    this._runningWorkflows.set(context.id, context);
    this.emit('workflowStarted', context);

    try {
      const result = await this.executeSteps(workflow.steps, context);

      context.state = 'completed';
      context.endTime = Date.now();
      context.outputData = result;

      this._runningWorkflows.delete(context.id);
      this.emit('workflowCompleted', context);

      return {
        success: true,
        workflowId,
        context,
        result
      };
    } catch (error) {
      context.state = 'error';
      context.endTime = Date.now();
      context.error = error.message;

      this._runningWorkflows.delete(context.id);
      this.emit('workflowError', context);

      return {
        success: false,
        workflowId,
        context,
        error: error.message
      };
    }
  }

  async executeSteps(steps, context) {
    let currentData = { ...context.inputData };

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      context.currentStep = i;

      this.log(`执行步骤 ${i + 1}/${steps.length}: ${step.name || step.operator}`);

      const stepResult = await this.executeStep(step, currentData, context);

      // 记录步骤结果
      context.steps.push({
        stepNumber: i,
        name: step.name || step.operator,
        operator: step.operator,
        success: stepResult.success,
        result: stepResult,
        timestamp: Date.now()
      });

      if (!stepResult.success) {
        throw new Error(`步骤执行失败: ${step.name || step.operator}`);
      }

      // 更新数据
      if (stepResult.data) {
        currentData = { ...currentData, ...stepResult.data };
      }

      // 检查条件跳转
      if (step.condition) {
        const conditionResult = await this.evaluateCondition(step.condition, currentData);
        if (!conditionResult.success) {
          throw new Error(`条件评估失败: ${step.condition}`);
        }

        if (stepResult.data && conditionResult.data.result === false) {
          // 条件不满足，跳转到指定步骤或结束
          if (step.jumpTo !== undefined) {
            i = step.jumpTo - 1; // 转换为0-based索引
            continue;
          } else {
            break;
          }
        }
      }
    }

    return currentData;
  }

  async executeStep(step, data, context) {
    const operator = this._operators.get(step.operator);
    if (!operator) {
      throw new Error(`操作子不存在: ${step.operator}`);
    }

    // 不合并参数，只使用步骤的原始参数
    const params = { ...step.params };

    return await operator.execute(params);
  }

  async evaluateCondition(condition, data) {
    const operator = this._operators.get('condition');
    return await operator.execute({
      condition,
      data
    });
  }

  log(message) {
    console.log(`[WorkflowEngine] ${message}`);
  }
}

// 创建示例工作流
function createDemoWorkflow() {
  return {
    id: 'weibo-demo',
    name: '微博演示工作流',
    description: '演示状态管理和条件判断的工作流',
    steps: [
      {
        name: '初始化计数器',
        operator: 'state',
        params: {
          action: 'set',
          key: 'counter',
          value: 0,
          namespace: 'demo'
        }
      },
      {
        name: '增加计数器',
        operator: 'state',
        params: {
          action: 'set',
          key: 'counter',
          value: 1,
          namespace: 'demo'
        }
      },
      {
        name: '获取当前值',
        operator: 'state',
        params: {
          action: 'get',
          key: 'counter',
          namespace: 'demo'
        }
      },
      {
        name: '检查条件',
        operator: 'condition',
        params: {
          condition: '${counter} > 0'
        },
        condition: '${counter} > 0'
      },
      {
        name: '设置状态',
        operator: 'state',
        params: {
          action: 'set',
          key: 'status',
          value: 'success',
          namespace: 'demo'
        }
      }
    ]
  };
}

// 修复状态操作子的值解析问题
StateOperator.prototype.execute = async function(params) {
  const { action, key, value, path, namespace } = params;

  try {
    switch (action) {
      case 'set':
        const resolvedValue = this.resolveValue(value, params, namespace);
        return this.setState(key, resolvedValue, namespace);
      case 'get':
        return this.getState(key, namespace);
      case 'list':
        return this.listStates(namespace);
      case 'clear':
        return this.clearStates(namespace);
      default:
        return this.createErrorResult(`未知操作: ${action}`);
    }
  } catch (error) {
    return this.createErrorResult(`操作失败: ${error.message}`);
  }
};

StateOperator.prototype.resolveValue = function(value, data, namespace = 'default') {
  if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
    const key = value.slice(2, -1);

    // 处理简单表达式
    if (key.includes(' + ')) {
      const [varName, operation] = key.split(' + ');
      const currentValue = this._stateStore.get(`${namespace}:${varName}`)?.value || 0;
      return Number(currentValue) + Number(operation);
    }

    return data[key] || this._stateStore.get(`${namespace}:${key}`)?.value || value;
  }
  return value;
};

// 主函数
async function runDemo() {
  console.log('🚀 WebAuto Operator Framework Demo');
  console.log('====================================');

  // 创建工作流引擎
  const engine = new SimpleWorkflowEngine();

  // 注册示例工作流
  const demoWorkflow = createDemoWorkflow();
  await engine.registerWorkflow(demoWorkflow);

  console.log('\n📋 已注册工作流:');
  console.log(`- ID: ${demoWorkflow.id}`);
  console.log(`- 名称: ${demoWorkflow.name}`);
  console.log(`- 步骤数: ${demoWorkflow.steps.length}`);

  console.log('\n🔄 执行工作流...');

  // 执行工作流
  const result = await engine.executeWorkflow('weibo-demo', {
    startTime: Date.now(),
    testMode: true
  });

  console.log('\n📊 执行结果:');
  console.log(`- 成功: ${result.success}`);
  console.log(`- 工作流ID: ${result.workflowId}`);

  if (result.success) {
    console.log('\n✅ 工作流执行成功！');
    console.log('📈 步骤执行情况:');
    result.context.steps.forEach((step, index) => {
      const status = step.success ? '✅' : '❌';
      console.log(`  ${status} 步骤 ${index + 1}: ${step.name}`);
    });

    console.log('\n📋 最终数据:');
    console.log('- 输出数据:', JSON.stringify(result.context.outputData, null, 2));
  } else {
    console.log('\n❌ 工作流执行失败！');
    console.log(`- 错误信息: ${result.error}`);
    console.log(`- 失败步骤: ${result.context.currentStep + 1}`);
  }

  console.log('\n🏁 Demo 完成');
}

// 运行Demo
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = {
  UniversalOperator,
  StateOperator,
  ConditionOperator,
  SimpleWorkflowEngine,
  OperationResult,
  OperatorState,
  OperatorType,
  OperatorCategory
};