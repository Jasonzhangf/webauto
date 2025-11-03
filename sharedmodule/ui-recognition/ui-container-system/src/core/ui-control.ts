/**
 * 高层UI容器系统 - UI控件基类
 * 现代化的UI控件系统核心类
 */

import { v4 as uuidv4 } from 'uuid';
import {
  UIControl,
  ControlType,
  BoundingBox,
  ControlProperties,
  ControlMetadata,
  Operation,
  OperationResult,
  SmartOperation,
  InteractionPattern,
  ValidationRule,
  DataType
} from '../types/control';

export abstract class BaseUIControl implements UIControl {
  public readonly id: string;
  public type: ControlType;
  public bounds: BoundingBox;
  public container: string;  // 所属容器ID
  public properties: ControlProperties;
  public operations: Operation[];
  public metadata: ControlMetadata;

  constructor(
    type: ControlType,
    bounds: BoundingBox,
    containerId: string,
    properties: Partial<ControlProperties> = {}
  ) {
    this.id = uuidv4();
    this.type = type;
    this.bounds = this.normalizeBounds(bounds);
    this.container = containerId;
    this.properties = {
      name: properties.name || `${type}-${this.id}`,
      label: properties.label || '',
      value: properties.value,
      enabled: properties.enabled !== false,
      visible: properties.visible !== false,
      ...properties
    };
    this.operations = this.getDefaultOperations();
    this.metadata = {
      created_at: new Date(),
      updated_at: new Date(),
      version: '1.0.0',
      source: 'ai-detected',
      confidence: 0.8,
      tags: [type],
      annotations: [],
      interactions: []
    };
  }

  // 抽象方法 - 子类必须实现
  abstract getPurpose(): string;
  abstract getInteractions(): InteractionPattern[];
  abstract validateValue(value: any): ValidationResult;
  abstract getDefaultOperations(): Operation[];

  // 控件操作方法
  public getAvailableOperations(): Operation[] {
    return this.operations.filter(op => this.isOperationAvailable(op));
  }

