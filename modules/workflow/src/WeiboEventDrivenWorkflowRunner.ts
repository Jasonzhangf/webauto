/**
 * 微博事件驱动工作流驱动器
 * 支持配置驱动的容器操作和事件处理
 */

import { EventEmitter } from 'events';

export interface WorkflowConfig {
  name: string;
  version: string;
  description: string;
  config: {
    profile: string;
    url: string;
    targetCount: number;
    maxScrolls: number;
    scrollDistance: number;
    waitAfterScroll: number;
    heightCheckCount: number;
    expandWait: number;
  };
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  outputs: WorkflowOutput;
}

export interface WorkflowTrigger {
  event: string;
  filter?: {
    containerIdPattern?: string;
    containerType?: string;
    operationId?: string;
  };
  actions: WorkflowAction[];
}

export interface WorkflowStep {
  name: string;
  id: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'skipped';
  enter?: {
    when: {
      step: string;
      status: string;
    };
  };
  condition?: {
    variable: string;
    scope: string;
    operator: string;
    value: string | number;
  };
  repeat?: {
    max: string | number;
    until?: {
      condition: {
        variable: string;
        scope: string;
        operator: string;
        value: string | number;
      };
    };
  };
  actions: WorkflowAction[];
}

export interface WorkflowAction {
  type: string;
  containerId?: string;
  operationId?: string;
  config?: Record<string, any>;
  delay?: number | string;
}

export interface WorkflowOutput {
  format: string;
  file: string;
  fields: string[];
}

export interface WorkflowContext {
  apiClient: {
    post: (endpoint: string, data: any) => Promise<any>;
  };
}

export interface WorkflowResult {
  success: boolean;
  posts: any[];
  totalExtracted: number;
  error?: string;
}

export class WeiboEventDrivenWorkflowRunner extends EventEmitter {
  private config: WorkflowConfig;
  private context: WorkflowContext;
  private posts: any[] = [];
  private variables: Map<string, any> = new Map();
  private isRunning = false;
  private currentStepId: string | null = null;

  constructor(config: WorkflowConfig, context: WorkflowContext) {
    super();
    this.config = config;
    this.context = context;
  }

