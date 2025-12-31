/**
 * BindingRegistry - Step 4
 * 
 * 允许在运行时注册规则，例如：
 * "当收到消息 ACTION_NEXT_PAGE 时，找到当前页面的 MainList 容器，并执行 ClickNext 操作"
 */

export interface BindingRule {
  id: string;
  trigger: {
    type: 'message' | 'event' | 'container_state';
    pattern: string; // e.g., "ACTION_NEXT_PAGE", "container:*:discovered"
  };
  target: {
    containerType?: string;
    containerId?: string;
    selector?: (graph: any) => string | null; // 查找逻辑
  };
  action: {
    operationType: string; // e.g., "click", "scroll"
    config?: Record<string, any>;
  };
  condition?: (context: any) => boolean;
}

export class BindingRegistry {
  private rules: Map<string, BindingRule> = new Map();
  private eventBus: any; // 可选的 EventBus 引用

  constructor(eventBus?: any) {
    this.eventBus = eventBus;
  }

  /**
   * 注册绑定规则
   */
  register(rule: BindingRule): void {
    if (this.rules.has(rule.id)) {
      console.warn(`[BindingRegistry] Rule ${rule.id} already exists, overwriting.`);
    }
    this.rules.set(rule.id, rule);
    
    // 如果有 EventBus，自动监听触发器
    if (this.eventBus && rule.trigger.type === 'event') {
      this.eventBus.on(rule.trigger.pattern, async (data: any) => {
        await this.executeRule(rule, data);
      });
    }
  }

  /**
   * 移除绑定规则
   */
  unregister(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * 获取所有规则
   */
  getRules(): BindingRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 根据触发器查找规则
   */
  findRulesByTrigger(triggerType: string, pattern?: string): BindingRule[] {
    return Array.from(this.rules.values()).filter(rule => {
      if (rule.trigger.type !== triggerType) return false;
      if (pattern && !this.matchPattern(rule.trigger.pattern, pattern)) return false;
      return true;
    });
  }

  /**
   * 执行绑定规则
   */
  async executeRule(rule: BindingRule, context: any): Promise<any> {
    // 检查条件
    if (rule.condition && !rule.condition(context)) {
      console.log(`[BindingRegistry] Rule ${rule.id} condition not met`);
      return { success: false, reason: 'condition_not_met' };
    }

    // 查找目标容器
    let targetContainerId: string | null = null;
    if (rule.target.containerId) {
      targetContainerId = rule.target.containerId;
    } else if (rule.target.selector && context.graph) {
      targetContainerId = rule.target.selector(context.graph);
    }

    if (!targetContainerId) {
      console.warn(`[BindingRegistry] Rule ${rule.id} failed to find target container`);
      return { success: false, reason: 'target_not_found' };
    }

    // 执行操作（需要外部提供执行器）
    console.log(`[BindingRegistry] Executing rule ${rule.id} on container ${targetContainerId} with action ${rule.action.operationType}`);
    
    // 发送事件到 EventBus（如果有）
    if (this.eventBus) {
      await this.eventBus.emit(`operation:${targetContainerId}:execute`, {
        containerId: targetContainerId,
        operationType: rule.action.operationType,
        config: rule.action.config || {},
        sourceRule: rule.id
      });
    }

    return { success: true, targetContainerId, operationType: rule.action.operationType };
  }

  /**
   * 处理接收到的消息（手动触发）
   */
  async handleMessage(messageName: string, payload: any, context: any): Promise<any[]> {
    const rules = this.findRulesByTrigger('message', messageName);
    const results = [];
    for (const rule of rules) {
      const result = await this.executeRule(rule, { ...context, message: payload });
      results.push(result);
    }
    return results;
  }

  /**
   * 简单的通配符匹配
   */
  private matchPattern(pattern: string, value: string): boolean {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }
}

export default BindingRegistry;
