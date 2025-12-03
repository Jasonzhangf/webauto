/**
 * 工作流注册表
 * 集中管理所有工作流的注册和发现
 */

const path = require('path');
const fs = require('fs').promises;

/**
 * 工作流注册表
 * 提供工作流的注册、发现和管理功能
 */
class WorkflowRegistry {
  constructor() {
    this.workflows = new Map();
    this.categories = new Map();
    this.dependencies = new Map();
    this.metadata = new Map();
  }

  /**
   * 注册工作流
   */
  registerWorkflow(name, workflowClass, config = {}) {
    const workflowInfo = {
      name,
      class: workflowClass,
      config: {
        ...config,
        registeredAt: new Date().toISOString(),
        version: config.version || '1.0.0',
        category: config.category || 'general'
      }
    };

    // 注册工作流
    this.workflows.set(name, workflowInfo);

    // 添加到分类
    const category = config.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category).add(name);

    // 注册依赖关系
    if (config.dependencies) {
      this.dependencies.set(name, config.dependencies);
    }

    // 保存元数据
    this.metadata.set(name, {
      description: config.description || '',
      author: config.author || '',
      tags: config.tags || [],
      examples: config.examples || []
    });

    console.log(`✅ 工作流已注册: ${name} (${category})`);
  }

  /**
   * 注销工作流
   */
  unregisterWorkflow(name) {
    if (!this.workflows.has(name)) {
      return false;
    }

    const workflow = this.workflows.get(name);
    const category = workflow.config.category || 'general';

    // 从工作流映射中删除
    this.workflows.delete(name);

    // 从分类中删除
    if (this.categories.has(category)) {
      this.categories.get(category).delete(name);
      if (this.categories.get(category).size === 0) {
        this.categories.delete(category);
      }
    }

    // 删除依赖关系
    this.dependencies.delete(name);

    // 删除元数据
    this.metadata.delete(name);

    console.log(`🗑️ 工作流已注销: ${name}`);
    return true;
  }

  /**
   * 获取工作流
   */
  getWorkflow(name) {
    return this.workflows.get(name);
  }

  /**
   * 检查工作流是否存在
   */
  hasWorkflow(name) {
    return this.workflows.has(name);
  }

  /**
   * 获取所有工作流名称
   */
  getWorkflowNames() {
    return Array.from(this.workflows.keys());
  }

  /**
   * 按分类获取工作流
   */
  getWorkflowsByCategory(category) {
    return this.categories.has(category) ?
      Array.from(this.categories.get(category)) : [];
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Array.from(this.categories.keys());
  }

  /**
   * 获取工作流依赖
   */
  getDependencies(name) {
    return this.dependencies.get(name) || [];
  }

  /**
   * 检查工作流依赖是否满足
   */
  checkDependencies(name, availableWorkflows = new Set(this.workflows.keys())) {
    const dependencies = this.getDependencies(name);
    const missing = dependencies.filter(dep => !availableWorkflows.has(dep));

    return {
      satisfied: missing.length === 0,
      missing,
      dependencies
    };
  }

  /**
   * 获取工作流元数据
   */
  getMetadata(name) {
    return this.metadata.get(name);
  }

  /**
   * 搜索工作流
   */
  searchWorkflows(query) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    for (const [name, workflow] of this.workflows) {
      const metadata = this.metadata.get(name);

      // 搜索名称
      if (name.toLowerCase().includes(lowerQuery)) {
        results.push({ name, workflow, matchType: 'name' });
        continue;
      }

      // 搜索描述
      if (metadata.description.toLowerCase().includes(lowerQuery)) {
        results.push({ name, workflow, matchType: 'description' });
        continue;
      }

      // 搜索标签
      if (metadata.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) {
        results.push({ name, workflow, matchType: 'tag' });
        continue;
      }

      // 搜索分类
      if (workflow.config.category.toLowerCase().includes(lowerQuery)) {
        results.push({ name, workflow, matchType: 'category' });
      }
    }

    return results;
  }

  /**
   * 获取工作流统计
   */
  getStatistics() {
    return {
      totalWorkflows: this.workflows.size,
      totalCategories: this.categories.size,
      categories: Object.fromEntries(
        Array.from(this.categories.entries()).map(([cat, workflows]) => [cat, workflows.size])
      ),
      totalDependencies: Array.from(this.dependencies.values()).reduce((sum, deps) => sum + deps.length, 0)
    };
  }

  /**
   * 获取工作流图（依赖关系）
   */
  getWorkflowGraph() {
    const nodes = Array.from(this.workflows.keys()).map(name => ({
      id: name,
      label: name,
      category: this.workflows.get(name).config.category
    }));

    const edges = [];
    for (const [name, dependencies] of this.dependencies) {
      for (const dep of dependencies) {
        if (this.workflows.has(dep)) {
          edges.push({ from: name, to: dep });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * 导出工作流配置
   */
  exportConfig() {
    const config = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      workflows: {},
      categories: {},
      dependencies: {},
      metadata: {}
    };

    // 导出工作流配置
    for (const [name, workflow] of this.workflows) {
      config.workflows[name] = {
        name: workflow.config.name,
        version: workflow.config.version,
        category: workflow.config.category,
        description: this.metadata.get(name).description,
        author: this.metadata.get(name).author,
        tags: this.metadata.get(name).tags
      };
    }

    // 导出分类
    for (const [category, workflows] of this.categories) {
      config.categories[category] = Array.from(workflows);
    }

    // 导出依赖关系
    for (const [name, dependencies] of this.dependencies) {
      if (dependencies.length > 0) {
        config.dependencies[name] = dependencies;
      }
    }

    // 导出元数据
    for (const [name, metadata] of this.metadata) {
      config.metadata[name] = metadata;
    }

    return config;
  }

  /**
   * 导入工作流配置
   */
  async importConfig(config, workflowBasePath) {
    try {
      console.log('📥 导入工作流配置...');

      // 导入工作流
      for (const [name, workflowConfig] of Object.entries(config.workflows)) {
        try {
          // 动态导入工作流类
          const workflowPath = path.join(workflowBasePath, `${name}.js`);
          const workflowModule = require(workflowPath);

          if (workflowModule.WorkflowClass) {
            this.registerWorkflow(name, workflowModule.WorkflowClass, workflowConfig);
          }
        } catch (error) {
          console.warn(`⚠️ 导入工作流失败: ${name}`, error.message);
        }
      }

      console.log('✅ 工作流配置导入完成');
      return true;

    } catch (error) {
      console.error('❌ 工作流配置导入失败:', error);
      return false;
    }
  }

  /**
   * 验证工作流配置
   */
  validateWorkflowConfig(config) {
    const required = ['name', 'version'];
    const missing = required.filter(field => !config[field]);

    if (missing.length > 0) {
      return {
        valid: false,
        errors: [`缺少必需字段: ${missing.join(', ')}`]
      };
    }

    const errors = [];

    // 验证依赖关系
    if (config.dependencies) {
      for (const dep of config.dependencies) {
        if (!this.workflows.has(dep)) {
          errors.push(`依赖的工作流不存在: ${dep}`);
        }
      }
    }

    // 验证分类
    if (config.category && typeof config.category !== 'string') {
      errors.push('分类必须是字符串');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取工作流启动顺序（基于依赖关系）
   */
  getStartupOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (name) => {
      if (visiting.has(name)) {
        throw new Error(`检测到循环依赖: ${name}`);
      }

      if (visited.has(name)) {
        return;
      }

      visiting.add(name);

      const dependencies = this.getDependencies(name);
      for (const dep of dependencies) {
        visit(dep);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(name);
    };

    for (const name of this.workflows.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return order;
  }

  /**
   * 清空注册表
   */
  clear() {
    this.workflows.clear();
    this.categories.clear();
    this.dependencies.clear();
    this.metadata.clear();
    console.log('🧹 工作流注册表已清空');
  }

  /**
   * 保存注册表到文件
   */
  async saveToFile(filePath) {
    try {
      const config = this.exportConfig();
      await fs.writeFile(filePath, JSON.stringify(config, null, 2));
      console.log(`💾 工作流注册表已保存: ${filePath}`);
    } catch (error) {
      console.error('❌ 保存工作流注册表失败:', error);
      throw error;
    }
  }

  /**
   * 从文件加载注册表
   */
  async loadFromFile(filePath, workflowBasePath) {
    try {
      const config = JSON.parse(await fs.readFile(filePath, 'utf8'));
      await this.importConfig(config, workflowBasePath);
      console.log(`📂 工作流注册表已加载: ${filePath}`);
    } catch (error) {
      console.error('❌ 加载工作流注册表失败:', error);
      throw error;
    }
  }
}

// 创建全局注册表实例
const globalRegistry = new WorkflowRegistry();

module.exports = {
  WorkflowRegistry,
  globalRegistry
};