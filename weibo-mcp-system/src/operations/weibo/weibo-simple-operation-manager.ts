// 简化版微博操作管理器
// 统一管理简化版本的微博相关操作

import { SystemStateCenter } from '../../core/system-state-center';
import { IExecutionContext } from '../../interfaces/core';
import { WeiboPageType, WeiboPageContext, WeiboPageDetector } from './weibo-page-types';
import { BaseOperation } from '../base-operation';
import { WeiboBaseOperation } from './weibo-base-operation';

// 导入简化版本的操作
import {
  SimpleExtractLinksOperation,
  SimpleExtractLinksByTypeOperation,
  SimpleExtractPostLinksOperation,
  SimpleExtractUserLinksOperation,
  SimpleExtractTopicLinksOperation,
  SimpleExtractImageLinksOperation,
  SimpleValidateLinkTypeOperation
} from './weibo-simple-link-extraction';

// 简化的操作注册信息
export interface SimpleOperationRegistration {
  id: string;
  name: string;
  description: string;
  operation: new () => BaseOperation;
  category: string;
  supportedPageTypes: WeiboPageType[];
  requiresLogin: boolean;
  parameters: {
    [key: string]: {
      type: string;
      description: string;
      required: boolean;
      defaultValue?: any;
    };
  };
  resultType: string;
  version: string;
}

// 简化的操作管理器
export class SimpleWeiboOperationManager {
  private stateCenter: SystemStateCenter;
  private operations: Map<string, SimpleOperationRegistration> = new Map();
  private pageTypeOperations: Map<WeiboPageType, string[]> = new Map();

  constructor(stateCenter: SystemStateCenter) {
    this.stateCenter = stateCenter;
    this.initializeOperations();
  }

