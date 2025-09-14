// 原子操作系统使用示例
// 展示如何使用原子操作库和页面配置进行网站操作

import { createAtomicOperationEngine } from './core/atomic-operation-engine';
import { createAtomicOperationLibrary } from './core/atomic-operation-library';
import { SystemStateCenter } from '../core/system-state-center';

// 示例上下文接口
interface ExampleExecutionContext {
  page: any; // Playwright Page对象
  url: string;
  timestamp: Date;
}

class AtomicOperationSystemDemo {
  private engine: any;
  private library: any;
  private stateCenter: SystemStateCenter;

  constructor() {
    this.stateCenter = SystemStateCenter.getInstance();
    this.engine = createAtomicOperationEngine(this.stateCenter);
    this.library = createAtomicOperationLibrary();
    this.initializeSystem();
  }

  // 初始化系统
  private initializeSystem(): void {
    console.log('🚀 初始化原子操作系统...');
    
    // 注册所有原子操作到库中
    const operations = this.engine.getAtomicOperations();
    operations.forEach((op: any) => {
      this.library.registerOperation(op, {
        complexity: this.getComplexityByCategory(op.category),
        usage: 'medium',
        tags: this.getTagsByCategory(op.category),
        examples: this.generateExamples(op)
      });
    });

    // 加载网站配置
    this.loadWebsiteConfigs();
    
    console.log('✅ 原子操作系统初始化完成');
    console.log('📊 系统统计:', this.library.getStats());
  }

  // 获取分类复杂度
  private getComplexityByCategory(category: string): 'simple' | 'medium' | 'complex' {
    const complexityMap: Record<string, 'simple' | 'medium' | 'complex'> = {
      'find': 'simple',
      'extract': 'simple',
      'interact': 'medium',
      'navigate': 'simple',
      'validate': 'simple'
    };
    return complexityMap[category] || 'medium';
  }

  // 获取分类标签
  private getTagsByCategory(category: string): string[] {
    const tagMap: Record<string, string[]> = {
      'find': ['element', 'selector', 'location'],
      'extract': ['data', 'content', 'information'],
      'interact': ['click', 'input', 'action'],
      'navigate': ['page', 'url', 'navigation'],
      'validate': ['check', 'wait', 'validation']
    };
    return tagMap[category] || [];
  }

  // 生成示例
  private generateExamples(op: any): any[] {
    const baseExamples = [
      {
        name: '基础使用',
        description: `使用${op.name}的基础示例`,
        parameters: {}
      }
    ];

    // 根据操作类型添加特定示例
    switch (op.id) {
      case 'find_element':
        baseExamples.push({
          name: '查找按钮',
          description: '查找页面中的按钮元素',
          parameters: { selector: '.btn-primary' }
        });
        break;
      case 'extract_text':
        baseExamples.push({
          name: '提取标题',
          description: '提取页面标题文本',
          parameters: { selector: 'h1', multi: false }
        });
        break;
      case 'click_element':
        baseExamples.push({
          name: '点击链接',
          description: '点击页面中的链接',
          parameters: { selector: 'a.btn' }
        });
        break;
    }

    return baseExamples;
  }

  // 加载网站配置
  private loadWebsiteConfigs(): void {
    // 这里应该从文件系统加载JSON配置文件
    // 为了示例，我们直接显示配置路径
    console.log('📁 可用网站配置:');
    console.log('  - weibo/homepage.json');
    console.log('  - weibo/user-profile.json');
    console.log('  - weibo/search-page.json');
    console.log('  - news/article-list.json');
    console.log('  - ecommerce/product-detail.json');
  }

  // 示例1: 展示原子操作库功能
  async demonstrateLibrary(): Promise<void> {
    console.log('\n📚 原子操作库演示');
    console.log('='.repeat(50));

    // 获取所有操作
    const allOperations = this.library.getAllOperations();
    console.log(`\n📋 总共有 ${allOperations.length} 个原子操作:`);
    
    // 按分类显示
    const categories = ['find', 'extract', 'interact', 'navigate', 'validate'];
    categories.forEach(category => {
      const ops = this.library.getOperationsByCategory(category);
      console.log(`\n  ${category.toUpperCase()} (${ops.length}个):`);
      ops.forEach(op => {
        console.log(`    - ${op.name} (${op.id})`);
        console.log(`      ${op.description}`);
      });
    });

    // 搜索操作
    console.log('\n🔍 搜索 "提取" 相关操作:');
    const searchResults = this.library.searchOperations('提取');
    searchResults.forEach(op => {
      console.log(`  - ${op.name}: ${op.description}`);
    });

    // 获取统计
    const stats = this.library.getStats();
    console.log('\n📊 操作库统计:');
    console.log(`  总操作数: ${stats.totalOperations}`);
    console.log(`  分类统计:`, stats.byCategory);
    console.log(`  复杂度统计:`, stats.byComplexity);
    console.log(`  最常用操作:`, stats.mostUsed.slice(0, 3).map(op => op.name));
  }