  public async executeOperation(
    operation: Operation,
    params?: Record<string, any>
  ): Promise<OperationResult> {
    const startTime = Date.now();

    try {
      // 验证操作
      if (!this.validateOperation(operation)) {
        throw new Error(`Operation ${operation.type} is not valid for this control`);
      }

      // 记录交互历史
      const interaction = {
        timestamp: new Date(),
        action: operation.type,
        parameters: params,
        result: 'success' as const,
        duration: 0
      };

      // 执行操作
      const result = await this.performOperation(operation, params);

      interaction.duration = Date.now() - startTime;
      this.metadata.interactions.push(interaction);
      this.metadata.updated_at = new Date();

      return {
        success: true,
        operation_id: operation.id,
        control_id: this.id,
        execution_time: Date.now() - startTime,
        result_data: result
      };
    } catch (error) {
      // 记录失败的交互
      this.metadata.interactions.push({
        timestamp: new Date(),
        action: operation.type,
        parameters: params,
        result: 'failure',
        duration: Date.now() - startTime
      });
      this.metadata.updated_at = new Date();

      return {
        success: false,
        operation_id: operation.id,
        control_id: this.id,
        execution_time: Date.now() - startTime,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public validateOperation(operation: Operation): boolean {
    // 检查控件状态
    if (this.properties.enabled === false) {
      return false;
    }

    if (this.properties.visible === false) {
      return false;
    }

    // 检查操作类型是否支持
    return this.operations.some(op => op.type === operation.type);
  }

  protected abstract performOperation(
    operation: Operation,
    params?: Record<string, any>
  ): Promise<any>;

  // 智能操作方法
  public async smartExecute(
    intent: string,
    context?: Record<string, any>
  ): Promise<OperationResult> {
    const smartOperation = await this.createSmartOperation(intent, context);
    return this.executeOperation(smartOperation);
  }

  protected async createSmartOperation(
    intent: string,
    context?: Record<string, any>
  ): Promise<SmartOperation> {
    // 分析意图并创建智能操作
    const operationType = this.inferOperationType(intent);
    const parameters = this.inferParameters(intent, context);

    return {
      id: uuidv4(),
      type: operationType,
      name: `Smart ${operationType}`,
      description: `AI-generated operation for intent: ${intent}`,
      parameters,
      ai_suggested: true,
      confidence: 0.85,
      context_requirements: context ? Object.keys(context) : [],
      alternative_operations: this.getAlternativeOperations(operationType),
      risk_level: this.assessOperationRisk(operationType, parameters)
    };
  }

  protected abstract inferOperationType(intent: string): string;
  protected abstract inferParameters(intent: string, context?: Record<string, any>): any;
  protected abstract getAlternativeOperations(operationType: string): Operation[];
  protected abstract assessOperationRisk(operationType: string, parameters: any): 'low' | 'medium' | 'high';

  // 值操作方法
  public getValue(): any {
    return this.properties.value;
  }

  public async setValue(value: any): Promise<boolean> {
    try {
      // 验证值
      const validation = this.validateValue(value);
      if (!validation.valid) {
        throw new Error(`Value validation failed: ${validation.errors.join(', ')}`);
      }

      const oldValue = this.properties.value;
      this.properties.value = value;
      this.metadata.updated_at = new Date();

      // 触发值变更事件
      await this.onValueChanged(oldValue, value);
      return true;
    } catch (error) {
      console.error(`Failed to set value for control ${this.id}:`, error);
      return false;
    }
  }

  protected async onValueChanged(oldValue: any, newValue: any): Promise<void> {
    // 子类可以重写此方法来处理值变更
  }

  // 属性更新方法
  public updateBounds(bounds: Partial<BoundingBox>): void {
    this.bounds = { ...this.bounds, ...bounds };
    this.normalizeBounds(this.bounds);
    this.metadata.updated_at = new Date();
  }

  public updateProperties(properties: Partial<ControlProperties>): void {
    this.properties = { ...this.properties, ...properties };
    this.metadata.updated_at = new Date();
  }

  public async setEnabled(enabled: boolean): Promise<void> {
    this.properties.enabled = enabled;
    this.metadata.updated_at = new Date();
    await this.onEnabledChanged(enabled);
  }

  public async setVisible(visible: boolean): Promise<void> {
    this.properties.visible = visible;
    this.metadata.updated_at = new Date();
    await this.onVisibleChanged(visible);
  }

  protected async onEnabledChanged(enabled: boolean): Promise<void> {
    // 子类可以重写
  }

  protected async onVisibleChanged(visible: boolean): Promise<void> {
    // 子类可以重写
  }

  // 验证方法
  public validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 基础验证
    if (!this.properties.name) {
      errors.push({
        field: 'name',
        message: 'Control name is required',
        severity: 'error'
      });
    }

    // 类型特定验证
    const typeValidation = this.validateType();
    errors.push(...typeValidation.errors);
    warnings.push(...typeValidation.warnings);

    // 值验证
    if (this.properties.value !== undefined && this.properties.value !== null) {
      const valueValidation = this.validateValue(this.properties.value);
      if (!valueValidation.valid) {
        errors.push(...valueValidation.errors);
      }
      warnings.push(...valueValidation.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  protected abstract validateType(): ValidationResult;

  // 状态查询方法
  public isEnabled(): boolean {
    return this.properties.enabled !== false;
  }

  public isVisible(): boolean {
    return this.properties.visible !== false;
  }

  public isFocused(): boolean {
    return this.properties.focused === true;
  }

  public isValid(): boolean {
    return this.properties.valid !== false;
  }

  public isRequired(): boolean {
    return this.properties.required === true;
  }

  // 交互统计方法
  public getInteractionStats(): InteractionStats {
    const stats: InteractionStats = {
      total_interactions: this.metadata.interactions.length,
      success_rate: 0,
      average_execution_time: 0,
      most_common_action: '',
      action_frequency: {},
      recent_errors: []
    };

    if (this.metadata.interactions.length === 0) {
      return stats;
    }

    // 计算成功率
    const successCount = this.metadata.interactions.filter(i => i.result === 'success').length;
    stats.success_rate = successCount / this.metadata.interactions.length;

    // 计算平均执行时间
    const totalTime = this.metadata.interactions.reduce((sum, i) => sum + i.duration, 0);
    stats.average_execution_time = totalTime / this.metadata.interactions.length;

    // 统计操作频率
    this.metadata.interactions.forEach(interaction => {
      const action = interaction.action;
      stats.action_frequency[action] = (stats.action_frequency[action] || 0) + 1;
    });

    // 找出最常见的操作
    const mostFrequent = Object.entries(stats.action_frequency)
      .sort(([,a], [,b]) => b - a)[0];
    if (mostFrequent) {
      stats.most_common_action = mostFrequent[0];
    }

    // 最近的错误
    stats.recent_errors = this.metadata.interactions
      .filter(i => i.result === 'failure')
      .slice(-5)
      .map(i => i.action);

    return stats;
  }

  // 序列化方法
  public toJSON(): UIControl {
    return {
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      container: this.container,
      properties: this.properties,
      operations: this.operations,
      metadata: this.metadata
    };
  }

  public static fromJSON(data: UIControl): BaseUIControl {
    // 根据类型创建相应的控件实例
    // 这里需要在具体实现中完成
    throw new Error('fromJSON must be implemented in subclasses');
  }

  // 工具方法
  private normalizeBounds(bounds: BoundingBox): BoundingBox {
    return {
      x1: Math.min(bounds.x1, bounds.x2),
      y1: Math.min(bounds.y1, bounds.y2),
      x2: Math.max(bounds.x1, bounds.x2),
      y2: Math.max(bounds.y1, bounds.y2),
      width: Math.abs(bounds.x2 - bounds.x1),
      height: Math.abs(bounds.y2 - bounds.y1)
    };
  }

  protected isOperationAvailable(operation: Operation): boolean {
    // 检查操作的前置条件
    if (operation.preconditions) {
      for (const condition of operation.preconditions) {
        if (!this.evaluateCondition(condition)) {
          return false;
        }
      }
    }
    return true;
  }

  protected evaluateCondition(condition: string): boolean {
    // 简单的条件评估 - 子类可以扩展
    switch (condition) {
      case 'enabled':
        return this.isEnabled();
      case 'visible':
        return this.isVisible();
      case 'focused':
        return this.isFocused();
      case 'valid':
        return this.isValid();
      case 'has_value':
        return this.properties.value !== undefined && this.properties.value !== null && this.properties.value !== '';
      default:
        return true;
    }
  }

  // 调试方法
  public toString(): string {
    return `${this.type}(${this.id}) [${this.bounds.x1},${this.bounds.y1},${this.bounds.x2},${this.bounds.y2}] = ${this.properties.value}`;
  }

  public getDebugInfo(): ControlDebugInfo {
    return {
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      container: this.container,
      properties: this.properties,
      operations: this.operations.map(op => ({
        id: op.id,
        type: op.type,
        name: op.name,
        risk_level: op.risk_level
      })),
      metadata: this.metadata,
      interaction_stats: this.getInteractionStats(),
      validation_result: this.validate()
    };
  }
}

// 辅助接口
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface InteractionStats {
  total_interactions: number;
  success_rate: number;
  average_execution_time: number;
  most_common_action: string;
  action_frequency: Record<string, number>;
  recent_errors: string[];
}

export interface ControlDebugInfo {
  id: string;
  type: ControlType;
  bounds: BoundingBox;
  container: string;
  properties: ControlProperties;
  operations: Array<{
    id: string;
    type: string;
    name: string;
    risk_level: 'low' | 'medium' | 'high';
  }>;
  metadata: ControlMetadata;
  interaction_stats: InteractionStats;
  validation_result: ValidationResult;
}