  private initializeOperations(): void {
    // 注册简化版本的链接提取操作
    this.registerOperation({
      id: 'simple_extract_links',
      name: 'Simple Extract Links',
      description: '提取页面中的所有链接（简化版）',
      operation: SimpleExtractLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        },
        targetTypes: {
          type: 'array',
          description: '目标链接类型数组',
          required: false,
          defaultValue: ['post', 'user', 'topic', 'hashtag', 'image', 'video', 'external']
        },
        containerFilter: {
          type: 'string',
          description: '容器过滤器',
          required: false
        }
      },
      resultType: 'SimpleLinkExtractionResult',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_extract_links_by_type',
      name: 'Simple Extract Links by Type',
      description: '提取指定类型的链接（简化版）',
      operation: SimpleExtractLinksByTypeOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        linkType: {
          type: 'string',
          description: '链接类型',
          required: true
        },
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        }
      },
      resultType: 'SimpleWeiboLink[]',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_extract_post_links',
      name: 'Simple Extract Post Links',
      description: '提取微博帖子链接（简化版）',
      operation: SimpleExtractPostLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        }
      },
      resultType: 'SimpleWeiboLink[]',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_extract_user_links',
      name: 'Simple Extract User Links',
      description: '提取用户链接（简化版）',
      operation: SimpleExtractUserLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        }
      },
      resultType: 'SimpleWeiboLink[]',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_extract_topic_links',
      name: 'Simple Extract Topic Links',
      description: '提取话题链接（简化版）',
      operation: SimpleExtractTopicLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 50
        }
      },
      resultType: 'SimpleWeiboLink[]',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_extract_image_links',
      name: 'Simple Extract Image Links',
      description: '提取图片链接（简化版）',
      operation: SimpleExtractImageLinksOperation,
      category: 'extraction',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS
      ],
      requiresLogin: false,
      parameters: {
        maxCount: {
          type: 'number',
          description: '最大提取数量',
          required: false,
          defaultValue: 100
        }
      },
      resultType: 'SimpleWeiboLink[]',
      version: '1.0.0'
    });

    this.registerOperation({
      id: 'simple_validate_link_type',
      name: 'Simple Validate Link Type',
      description: '验证链接类型（简化版）',
      operation: SimpleValidateLinkTypeOperation,
      category: 'validation',
      supportedPageTypes: [
        WeiboPageType.HOMEPAGE,
        WeiboPageType.USER_PROFILE,
        WeiboPageType.POST_DETAIL,
        WeiboPageType.SEARCH_RESULTS,
        WeiboPageType.HOT_SEARCH
      ],
      requiresLogin: false,
      parameters: {
        url: {
          type: 'string',
          description: '链接URL',
          required: true
        },
        linkType: {
          type: 'string',
          description: '链接类型',
          required: true
        }
      },
      resultType: 'LinkValidationResult',
      version: '1.0.0'
    });
  }

  private registerOperation(registration: SimpleOperationRegistration): void {
    this.operations.set(registration.id, registration);
    
    // 更新页面类型到操作的映射
    registration.supportedPageTypes.forEach(pageType => {
      if (!this.pageTypeOperations.has(pageType)) {
        this.pageTypeOperations.set(pageType, []);
      }
      this.pageTypeOperations.get(pageType)!.push(registration.id);
    });
  }

  // 获取所有操作
  getAllOperations(): SimpleOperationRegistration[] {
    return Array.from(this.operations.values());
  }

  // 获取指定操作
  getOperation(operationId: string): SimpleOperationRegistration | null {
    return this.operations.get(operationId) || null;
  }

  // 获取支持指定页面类型的操作
  getOperationsForPageType(pageType: WeiboPageType): SimpleOperationRegistration[] {
    const operationIds = this.pageTypeOperations.get(pageType) || [];
    return operationIds.map(id => this.operations.get(id)!).filter(Boolean);
  }

  // 搜索操作
  searchOperations(query: string): SimpleOperationRegistration[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.operations.values()).filter(op =>
      op.name.toLowerCase().includes(lowerQuery) ||
      op.description.toLowerCase().includes(lowerQuery)
    );
  }

  // 验证操作参数
  validateOperationParameters(operationId: string, params: any): { valid: boolean; errors: string[] } {
    const operation = this.operations.get(operationId);
    if (!operation) {
      return { valid: false, errors: [`Operation not found: ${operationId}`] };
    }

    const errors: string[] = [];

    // 检查必需参数
    for (const [paramName, paramConfig] of Object.entries(operation.parameters)) {
      if (paramConfig.required && params[paramName] === undefined) {
        errors.push(`Missing required parameter: ${paramName}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // 执行操作
  async executeOperation(operationId: string, context: IExecutionContext, params: any): Promise<any> {
    const operation = this.operations.get(operationId);
    if (!operation) {
      throw new Error(`Operation not found: ${operationId}`);
    }

    // 验证参数
    const validation = this.validateOperationParameters(operationId, params);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    // 创建操作实例
    const operationInstance = new operation.operation();
    
    // 执行操作
    return await operationInstance.execute(context, params);
  }

  // 获取操作统计信息
  getOperationStats(): {
    totalOperations: number;
    operationsByCategory: Record<string, number>;
    operationsByPageType: Record<WeiboPageType, number>;
    operationsRequiringLogin: number;
  } {
    const operationsByCategory: Record<string, number> = {};
    const operationsByPageType: Record<WeiboPageType, number> = {};

    // 按分类统计
    Array.from(this.operations.values()).forEach(op => {
      operationsByCategory[op.category] = (operationsByCategory[op.category] || 0) + 1;
    });

    // 按页面类型统计
    Array.from(this.pageTypeOperations.entries()).forEach(([pageType, operationIds]) => {
      operationsByPageType[pageType] = operationIds.length;
    });

    const operationsRequiringLogin = Array.from(this.operations.values())
      .filter(op => op.requiresLogin).length;

    return {
      totalOperations: this.operations.size,
      operationsByCategory,
      operationsByPageType,
      operationsRequiringLogin
    };
  }
}

// 工厂函数
/**
 * 创建简化版微博操作管理器
 */
export function createSimpleWeiboOperationManager(stateCenter: SystemStateCenter): SimpleWeiboOperationManager {
  return new SimpleWeiboOperationManager(stateCenter);
}

// 常用操作ID常量
export const SIMPLE_WEIBO_OPERATIONS = {
  EXTRACT_LINKS: 'simple_extract_links',
  EXTRACT_LINKS_BY_TYPE: 'simple_extract_links_by_type',
  EXTRACT_POST_LINKS: 'simple_extract_post_links',
  EXTRACT_USER_LINKS: 'simple_extract_user_links',
  EXTRACT_TOPIC_LINKS: 'simple_extract_topic_links',
  EXTRACT_IMAGE_LINKS: 'simple_extract_image_links',
  VALIDATE_LINK_TYPE: 'simple_validate_link_type'
} as const;