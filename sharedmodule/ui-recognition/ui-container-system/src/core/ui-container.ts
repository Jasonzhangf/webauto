/**
 * 高层UI容器系统 - UI容器基类
 * 现代化的UI控件系统核心类
 */

import { v4 as uuidv4 } from 'uuid';
import {
  UIContainer,
  ContainerType,
  BoundingBox,
  ContainerRelationship,
  ContainerProperties,
  ContainerMetadata,
  ContainerAnalysis,
  ActionSuggestion,
  RelationshipType,
  ContainerOperation,
  ContainerOperationType
} from '../types/container';
import { UIControl } from '../types/control';

export abstract class BaseUIContainer implements UIContainer {
  public readonly id: string;
  public type: ContainerType;
  public bounds: BoundingBox;
  public children: UIControl[] = [];
  public parent?: UIContainer;
  public relationships: ContainerRelationship[] = [];
  public properties: ContainerProperties;
  public metadata: ContainerMetadata;

  constructor(
    type: ContainerType,
    bounds: BoundingBox,
    properties: Partial<ContainerProperties> = {}
  ) {
    this.id = uuidv4();
    this.type = type;
    this.bounds = this.normalizeBounds(bounds);
    this.properties = {
      name: properties.name || `${type}-${this.id}`,
      description: properties.description || '',
      ...properties
    };
    this.metadata = {
      created_at: new Date(),
      updated_at: new Date(),
      version: '1.0.0',
      source: 'ai-detected',
      confidence: 0.8,
      analysis_level: 'basic',
      tags: [type],
      annotations: []
    };
  }

  // 抽象方法 - 子类必须实现
  abstract analyzeIntelligence(): Promise<ContainerAnalysis>;
  abstract getSuggestedActions(): ActionSuggestion[];
  abstract getChildControls(): UIControl[];
  abstract validateContainer(): ValidationResult;

  // 容器管理方法
  public addChild(control: UIControl): void {
    if (!this.children.find(c => c.id === control.id)) {
      this.children.push(control);
      this.metadata.updated_at = new Date();
    }
  }

  public removeChild(controlId: string): boolean {
    const index = this.children.findIndex(c => c.id === controlId);
    if (index !== -1) {
      this.children.splice(index, 1);
      this.metadata.updated_at = new Date();
      return true;
    }
    return false;
  }

  public setParent(parent: UIContainer): void {
    this.parent = parent;
    this.metadata.updated_at = new Date();
  }

  // 关系管理方法
  public addRelationship(
    target: UIContainer,
    type: RelationshipType,
    strength: number = 0.5,
    properties?: Record<string, any>
  ): void {
    const relationship: ContainerRelationship = {
      id: uuidv4(),
      type,
      target,
      strength: Math.max(0, Math.min(1, strength)),
      properties
    };

    // 检查是否已存在相同类型的关系
    const existingIndex = this.relationships.findIndex(
      r => r.type === type && r.target.id === target.id
    );

    if (existingIndex !== -1) {
      this.relationships[existingIndex] = relationship;
    } else {
      this.relationships.push(relationship);
    }

    this.metadata.updated_at = new Date();
  }

  public removeRelationship(relationshipId: string): boolean {
    const index = this.relationships.findIndex(r => r.id === relationshipId);
    if (index !== -1) {
      this.relationships.splice(index, 1);
      this.metadata.updated_at = new Date();
      return true;
    }
    return false;
  }

  public findRelatedContainers(type?: RelationshipType): UIContainer[] {
    if (type) {
      return this.relationships
        .filter(r => r.type === type)
        .map(r => r.target);
    }
    return this.relationships.map(r => r.target);
  }

  // 空间分析方法
  public calculateArea(): number {
    return this.bounds.width * this.bounds.height;
  }

  public containsPoint(x: number, y: number): boolean {
    return x >= this.bounds.x1 &&
           x <= this.bounds.x2 &&
           y >= this.bounds.y1 &&
           y <= this.bounds.y2;
  }

  public overlapsWith(other: UIContainer): boolean {
    return !(this.bounds.x2 < other.bounds.x1 ||
             this.bounds.x1 > other.bounds.x2 ||
             this.bounds.y2 < other.bounds.y1 ||
             this.bounds.y1 > other.bounds.y2);
  }

