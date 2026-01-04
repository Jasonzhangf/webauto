import { ContainerVariableManager } from './ContainerVariableManager.js';
import { MessageBusService } from './MessageBusService.js';

/**
 * 比较运算符
 */
export type ComparisonOperator = 
  | 'eq'        // 等于
  | 'neq'       // 不等于
  | 'gt'        // 大于
  | 'gte'       // 大于等于
  | 'lt'        // 小于
  | 'lte'       // 小于等于
  | 'contains'  // 包含
  | 'notContains' // 不包含
  | 'startsWith' // 以...开头
  | 'endsWith'   // 以...结尾
  | 'matches'    // 正则匹配
  | 'in'         // 在集合中
  | 'notIn'      // 不在集合中
  | 'isNull'     // 为空
  | 'isNotNull'; // 不为空

/**
 * 变量条件定义
 */
export interface VariableCondition {
  type: 'variable';
  variableName: string;
  operator: ComparisonOperator;
  value?: any; // 期望值
  scope?: 'local' | 'root'; // 变量作用域，默认为 local
}

/**
 * 表达式条件定义
 */
export interface ExpressionCondition {
  type: 'expression';
  expression: string; // JavaScript 表达式，如 "vars.count > 10 && vars.isActive"
}

/**
 * 消息条件定义
 */
export interface MessageCondition {
  type: 'message';
  messageName: string; // 消息名称或通配符
  payloadFilter?: Record<string, any>; // 消息载荷过滤条件
}

/**
 * 组合条件定义
 */
export interface CompositeCondition {
  type: 'composite';
  operator: 'and' | 'or' | 'not';
  conditions: TriggerCondition[];
}

/**
 * 触发条件类型
 */
export type TriggerCondition = 
  | VariableCondition 
  | ExpressionCondition 
  | MessageCondition 
  | CompositeCondition;

/**
 * 条件评估上下文
 */
export interface EvaluationContext {
  containerId: string;
  rootContainerId?: string;
  message?: {
    name: string;
    payload: any;
  };
  triggerTime: number;
}

/**
 * 触发条件评估器
 * 负责评估各种触发条件是否满足
 */
export class TriggerConditionEvaluator {
  private variableManager: ContainerVariableManager;

  constructor(variableManager: ContainerVariableManager) {
    this.variableManager = variableManager;
  }

  /**
   * 评估条件是否满足
   * @param condition 触发条件
   * @param context 评估上下文
   */
  public evaluate(condition: TriggerCondition, context: EvaluationContext): boolean {
    switch (condition.type) {
      case 'variable':
        return this.evaluateVariableCondition(condition, context);
      case 'expression':
        return this.evaluateExpressionCondition(condition, context);
      case 'message':
        return this.evaluateMessageCondition(condition, context);
      case 'composite':
        return this.evaluateCompositeCondition(condition, context);
      default:
        console.warn(`[TriggerConditionEvaluator] Unknown condition type: ${(condition as any).type}`);
        return false;
    }
  }

  /**
   * 评估变量条件
   */
  private evaluateVariableCondition(condition: VariableCondition, context: EvaluationContext): boolean {
    const scope = condition.scope || 'local';
    let targetContainerId = context.containerId;
    
    if (scope === 'root') {
      if (!context.rootContainerId) {
        console.warn('[TriggerConditionEvaluator] Root container ID missing for root variable condition');
        return false;
      }
      targetContainerId = context.rootContainerId;
    }

    const actualValue = this.variableManager.getVariable(targetContainerId, condition.variableName);
    return this.compareValues(actualValue, condition.operator, condition.value);
  }

  /**
   * 评估表达式条件
   */
  private evaluateExpressionCondition(condition: ExpressionCondition, context: EvaluationContext): boolean {
    try {
      // 准备表达式执行上下文
      const localVars = this.variableManager.getAllVariables(context.containerId);
      const rootVars = context.rootContainerId ? 
        this.variableManager.getAllVariables(context.rootContainerId) : {};
      
      const message = context.message || null;
      
      // 创建安全的执行函数
      // 注意：这里使用 Function 构造函数有潜在安全风险，但在受控环境（如 Sandbox）中可控
      // 实际生产中可能需要更安全的表达式解析器
      const executor = new Function('vars', 'root', 'msg', `return ${condition.expression}`);
      
      return !!executor(localVars, rootVars, message);
    } catch (error) {
      console.error('[TriggerConditionEvaluator] Expression evaluation error:', error);
      return false;
    }
  }

  /**
   * 评估消息条件
   */
  private evaluateMessageCondition(condition: MessageCondition, context: EvaluationContext): boolean {
    // 如果上下文中没有消息，则消息条件不满足
    if (!context.message) {
      return false;
    }

    // 检查消息名称匹配（支持简单通配符 *）
    if (!this.matchMessageName(condition.messageName, context.message.name)) {
      return false;
    }

    // 检查载荷过滤条件
    if (condition.payloadFilter) {
      return this.matchPayload(condition.payloadFilter, context.message.payload);
    }

    return true;
  }

  /**
   * 评估组合条件
   */
  private evaluateCompositeCondition(condition: CompositeCondition, context: EvaluationContext): boolean {
    if (!condition.conditions || condition.conditions.length === 0) {
      return true; // 空组合条件默认为真？或者视具体业务逻辑而定
    }

    switch (condition.operator) {
      case 'and':
        return condition.conditions.every(c => this.evaluate(c, context));
      case 'or':
        return condition.conditions.some(c => this.evaluate(c, context));
      case 'not':
        // not 操作符通常只带一个子条件
        return !this.evaluate(condition.conditions[0], context);
      default:
        return false;
    }
  }

  /**
   * 比较值
   */
  private compareValues(actual: any, operator: ComparisonOperator, expected: any): boolean {
    switch (operator) {
      case 'eq':
        return actual == expected; // 宽松相等
      case 'neq':
        return actual != expected;
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'contains':
        return String(actual).includes(String(expected));
      case 'notContains':
        return !String(actual).includes(String(expected));
      case 'startsWith':
        return String(actual).startsWith(String(expected));
      case 'endsWith':
        return String(actual).endsWith(String(expected));
      case 'matches':
        return new RegExp(String(expected)).test(String(actual));
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'notIn':
        return Array.isArray(expected) && !expected.includes(actual);
      case 'isNull':
        return actual === null || actual === undefined;
      case 'isNotNull':
        return actual !== null && actual !== undefined;
      default:
        return false;
    }
  }

  /**
   * 匹配消息名称（支持通配符）
   */
  private matchMessageName(pattern: string, actual: string): boolean {
    if (pattern === actual) return true;
    if (pattern === '*') return true;
    
    // 简单的通配符支持：MSG_CONTAINER_*
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return actual.startsWith(prefix);
    }
    
    return false;
  }

  /**
   * 匹配消息载荷
   */
  private matchPayload(filter: Record<string, any>, payload: any): boolean {
    if (!payload) return false;
    
    for (const [key, expectedValue] of Object.entries(filter)) {
      if (payload[key] != expectedValue) { // 宽松相等
        return false;
      }
    }
    
    return true;
  }
}