  async execute(): Promise<WorkflowResult> {
    try {
      this.isRunning = true;
      this.emit('workflow:start', { config: this.config });

      // Step 1: 初始化会话
      await this.ensureSession();

      // Step 2: 执行步骤
      await this.runSteps();

      // Step 3: 输出结果
      await this.generateOutput();

      this.emit('workflow:complete', { totalExtracted: this.posts.length });

      return {
        success: true,
        posts: this.posts,
        totalExtracted: this.posts.length
      };

    } catch (error: any) {
      this.emit('workflow:error', { error: error.message });
      return {
        success: false,
        posts: this.posts,
        totalExtracted: this.posts.length,
        error: error.message
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async runSteps(): Promise<void> {
    // 初始步骤
    const firstStep = this.config.steps[0];
    if (firstStep) {
      await this.executeStep(firstStep);
    }

    // 后续步骤根据状态驱动
    while (this.isRunning) {
      const nextStep = this.findNextStep();
      if (!nextStep) break;
      await this.executeStep(nextStep);
    }
  }

  private findNextStep(): WorkflowStep | null {
    for (const step of this.config.steps) {
      if (step.status === 'idle' && step.enter) {
        const prevStep = this.config.steps.find(s => s.id === step.enter?.when.step);
        if (prevStep && prevStep.status === step.enter.when.status) {
          return step;
        }
      }
    }
    return null;
  }

  private async executeStep(step: WorkflowStep): Promise<void> {
    this.currentStepId = step.id;
    step.status = 'running';
    this.emit('step:start', { step });

    try {
      // 检查条件
      if (step.condition && !this.evaluateCondition(step.condition)) {
        step.status = 'skipped';
        this.emit('step:skip', { step, reason: 'condition not met' });
        return;
      }

      // 执行动作（支持重复）
      if (step.repeat) {
        await this.executeRepeatActions(step);
      } else {
        for (const action of step.actions) {
          await this.executeAction(action);
        }
      }

      step.status = 'completed';
      this.emit('step:complete', { step });

    } catch (error: any) {
      step.status = 'failed';
      this.emit('step:failed', { step, error: error.message });
      throw error;
    }
  }

  private async executeRepeatActions(step: WorkflowStep): Promise<void> {
    const max = this.parseValue(step.repeat?.max || 1);
    let count = 0;

    while (count < max && this.isRunning) {
      // 检查退出条件
      if (step.repeat?.until?.condition) {
        if (this.evaluateCondition(step.repeat.until.condition)) {
          break;
        }
      }

      for (const action of step.actions) {
        await this.executeAction(action);
      }

      count++;
    }
  }

  private parseValue(value: string | number): number {
    if (typeof value === 'number') return value;
    if (value.startsWith('{{') && value.endsWith('}}')) {
      const key = value.slice(2, -2).trim();
      if (key.startsWith('config.')) {
        return this.config.config[key.split('.')[1] as keyof typeof this.config.config];
      }
    }
    return Number(value);
  }

  private async ensureSession(): Promise<void> {
    this.emit('session:init-start');

    const sessions = await this.context.apiClient.post('/v1/controller/action', {
      action: 'session:list',
      payload: {}
    });

    const active = sessions.data?.data?.sessions?.find(
      (s: any) => s.profileId === this.config.config.profile
    );

    if (!active) {
      await this.context.apiClient.post('/v1/controller/action', {
        action: 'session:create',
        payload: {
          profile: this.config.config.profile,
          url: this.config.config.url
        }
      });
      await new Promise(r => setTimeout(r, 5000));
    }

    this.emit('session:init-complete');
  }

  private async executeAction(action: WorkflowAction): Promise<void> {
    switch (action.type) {
      case 'session.ensure':
        await this.ensureSession();
        break;
      case 'container.match':
        await this.matchContainers(this.resolveConfig(action.config));
        break;
      case 'container.operation':
        await this.executeContainerOperation(action);
        break;
      case 'extract':
        await this.extractPost(action);
        break;
      case 'variable.set':
        this.setVariable(action.containerId || 'root', action.config?.variable, action.config?.value);
        break;
      case 'variable.increment':
        this.incrementVariable(action.containerId || 'root', action.config?.variable);
        break;
      case 'format.output':
        await this.generateOutput(); // Use internal method directly
        break;
      default:
        this.emit('action:unknown', { action });
    }

    if (action.delay) {
      const delayMs = this.parseValue(action.delay);
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }

  private resolveConfig(config: any): any {
    if (!config) return {};
    const resolved: any = {};
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varKey = value.slice(2, -2).trim();
        if (varKey.startsWith('config.')) {
          resolved[key] = this.config.config[varKey.split('.')[1] as keyof typeof this.config.config];
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }
    return resolved;
  }

  private async matchContainers(config: any): Promise<void> {
    const result = await this.context.apiClient.post('/v1/controller/action', {
      action: 'containers:match',
      payload: config
    });

    if (!result.data?.matched) {
      throw new Error('Root container not matched');
    }

    this.setVariable('root', 'rootContainerId', result.data.container.id);
    this.emit('container:match', { rootId: result.data.container.id });
  }

  private async executeContainerOperation(action: WorkflowAction): Promise<void> {
    if (!action.containerId || !action.operationId) {
      throw new Error('containerId and operationId are required for container.operation');
    }

    const config = this.resolveConfig(action.config);

    await this.context.apiClient.post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: action.containerId,
        operationId: action.operationId,
        config,
        sessionId: this.config.config.profile
      }
    });

    this.emit('container:operation', { action });
  }

  private async extractPost(action: WorkflowAction): Promise<void> {
    if (!action.containerId) return;

    const res = await this.context.apiClient.post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: action.containerId,
        operationId: 'extract',
        config: action.config || {},
        sessionId: this.config.config.profile
      }
    });

    const extracted = res.data?.data?.extracted?.[0];
    if (extracted) {
      this.posts.push(extracted);
      this.emit('post:extracted', { extracted, total: this.posts.length });
    }
  }

  private setVariable(containerId: string, key: string, value: any): void {
    this.variables.set(`${containerId}.${key}`, value);
    this.emit('variable:set', { containerId, key, value });
  }

  private incrementVariable(containerId: string, key: string): void {
    const current = this.variables.get(`${containerId}.${key}`) || 0;
    this.variables.set(`${containerId}.${key}`, current + 1);
    this.emit('variable:increment', { containerId, key, value: current + 1 });
  }

  private evaluateCondition(condition: any): boolean {
    const key = `${condition.scope}.${condition.variable}`;
    const value = this.variables.get(key) || 0;
    const targetValue = this.parseValue(condition.value);

    switch (condition.operator) {
      case 'lt': return value < targetValue;
      case 'lte': return value <= targetValue;
      case 'gt': return value > targetValue;
      case 'gte': return value >= targetValue;
      case 'eq': return value === targetValue;
      default: return false;
    }
  }

  private async generateOutput(): Promise<void> {
    if (this.config.outputs.format !== 'markdown') return;

    const fs = await import('fs/promises');
    const lines = [
      '# 微博主页采集结果 (事件驱动版)',
      '',
      `采集时间：${new Date().toLocaleString('zh-CN')}`,
      `帖子数量：${this.posts.length}`,
      '',
      '---',
      ''
    ];

    this.posts.forEach((post, index) => {
      lines.push(`## ${index + 1}. ${post.author || '未知作者'}`);
      lines.push('');
      
      if (post.content) {
        lines.push(`**内容：** ${post.content.substring(0, 500)}${post.content.length > 500 ? '...' : ''}`);
        lines.push('');
      }
      
      if (post.url) {
        lines.push(`**链接：** ${post.url}`);
        lines.push('');
      }
      
      if (post.timestamp) {
        lines.push(`**时间：** ${post.timestamp}`);
        lines.push('');
      }
      
      if (post.authorUrl) {
        lines.push(`**作者链接：** ${post.authorUrl}`);
        lines.push('');
      }
      
      lines.push('---');
      lines.push('');
    });

    await fs.writeFile(this.config.outputs.file, lines.join('\n'), 'utf-8');
    this.emit('output:generated', { file: this.config.outputs.file });
  }
}