  public getDistanceTo(other: UIContainer): number {
    const centerX1 = this.bounds.x1 + this.bounds.width / 2;
    const centerY1 = this.bounds.y1 + this.bounds.height / 2;
    const centerX2 = other.bounds.x1 + other.bounds.width / 2;
    const centerY2 = other.bounds.y1 + other.bounds.height / 2;

    return Math.sqrt(
      Math.pow(centerX2 - centerX1, 2) + Math.pow(centerY2 - centerY1, 2)
    );
  }

  // 属性更新方法
  public updateBounds(bounds: Partial<BoundingBox>): void {
    this.bounds = { ...this.bounds, ...bounds };
    this.normalizeBounds(this.bounds);
    this.metadata.updated_at = new Date();
  }

  public updateProperties(properties: Partial<ContainerProperties>): void {
    this.properties = { ...this.properties, ...properties };
    this.metadata.updated_at = new Date();
  }

  public addTag(tag: string): void {
    if (!this.metadata.tags.includes(tag)) {
      this.metadata.tags.push(tag);
      this.metadata.updated_at = new Date();
    }
  }

  public removeTag(tag: string): boolean {
    const index = this.metadata.tags.indexOf(tag);
    if (index !== -1) {
      this.metadata.tags.splice(index, 1);
      this.metadata.updated_at = new Date();
      return true;
    }
    return false;
  }

  // 容器操作方法
  public async executeOperation(
    operation: ContainerOperation,
    params?: Record<string, any>
  ): Promise<ContainerOperationResult> {
    const startTime = Date.now();

    try {
      // 验证前置条件
      if (operation.preconditions) {
        for (const condition of operation.preconditions) {
          if (!await this.evaluatePrecondition(condition)) {
            throw new Error(`Precondition failed: ${condition}`);
          }
        }
      }

      // 执行操作
      const result = await this.performOperation(operation, params);

      return {
        success: true,
        operation_id: operation.id,
        container_id: this.id,
        execution_time: Date.now() - startTime,
        result_data: result
      };
    } catch (error) {
      return {
        success: false,
        operation_id: operation.id,
        container_id: this.id,
        execution_time: Date.now() - startTime,
        error_message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  protected abstract performOperation(
    operation: ContainerOperation,
    params?: Record<string, any>
  ): Promise<any>;

  protected async evaluatePrecondition(condition: string): Promise<boolean> {
    // 默认实现 - 子类可以重写
    switch (condition) {
      case 'has_children':
        return this.children.length > 0;
      case 'is_visible':
        return this.properties.visibility !== 'hidden';
      case 'is_enabled':
        return this.properties.enabled !== false;
      default:
        return true;
    }
  }

  // 序列化方法
  public toJSON(): UIContainer {
    return {
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      children: this.children,
      parent: this.parent,
      relationships: this.relationships,
      properties: this.properties,
      metadata: this.metadata
    };
  }

  public static fromJSON(data: UIContainer): BaseUIContainer {
    // 根据类型创建相应的容器实例
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

  // 调试方法
  public toString(): string {
    return `${this.type}(${this.id}) [${this.bounds.x1},${this.bounds.y1},${this.bounds.x2},${this.bounds.y2}]`;
  }

  public getDebugInfo(): ContainerDebugInfo {
    return {
      id: this.id,
      type: this.type,
      bounds: this.bounds,
      children_count: this.children.length,
      relationships_count: this.relationships.length,
      properties: this.properties,
      metadata: this.metadata,
      parent_id: this.parent?.id,
      related_containers: this.relationships.map(r => ({
        id: r.target.id,
        type: r.type,
        strength: r.strength
      }))
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

export interface ContainerOperationResult {
  success: boolean;
  operation_id: string;
  container_id: string;
  execution_time: number;
  result_data?: any;
  error_message?: string;
  side_effects?: string[];
}

export interface ContainerDebugInfo {
  id: string;
  type: ContainerType;
  bounds: BoundingBox;
  children_count: number;
  relationships_count: number;
  properties: ContainerProperties;
  metadata: ContainerMetadata;
  parent_id?: string;
  related_containers: Array<{
    id: string;
    type: RelationshipType;
    strength: number;
  }>;
}