  // 示例2: 模拟执行操作
  async simulateExecution(): Promise<void> {
    console.log('\n🎯 模拟操作执行');
    console.log('='.repeat(50));

    // 模拟一些操作执行
    const simulatedOperations = [
      { id: 'find_element', success: true, time: 150 },
      { id: 'extract_text', success: true, time: 200 },
      { id: 'click_element', success: true, time: 100 },
      { id: 'wait_element', success: false, time: 5000 }
    ];

    for (const op of simulatedOperations) {
      console.log(`\n⚡ 执行操作: ${op.id}`);
      
      // 记录使用
      this.library.recordUsage(op.id, op.success, op.time);
      
      // 获取操作详情
      const details = this.library.getOperationDetails(op.id);
      if (details) {
        console.log(`  操作名称: ${details.metadata.name}`);
        console.log(`  执行状态: ${op.success ? '✅ 成功' : '❌ 失败'}`);
        console.log(`  执行时间: ${op.time}ms`);
        console.log(`  使用次数: ${details.stats.totalUses}`);
      }
    }

    // 显示使用模式
    const patterns = this.library.getUsagePatterns();
    console.log('\n📈 使用模式分析:');
    console.log(`  成功率: ${(patterns.successRate * 100).toFixed(1)}%`);
    console.log(`  平均执行时间: ${patterns.avgExecutionTime.toFixed(0)}ms`);
    console.log(`  最近使用: ${patterns.totalRecentUsage}次`);
  }

  // 示例3: 生成文档
  async generateDocumentation(): Promise<void> {
    console.log('\n📝 生成操作库文档');
    console.log('='.repeat(50));

    const documentation = this.library.generateDocumentation();
    
    // 保存到文件
    const fs = require('fs');
    const path = require('path');
    const docsPath = path.join(__dirname, '..', '..', '..', 'docs', 'atomic-operations.md');
    
    try {
      fs.writeFileSync(docsPath, documentation, 'utf8');
      console.log(`✅ 文档已生成: ${docsPath}`);
      console.log(`📄 文档长度: ${documentation.length} 字符`);
      
      // 显示文档摘要
      const lines = documentation.split('\n').slice(0, 20);
      console.log('\n📋 文档预览:');
      lines.forEach(line => console.log(line));
    } catch (error) {
      console.log(`❌ 文档生成失败: ${error}`);
    }
  }

  // 示例4: 展示推荐功能
  async demonstrateRecommendations(): Promise<void> {
    console.log('\n🎯 操作推荐演示');
    console.log('='.repeat(50));

    const contexts = ['表单', '数据', '登录', '导航', '验证'];
    
    for (const context of contexts) {
      console.log(`\n🔍 上下文: "${context}"`);
      const recommendations = this.library.getRecommendedOperations(context, 3);
      
      if (recommendations.length > 0) {
        console.log('  推荐操作:');
        recommendations.forEach(op => {
          console.log(`    - ${op.name} (${op.useCount}次使用)`);
        });
      } else {
        console.log('  无推荐操作');
      }
    }
  }

  // 示例5: 导出配置
  async exportConfiguration(): Promise<void> {
    console.log('\n💾 导出配置');
    console.log('='.repeat(50));

    const config = this.library.exportConfiguration();
    
    console.log('📋 配置内容:');
    console.log(`  导出时间: ${config.exportedAt}`);
    console.log(`  操作数量: ${config.operations.length}`);
    console.log(`  分类数量: ${config.categories.length}`);
    console.log(`  总使用次数: ${config.operations.reduce((sum: number, op: any) => sum + op.useCount, 0)}`);
    
    // 保存到文件
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '..', '..', '..', 'config', 'operation-library.json');
    
    try {
      // 确保目录存在
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`✅ 配置已导出: ${configPath}`);
    } catch (error) {
      console.log(`❌ 配置导出失败: ${error}`);
    }
  }

  // 运行完整演示
  async runFullDemo(): Promise<void> {
    console.log('🎭 原子操作系统完整演示');
    console.log('='.repeat(60));
    
    try {
      // 1. 展示库功能
      await this.demonstrateLibrary();
      
      // 2. 模拟执行
      await this.simulateExecution();
      
      // 3. 生成文档
      await this.generateDocumentation();
      
      // 4. 展示推荐
      await this.demonstrateRecommendations();
      
      // 5. 导出配置
      await this.exportConfiguration();
      
      console.log('\n🎉 演示完成！');
      console.log('\n💡 系统优势:');
      console.log('  ✅ 22个内置原子操作');
      console.log('  ✅ 智能操作推荐');
      console.log('  ✅ 使用模式分析');
      console.log('  ✅ 自动文档生成');
      console.log('  ✅ 配置导出导入');
      console.log('  ✅ 分类管理和搜索');
      console.log('  ✅ 使用统计跟踪');
      
    } catch (error) {
      console.error('❌ 演示过程中发生错误:', error);
    }
  }
}

// 导出使用
export { AtomicOperationSystemDemo };

// 如果直接运行此文件
if (require.main === module) {
  console.log('🎯 原子操作系统演示');
  console.log('这是一个演示文件，展示原子操作系统的完整功能');
  console.log('使用方法:');
  console.log('  const demo = new AtomicOperationSystemDemo();');
  console.log('  await demo.runFullDemo();');
}