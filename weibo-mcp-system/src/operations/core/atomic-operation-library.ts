// 原子操作库管理和发现系统
// 提供原子操作的注册、发现、查询和管理功能

import { AtomicOperation } from './atomic-operation-engine';

// 原子操作元数据
export interface AtomicOperationMetadata {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author?: string;
  tags: string[];
  complexity: 'simple' | 'medium' | 'complex';
  usage: 'high' | 'medium' | 'low';
  dependencies?: string[];
  examples?: Array<{
    name: string;
    description: string;
    parameters: any;
  }>;
  lastUsed?: Date;
  useCount: number;
}

// 操作库分类
export interface OperationCategory {
  name: string;
  description: string;
  operations: string[];
  color: string;
}

// 操作库统计
export interface OperationLibraryStats {
  totalOperations: number;
  byCategory: Record<string, number>;
  byComplexity: Record<string, number>;
  byUsage: Record<string, number>;
  mostUsed: AtomicOperationMetadata[];
  leastUsed: AtomicOperationMetadata[];
  recentOperations: AtomicOperationMetadata[];
}

// 操作库管理器
export class AtomicOperationLibrary {
  private operations: Map<string, AtomicOperationMetadata> = new Map();
  private categories: Map<string, OperationCategory> = new Map();
  private usageHistory: Array<{
    operationId: string;
    timestamp: Date;
    success: boolean;
    executionTime: number;
  }> = [];

  constructor() {
    this.initializeCategories();
    this.initializeDefaultOperations();
  }

  // 注册原子操作
  registerOperation(operation: AtomicOperation, metadata: Partial<AtomicOperationMetadata> = {}): void {
    const fullMetadata: AtomicOperationMetadata = {
      id: operation.id,
      name: operation.name,
      description: operation.description,
      category: operation.category,
      version: operation.version,
      tags: metadata.tags || [],
      complexity: metadata.complexity || 'simple',
      usage: metadata.usage || 'medium',
      dependencies: metadata.dependencies || [],
      examples: metadata.examples || [],
      useCount: 0,
      ...metadata
    };

    this.operations.set(operation.id, fullMetadata);
    this.addToCategory(operation.category, operation.id);
    this.logInfo(`已注册原子操作: ${operation.id}`);
  }

  // 获取操作元数据
  getOperationMetadata(operationId: string): AtomicOperationMetadata | undefined {
    return this.operations.get(operationId);
  }

  // 获取所有操作
  getAllOperations(): AtomicOperationMetadata[] {
    return Array.from(this.operations.values());
  }

  // 按类别获取操作
  getOperationsByCategory(category: string): AtomicOperationMetadata[] {
    return Array.from(this.operations.values()).filter(op => op.category === category);
  }

