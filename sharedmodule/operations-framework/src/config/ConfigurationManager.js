/**
 * 配置管理系统
 * 管理工作流配置、操作配置和验证
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class ConfigurationManager {
  constructor(config = {}) {
    this.configPath = config.configPath || './config';
    this.schemaPath = config.schemaPath || './schemas';
    this.cache = new Map();
    this.logger = config.logger || console;
    this.validators = new Map();
    
    // 内置验证器
    this.initializeValidators();
  }

  /**
   * 初始化验证器
   */
  initializeValidators() {
    // 工作流配置验证器
    this.validators.set('workflow', this.validateWorkflowConfig.bind(this));
    
    // 操作配置验证器
    this.validators.set('operation', this.validateOperationConfig.bind(this));
    
    // 变量配置验证器
    this.validators.set('variable', this.validateVariableConfig.bind(this));
    
    // 条件配置验证器
    this.validators.set('condition', this.validateConditionConfig.bind(this));
  }

  /**
   * 加载配置文件
   */
  async loadConfig(configPath, type = 'json') {
    try {
      const fullPath = path.resolve(configPath);
      const cacheKey = `${type}:${fullPath}`;
      
      // 检查缓存
      if (this.cache.has(cacheKey)) {
        this.logger.debug('Loading config from cache', { configPath });
        return this.cache.get(cacheKey);
      }

      // 读取文件
      const content = await fs.readFile(fullPath, 'utf8');
      let config;

      // 根据类型解析
      switch (type) {
        case 'json':
          config = JSON.parse(content);
          break;
        case 'yaml':
        case 'yml':
          config = await this.parseYAML(content);
          break;
        default:
          throw new Error(`Unsupported config type: ${type}`);
      }

      // 验证配置
      const validationResult = await this.validateConfig(config, type);
      if (!validationResult.valid) {
        throw new Error(`Config validation failed: ${validationResult.errors.join(', ')}`);
      }

      // 缓存配置
      this.cache.set(cacheKey, config);
      
      this.logger.info('Config loaded successfully', { 
        configPath, 
        type,
        cacheKey 
      });

      return config;

    } catch (error) {
      this.logger.error('Failed to load config', { 
        configPath, 
        type, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 保存配置文件
   */
  async saveConfig(config, configPath, type = 'json') {
    try {
      const fullPath = path.resolve(configPath);
      
      // 验证配置
      const validationResult = await this.validateConfig(config, type);
      if (!validationResult.valid) {
        throw new Error(`Config validation failed: ${validationResult.errors.join(', ')}`);
      }

      // 确保目录存在
      await this.ensureDirectory(path.dirname(fullPath));

      // 根据类型序列化
      let content;
      switch (type) {
        case 'json':
          content = JSON.stringify(config, null, 2);
          break;
        case 'yaml':
        case 'yml':
          content = await this.stringifyYAML(config);
          break;
        default:
          throw new Error(`Unsupported config type: ${type}`);
      }

      // 写入文件
      await fs.writeFile(fullPath, content, 'utf8');
      
      // 更新缓存
      const cacheKey = `${type}:${fullPath}`;
      this.cache.set(cacheKey, config);

      this.logger.info('Config saved successfully', { 
        configPath, 
        type 
      });

    } catch (error) {
      this.logger.error('Failed to save config', { 
        configPath, 
        type, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * 验证配置
   */
  async validateConfig(config, type) {
    const errors = [];
    const warnings = [];

    try {
      // 基本结构验证
      if (!config || typeof config !== 'object') {
        errors.push('Config must be an object');
        return { valid: false, errors, warnings };
      }

      // 根据类型进行特定验证
      const validator = this.validators.get(type);
      if (validator) {
        const result = await validator(config);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }

      // 通用验证
      await this.validateCommonConfig(config, errors, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error) {
      this.logger.error('Config validation failed', { 
        type, 
        error: error.message 
      });
      return {
        valid: false,
        errors: [error.message],
        warnings: []
      };
    }
  }

  /**
   * 验证工作流配置
   */
  async validateWorkflowConfig(config) {
    const errors = [];
    const warnings = [];

    // 必需字段验证
    if (!config.name || typeof config.name !== 'string') {
      errors.push('Workflow name is required and must be a string');
    }

    if (!config.steps || !Array.isArray(config.steps)) {
      errors.push('Workflow steps are required and must be an array');
    }

    if (config.steps && config.steps.length === 0) {
      warnings.push('Workflow has no steps');
    }

    // 步骤验证
    if (config.steps) {
      for (let i = 0; i < config.steps.length; i++) {
        const step = config.steps[i];
        const stepErrors = await this.validateStepConfig(step, i);
        errors.push(...stepErrors);
      }
    }

    // 变量验证
    if (config.variables) {
      const variableErrors = await this.validateVariablesConfig(config.variables);
      errors.push(...variableErrors);
    }

    // 元数据验证
    if (config.metadata) {
      const metadataErrors = await this.validateMetadataConfig(config.metadata);
      errors.push(...metadataErrors);
    }

    return { errors, warnings };
  }

  /**
   * 验证步骤配置
   */
  async validateStepConfig(step, index) {
    const errors = [];

    if (!step.operation || typeof step.operation !== 'string') {
      errors.push(`Step ${index}: operation is required and must be a string`);
    }

    if (step.params && typeof step.params !== 'object') {
      errors.push(`Step ${index}: params must be an object`);
    }

    // 条件步骤验证
    if (step.condition) {
      const conditionErrors = await this.validateConditionConfig(step.condition);
      errors.push(...conditionErrors.map(e => `Step ${index}: ${e}`));
    }

    // 循环步骤验证
    if (step.loop) {
      const loopErrors = await this.validateLoopConfig(step.loop);
      errors.push(...loopErrors.map(e => `Step ${index}: ${e}`));
    }

    // 重试配置验证
    if (step.retry) {
      const retryErrors = await this.validateRetryConfig(step.retry);
      errors.push(...retryErrors.map(e => `Step ${index}: ${e}`));
    }

    return errors;
  }

  /**
   * 验证操作配置
   */
  async validateOperationConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Operation name is required and must be a string');
    }

    if (!config.type || typeof config.type !== 'string') {
      errors.push('Operation type is required and must be a string');
    }

    // 参数验证
    if (config.params && typeof config.params !== 'object') {
      errors.push('Operation params must be an object');
    }

    // 依赖验证
    if (config.dependencies && !Array.isArray(config.dependencies)) {
      errors.push('Operation dependencies must be an array');
    }

    return { errors, warnings };
  }

  /**
   * 验证变量配置
   */
  async validateVariableConfig(config) {
    const errors = [];
    const warnings = [];

    if (!config.name || typeof config.name !== 'string') {
      errors.push('Variable name is required and must be a string');
    }

    if (config.value === undefined) {
      errors.push('Variable value is required');
    }

    // 类型验证
    if (config.type && !['string', 'number', 'boolean', 'object', 'array'].includes(config.type)) {
      errors.push(`Invalid variable type: ${config.type}`);
    }

    // 作用域验证
    if (config.scope && !['global', 'workflow', 'step'].includes(config.scope)) {
      errors.push(`Invalid variable scope: ${config.scope}`);
    }

    return { errors, warnings };
  }

  /**
   * 验证条件配置
   */
  async validateConditionConfig(config) {
    const errors = [];

    if (!config.type || !['expression', 'comparison', 'exists', 'contains', 'pattern'].includes(config.type)) {
      errors.push('Condition type is required and must be one of: expression, comparison, exists, contains, pattern');
    }

    if (!config.condition) {
      errors.push('Condition expression is required');
    }

    // 根据类型验证配置
    switch (config.type) {
      case 'comparison':
        if (!config.config || !config.config.operator) {
          errors.push('Comparison condition requires operator in config');
        }
        break;
      case 'pattern':
        if (!config.config || !config.config.pattern) {
          errors.push('Pattern condition requires pattern in config');
        }
        break;
    }

    return errors;
  }

  /**
   * 验证循环配置
   */
  async validateLoopConfig(config) {
    const errors = [];

    if (!config.type || !['forEach', 'forRange', 'while', 'doWhile', 'repeatUntil'].includes(config.type)) {
      errors.push('Loop type is required and must be one of: forEach, forRange, while, doWhile, repeatUntil');
    }

    // 根据类型验证配置
    switch (config.type) {
      case 'forEach':
        if (!config.items) {
          errors.push('forEach loop requires items');
        }
        break;
      case 'forRange':
        if (config.end === undefined) {
          errors.push('forRange loop requires end value');
        }
        break;
      case 'while':
      case 'doWhile':
      case 'repeatUntil':
        if (!config.condition) {
          errors.push(`${config.type} loop requires condition`);
        }
        break;
    }

    return errors;
  }

  /**
   * 验证重试配置
   */
  async validateRetryConfig(config) {
    const errors = [];

    if (config.maxRetries !== undefined && (typeof config.maxRetries !== 'number' || config.maxRetries < 0)) {
      errors.push('maxRetries must be a non-negative number');
    }

    if (config.delay !== undefined && (typeof config.delay !== 'number' || config.delay < 0)) {
      errors.push('delay must be a non-negative number');
    }

    if (config.backoffFactor !== undefined && (typeof config.backoffFactor !== 'number' || config.backoffFactor <= 0)) {
      errors.push('backoffFactor must be a positive number');
    }

    return errors;
  }

  /**
   * 验证变量配置集合
   */
  async validateVariablesConfig(variables) {
    const errors = [];

    if (!Array.isArray(variables)) {
      errors.push('Variables must be an array');
      return errors;
    }

    const names = new Set();
    for (let i = 0; i < variables.length; i++) {
      const variable = variables[i];
      const result = await this.validateVariableConfig(variable);
      errors.push(...result.errors.map(e => `Variable ${i}: ${e}`));

      // 检查重复名称
      if (names.has(variable.name)) {
        errors.push(`Variable ${i}: duplicate name '${variable.name}'`);
      }
      names.add(variable.name);
    }

    return errors;
  }

  /**
   * 验证元数据配置
   */
  async validateMetadataConfig(metadata) {
    const errors = [];

    if (typeof metadata !== 'object') {
      errors.push('Metadata must be an object');
      return errors;
    }

    // 版本验证
    if (metadata.version && typeof metadata.version !== 'string') {
      errors.push('Metadata version must be a string');
    }

    // 描述验证
    if (metadata.description && typeof metadata.description !== 'string') {
      errors.push('Metadata description must be a string');
    }

    // 标签验证
    if (metadata.tags && !Array.isArray(metadata.tags)) {
      errors.push('Metadata tags must be an array');
    }

    return errors;
  }

  /**
   * 通用配置验证
   */
  async validateCommonConfig(config, errors, warnings) {
    // ID 验证
    if (config.id && typeof config.id !== 'string') {
      errors.push('ID must be a string');
    }

    // 描述验证
    if (config.description && typeof config.description !== 'string') {
      errors.push('Description must be a string');
    }

    // 标签验证
    if (config.tags && !Array.isArray(config.tags)) {
      errors.push('Tags must be an array');
    }

    // 启用状态验证
    if (config.enabled !== undefined && typeof config.enabled !== 'boolean') {
      errors.push('Enabled must be a boolean');
    }
  }

  /**
   * 解析 YAML
   */
  async parseYAML(content) {
    try {
      // 动态导入 YAML 解析器
      const yaml = await import('yaml');
      return yaml.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse YAML: ${error.message}`);
    }
  }

  /**
   * 序列化 YAML
   */
  async stringifyYAML(obj) {
    try {
      // 动态导入 YAML 解析器
      const yaml = await import('yaml');
      return yaml.stringify(obj);
    } catch (error) {
      throw new Error(`Failed to stringify YAML: ${error.message}`);
    }
  }

  /**
   * 确保目录存在
   */
  async ensureDirectory(dirPath) {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
    this.logger.info('Configuration cache cleared');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * 获取配置模板
   */
  getTemplate(type) {
    const templates = {
      workflow: {
        name: 'workflow-name',
        description: 'Workflow description',
        version: '1.0.0',
        enabled: true,
        variables: [],
        steps: [],
        metadata: {
          author: 'author-name',
          created: new Date().toISOString(),
          tags: []
        }
      },
      operation: {
        name: 'operation-name',
        type: 'operation-type',
        description: 'Operation description',
        params: {},
        dependencies: [],
        retry: {
          maxRetries: 3,
          delay: 1000,
          backoffFactor: 2
        }
      },
      variable: {
        name: 'variable-name',
        type: 'string',
        value: 'default-value',
        scope: 'workflow',
        description: 'Variable description'
      }
    };

    return templates[type] || null;
  }

  /**
   * 创建配置示例
   */
  async createConfigExample(type, outputPath) {
    const template = this.getTemplate(type);
    if (!template) {
      throw new Error(`Unknown config type: ${type}`);
    }

    await this.saveConfig(template, outputPath, 'json');
    this.logger.info('Config example created', { type, outputPath });
  }
}

export default ConfigurationManager;