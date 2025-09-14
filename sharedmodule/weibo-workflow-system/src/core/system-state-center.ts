// System State Center - Core system service for entity registration and state management
import { BaseModule } from '../utils/rcc-basemodule';
import { 
  IEntityRegistration, 
  IEntityState, 
  IChangeSet 
} from '../interfaces/core';

export interface ISubscription {
  id: string;
  entityId: string;
  callback: (state: IEntityState, changes: IChangeSet) => Promise<void>;
  filter?: (state: IEntityState) => boolean;
}

export interface IPageState {
  url: string;
  title: string;
  ready: boolean;
  lastActivity: number;
}

export interface IFlowState {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  currentStep: number;
  totalSteps: number;
  startTime: number;
  results?: any[];
  error?: string;
}

export class SystemStateCenter extends BaseModule {
  private static instance: SystemStateCenter;
  
  // Add public properties for BaseModule compatibility
  public id: string;
  public name: string;
  public version: string;
  public type: string;
  
  // 状态存储
  private pageState!: IPageState;
  private entityStates: Map<string, IEntityState> = new Map();
  private flowStates: Map<string, IFlowState> = new Map();
  
  // 注册中心
  private entityRegistry: Map<string, IEntityRegistration> = new Map();
  private subscriberRegistry: Map<string, Set<ISubscription>> = new Map();
  
  // Event handling
  private eventEmitter: any = new (require('events').EventEmitter)();
  
  // 健康监控
  private healthCheckInterval: NodeJS.Timeout | null = null;
  
  constructor(config: any = {}) {
    super({
      id: 'SystemStateCenter',
      name: 'System State Center',
      version: '1.0.0',
      type: 'state-center',
      ...config
    });
    
    // Add public properties for BaseModule compatibility
    this.id = 'SystemStateCenter';
    this.name = 'System State Center';
    this.version = '1.0.0';
    this.type = 'state-center';
    
    this.initialize();
  }
  
  static getInstance(config?: any): SystemStateCenter {
    if (!SystemStateCenter.instance) {
      SystemStateCenter.instance = new SystemStateCenter(config);
    }
    return SystemStateCenter.instance;
  }
  
  public async initialize(): Promise<void> {
    // 初始化页面状态
    this.pageState = {
      url: '',
      title: '',
      ready: false,
      lastActivity: Date.now()
    };
    
    // 注册到自身
    this.registerSelf();
    
    // 启动健康监控
    this.startHealthMonitoring();
    
    this.logInfo('SystemStateCenter initialized');
  }
  
  private registerSelf(): void {
    const selfRegistration: IEntityRegistration = {
      id: this.id,
      name: this.name,
      type: 'system',
      metadata: {
        version: this.version,
        description: 'System state center - core service of weibo container OS',
        tags: ['system', 'state', 'core']
      },
      monitoring: {
        enabled: true,
        interval: 5000,
        healthCheck: true
      }
    };
    
    this.entityRegistry.set(this.id, selfRegistration);
    
    const properties = new Map<string, any>();
    properties.set('initialized', true);
    properties.set('entityCount', 1);
    properties.set('uptime', Date.now());
    
    const metrics = new Map<string, string>();
    metrics.set('registrations', '0');
    metrics.set('stateUpdates', '0');
    metrics.set('healthChecks', '0');
    
    const selfState: IEntityState = {
      id: this.id,
      name: this.name,
      type: 'system',
      status: 'active',
      properties,
      metrics,
      timestamp: Date.now()
    };
    
    this.entityStates.set(this.id, selfState);
  }
  
  // 实体注册接口
  async registerEntity(entity: IEntityRegistration): Promise<void> {
    this.logInfo(`Registering entity: ${entity.id}`, { entity });
    
    this.entityRegistry.set(entity.id, entity);
    
    // 创建实体状态
    const entityState: IEntityState = {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      status: 'registered',
      properties: new Map(),
      metrics: new Map(),
      timestamp: Date.now()
    };
    
    this.entityStates.set(entity.id, entityState);
    this.createEntitySubscriptions(entity);
    
    // 调用生命周期回调
    if (entity.lifecycle?.onRegistered) {
      await entity.lifecycle.onRegistered();
    }
    
    // 更新系统统计
    const currentState = this.entityStates.get(this.id);
    const entityCount = Number(currentState?.properties.get('entityCount') || 1) + 1;
    const registrations = Number(currentState?.metrics.get('registrations') || 0) + 1;
    
    await this.updateEntityState(this.id, {
      properties: new Map([['entityCount', entityCount]]),
      metrics: new Map([['registrations', registrations]])
    });
    
    // 触发事件
    this.eventEmitter.emit('entity.registered', { entity });
    
    this.logInfo(`Entity registered successfully: ${entity.id}`);
  }
  