  // 搜索操作
  searchOperations(query: string): AtomicOperationMetadata[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.operations.values()).filter(op =>
      op.name.toLowerCase().includes(lowerQuery) ||
      op.description.toLowerCase().includes(lowerQuery) ||
      op.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      op.id.toLowerCase().includes(lowerQuery)
    );
  }

  // 按标签获取操作
  getOperationsByTag(tag: string): AtomicOperationMetadata[] {
    return Array.from(this.operations.values()).filter(op =>
      op.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase())
    );
  }

  // 获取推荐操作
  getRecommendedOperations(context: string, limit: number = 5): AtomicOperationMetadata[] {
    // 基于上下文推荐相关操作
    const contextOps = this.searchOperations(context);
    const tagOps = this.getOperationsByTag(context);
    
    // 合并并去重
    const allOps = [...contextOps, ...tagOps];
    const uniqueOps = Array.from(new Map(allOps.map(op => [op.id, op])).values());
    
    // 按使用频率排序
    return uniqueOps
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  // 记录操作使用
  recordUsage(operationId: string, success: boolean, executionTime: number): void {
    const metadata = this.operations.get(operationId);
    if (metadata) {
      metadata.useCount++;
      metadata.lastUsed = new Date();
    }

    this.usageHistory.push({
      operationId,
      timestamp: new Date(),
      success,
      executionTime
    });

    // 保持历史记录在合理范围内
    if (this.usageHistory.length > 1000) {
      this.usageHistory = this.usageHistory.slice(-500);
    }
  }

  // 获取操作统计
  getStats(): OperationLibraryStats {
    const allOps = Array.from(this.operations.values());
    
    const byCategory = allOps.reduce((acc, op) => {
      acc[op.category] = (acc[op.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byComplexity = allOps.reduce((acc, op) => {
      acc[op.complexity] = (acc[op.complexity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byUsage = allOps.reduce((acc, op) => {
      acc[op.usage] = (acc[op.usage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedByUsage = [...allOps].sort((a, b) => b.useCount - a.useCount);
    const recentOperations = [...allOps]
      .filter(op => op.lastUsed)
      .sort((a, b) => b.lastUsed!.getTime() - a.lastUsed!.getTime());

    return {
      totalOperations: allOps.length,
      byCategory,
      byComplexity,
      byUsage,
      mostUsed: sortedByUsage.slice(0, 10),
      leastUsed: sortedByUsage.slice(-10).reverse(),
      recentOperations: recentOperations.slice(0, 10)
    };
  }

  // 获取使用模式分析
  getUsagePatterns(): any {
    const recentUsage = this.usageHistory.slice(-100);
    
    const successRate = recentUsage.reduce((acc, record) => 
      acc + (record.success ? 1 : 0), 0) / recentUsage.length || 0;

    const avgExecutionTime = recentUsage.reduce((acc, record) => 
      acc + record.executionTime, 0) / recentUsage.length || 0;

    const popularOperations = recentUsage.reduce((acc, record) => {
      acc[record.operationId] = (acc[record.operationId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      successRate,
      avgExecutionTime,
      popularOperations: Object.entries(popularOperations)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      totalRecentUsage: recentUsage.length
    };
  }

  // 获取操作详情
  getOperationDetails(operationId: string): any {
    const metadata = this.operations.get(operationId);
    if (!metadata) return null;

    const usageStats = this.usageHistory.filter(record => 
      record.operationId === operationId
    );

    return {
      metadata,
      stats: {
        totalUses: usageStats.length,
        successfulUses: usageStats.filter(r => r.success).length,
        avgExecutionTime: usageStats.length > 0 
          ? usageStats.reduce((sum, r) => sum + r.executionTime, 0) / usageStats.length 
          : 0,
        lastUsed: metadata.lastUsed,
        successRate: usageStats.length > 0 
          ? usageStats.filter(r => r.success).length / usageStats.length 
          : 0
      },
      relatedOperations: this.getRecommendedOperations(metadata.name, 3)
    };
  }

  // 导出操作库配置
  exportConfiguration(): any {
    return {
      operations: Array.from(this.operations.values()),
      categories: Array.from(this.categories.values()),
      stats: this.getStats(),
      exportedAt: new Date().toISOString()
    };
  }

  // 生成操作文档
  generateDocumentation(): string {
    const stats = this.getStats();
    let doc = `# 原子操作库文档\n\n`;
    doc += `## 统计信息\n\n`;
    doc += `- 总操作数: ${stats.totalOperations}\n`;
    doc += `- 分类数: ${Object.keys(stats.byCategory).length}\n`;
    doc += `- 生成时间: ${new Date().toISOString()}\n\n`;

    doc += `## 操作分类\n\n`;
    Array.from(this.categories.values()).forEach(category => {
      doc += `### ${category.name}\n`;
      doc += `${category.description}\n\n`;
      doc += `**包含操作** (${category.operations.length}个):\n`;
      category.operations.forEach(opId => {
        const op = this.operations.get(opId);
        if (op) {
          doc += `- \`${op.id}\` - ${op.name}\n`;
        }
      });
      doc += `\n`;
    });

    doc += `## 所有操作\n\n`;
    Array.from(this.operations.values()).forEach(op => {
      doc += `### ${op.name} (\`${op.id}\`)\n\n`;
      doc += `**描述**: ${op.description}\n\n`;
      doc += `**分类**: ${op.category}\n`;
      doc += `**复杂度**: ${op.complexity}\n`;
      doc += `**使用频率**: ${op.usage}\n`;
      doc += `**使用次数**: ${op.useCount}\n`;
      if (op.tags.length > 0) {
        doc += `**标签**: ${op.tags.join(', ')}\n`;
      }
      doc += `\n`;
    });

    return doc;
  }

  // 私有方法

  private initializeCategories(): void {
    const categories: OperationCategory[] = [
      {
        name: 'find',
        description: '元素查找相关操作',
        operations: [],
        color: '#3498db'
      },
      {
        name: 'extract',
        description: '数据提取相关操作',
        operations: [],
        color: '#2ecc71'
      },
      {
        name: 'interact',
        description: '页面交互相关操作',
        operations: [],
        color: '#e74c3c'
      },
      {
        name: 'navigate',
        description: '页面导航相关操作',
        operations: [],
        color: '#f39c12'
      },
      {
        name: 'validate',
        description: '验证和等待相关操作',
        operations: [],
        color: '#9b59b6'
      }
    ];

    categories.forEach(category => {
      this.categories.set(category.name, category);
    });
  }

  private initializeDefaultOperations(): void {
    // 这里可以初始化一些默认的操作元数据
    // 实际使用时需要与AtomicOperationEngine配合
  }

  private addToCategory(category: string, operationId: string): void {
    const categoryInfo = this.categories.get(category);
    if (categoryInfo && !categoryInfo.operations.includes(operationId)) {
      categoryInfo.operations.push(operationId);
    }
  }

  private logInfo(message: string, data?: any): void {
    console.log(`[AtomicOperationLibrary] ${message}`, data || '');
  }
}

// 工厂函数
export function createAtomicOperationLibrary(): AtomicOperationLibrary {
  return new AtomicOperationLibrary();
}