  // 状态更新接口
  async updateEntityState(entityId: string, updates: Partial<IEntityState>): Promise<void> {
    const currentState = this.entityStates.get(entityId);
    if (!currentState) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    const oldState = { ...currentState };
    const newState = { 
      ...currentState, 
      ...updates, 
      timestamp: Date.now() 
    };
    
    // 检测状态变化
    const changes = this.detectChanges(oldState, newState);
    
    if (changes.hasChanges) {
      this.entityStates.set(entityId, newState);
      await this.triggerSubscriptions(entityId, newState, changes);
      
      // 更新系统统计
      const systemState = this.entityStates.get(this.id);
      const stateUpdates = Number(systemState?.metrics.get('stateUpdates') || 0) + 1;
      await this.updateEntityStateInternal(this.id, {
        metrics: new Map([['stateUpdates', stateUpdates.toString()]])
      });
      
      // 触发事件
      this.eventEmitter.emit('entity.stateChanged', { 
        entityId, 
        oldState, 
        newState, 
        changes 
      });
      
      // 调用生命周期回调
      const registration = this.entityRegistry.get(entityId);
      if (registration?.lifecycle?.onStateChange) {
        await registration.lifecycle.onStateChange(newState, changes);
      }
    }
  }

  // 内部状态更新方法（避免递归调用）
  private async updateEntityStateInternal(entityId: string, updates: Partial<IEntityState>): Promise<void> {
    const currentState = this.entityStates.get(entityId);
    if (!currentState) return;
    
    const newState = { 
      ...currentState, 
      ...updates, 
      timestamp: Date.now() 
    };
    
    this.entityStates.set(entityId, newState);
  }

  // 简单的变化检测
  private detectChanges(oldState: IEntityState, newState: IEntityState): IChangeSet {
    const changes: IChangeSet = {
      hasChanges: false,
      changedProperties: new Set(),
      changes: new Map()
    };

    // 检查基本属性变化
    if (oldState.status !== newState.status) {
      changes.changedProperties.add('status');
      changes.changes.set('status', newState.status);
      changes.hasChanges = true;
    }

    // 检查属性变化
    if (newState.properties) {
      for (const [key, value] of newState.properties.entries()) {
        if (oldState.properties.get(key) !== value) {
          changes.changedProperties.add(key);
          changes.changes.set(key, value);
          changes.hasChanges = true;
        }
      }
    }

    // 检查指标变化
    if (newState.metrics) {
      for (const [key, value] of newState.metrics.entries()) {
        if (oldState.metrics.get(key) !== value) {
          changes.changedProperties.add(key);
          changes.changes.set(key, value);
          changes.hasChanges = true;
        }
      }
    }

    return changes;
  }
  
  // 状态查询接口
  getEntityState(entityId: string): IEntityState | undefined {
    return this.entityStates.get(entityId);
  }
  
  // 获取所有实体状态
  getAllEntityStates(): Map<string, IEntityState> {
    return new Map(this.entityStates);
  }
  
  // 状态订阅接口
  async subscribeToEntity(entityId: string, subscription: ISubscription): Promise<string> {
    const subscriptionId = this.generateSubscriptionId();
    
    if (!this.subscriberRegistry.has(entityId)) {
      this.subscriberRegistry.set(entityId, new Set());
    }
    
    this.subscriberRegistry.get(entityId)!.add({
      ...subscription,
      id: subscriptionId,
      entityId
    });
    
    this.logInfo(`Subscription created for entity: ${entityId}`, { subscriptionId });
    
    return subscriptionId;
  }
  
  // 取消订阅
  async unsubscribeFromEntity(entityId: string, subscriptionId: string): Promise<void> {
    const subscriptions = this.subscriberRegistry.get(entityId);
    if (subscriptions) {
      const subscription = Array.from(subscriptions).find(s => s.id === subscriptionId);
      if (subscription) {
        subscriptions.delete(subscription);
        this.logInfo(`Subscription removed for entity: ${entityId}`, { subscriptionId });
      }
    }
  }
  
  // 页面状态更新
  async updatePageState(updates: Partial<IPageState>): Promise<void> {
    this.pageState = { ...this.pageState, ...updates, lastActivity: Date.now() };
    this.logInfo('Page state updated', { updates });
  }
  
  // 获取页面状态
  getPageState(): IPageState {
    return { ...this.pageState };
  }
  
  // 流状态管理
  async createFlowState(flowId: string, name: string, totalSteps: number): Promise<void> {
    const flowState: IFlowState = {
      id: flowId,
      name,
      status: 'pending',
      currentStep: 0,
      totalSteps,
      startTime: Date.now()
    };
    
    this.flowStates.set(flowId, flowState);
    this.logInfo(`Flow state created: ${flowId}`, { flowState });
  }
  
  async updateFlowState(flowId: string, updates: Partial<IFlowState>): Promise<void> {
    const currentState = this.flowStates.get(flowId);
    if (currentState) {
      this.flowStates.set(flowId, { ...currentState, ...updates });
      this.logInfo(`Flow state updated: ${flowId}`, { updates });
    }
  }
  
  getFlowState(flowId: string): IFlowState | undefined {
    return this.flowStates.get(flowId);
  }
  
  // 健康监控
  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // 每30秒检查一次
  }
  
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];
    
    for (const [entityId, registration] of this.entityRegistry) {
      if (registration.monitoring?.enabled && registration.monitoring.healthCheck) {
        healthCheckPromises.push(this.checkEntityHealth(entityId));
      }
    }
    
    await Promise.all(healthCheckPromises);
    
    // 更新健康检查计数
    const systemState = this.entityStates.get(this.id);
    const healthChecks = Number(systemState?.metrics.get('healthChecks') || 0) + healthCheckPromises.length;
    await this.updateEntityState(this.id, {
      metrics: new Map([['healthChecks', healthChecks.toString()]])
    });
  }
  
  private async checkEntityHealth(entityId: string): Promise<void> {
    const entityState = this.entityStates.get(entityId);
    if (!entityState) return;
    
    const registration = this.entityRegistry.get(entityId);
    if (!registration) return;
    
    // 简单的健康检查 - 检查最后更新时间
    const now = Date.now();
    const timeSinceUpdate = now - entityState.timestamp;
    const maxInactiveTime = (registration.monitoring?.interval || 30000) * 2;
    
    let healthStatus: 'healthy' | 'warning' | 'error' = 'healthy';
    const issues: string[] = [];
    
    if (timeSinceUpdate > maxInactiveTime) {
      healthStatus = 'warning';
      issues.push(`Entity inactive for ${timeSinceUpdate}ms`);
    }
    
    if (timeSinceUpdate > maxInactiveTime * 3) {
      healthStatus = 'error';
      issues.push(`Entity severely inactive for ${timeSinceUpdate}ms`);
    }
    
    await this.updateEntityState(entityId, {
      health: {
        status: healthStatus,
        lastCheck: now,
        issues: issues.length > 0 ? issues : undefined
      }
    });
  }
  
  // 监控实体
  async monitorEntity(entityId: string): Promise<void> {
    const registration = this.entityRegistry.get(entityId);
    if (!registration) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    
    registration.monitoring = {
      enabled: true,
      interval: 5000,
      healthCheck: true,
      ...registration.monitoring
    };
    
    this.entityRegistry.set(entityId, registration);
    
    this.logInfo(`Started monitoring entity: ${entityId}`);
  }
  
  // 获取系统状态报告
  getSystemStatus(): {
    entities: number;
    flows: number;
    activeEntities: number;
    healthyEntities: number;
    uptime: number;
    lastActivity: number;
  } {
    const entities = this.entityRegistry.size;
    const flows = this.flowStates.size;
    const activeEntities = Array.from(this.entityStates.values()).filter(
      state => state.status === 'active'
    ).length;
    const healthyEntities = Array.from(this.entityStates.values()).filter(
      state => state.health?.status === 'healthy'
    ).length;
    const systemState = this.entityStates.get(this.id);
    const uptime = systemState ? Date.now() - systemState.timestamp : 0;
    
    return {
      entities,
      flows,
      activeEntities,
      healthyEntities,
      uptime,
      lastActivity: this.pageState.lastActivity
    };
  }
  
  // 辅助方法
  private createEntitySubscriptions(entity: IEntityRegistration): void {
    if (entity.statePattern?.events) {
      for (const event of entity.statePattern.events) {
        this.eventEmitter.on(event, async (data: any) => {
          this.logInfo(`Event received for ${entity.id}: ${event}`, { data });
        });
      }
    }
  }
  
  private async triggerSubscriptions(entityId: string, newState: IEntityState, changes: IChangeSet): Promise<void> {
    const subscriptions = this.subscriberRegistry.get(entityId);
    if (!subscriptions) return;
    
    const subscriptionPromises = Array.from(subscriptions).map(async (subscription) => {
      try {
        if (subscription.filter && !subscription.filter(newState)) {
          return;
        }
        await subscription.callback(newState, changes);
      } catch (error) {
        this.error(`Subscription callback failed for ${subscription.id}`, { error });
      }
    });
    
    await Promise.all(subscriptionPromises);
  }
  
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // 清理和关闭
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // 清理所有订阅
    this.subscriberRegistry.clear();
    
    // 更新状态
    await this.updateEntityState(this.id, {
      status: 'inactive',
      properties: new Map([['shutdown', true]])
    });
    
    this.logInfo('SystemStateCenter shutdown complete');
  }
}