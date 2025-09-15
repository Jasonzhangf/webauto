/**
 * 操作子注册系统
 * 支持自动扫描和动态注册操作子
 */

import fs from 'fs';
import path from 'path';

// 基础接口定义
interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

interface OperationMetadata {
  name?: string;
  category?: string;
  version?: string;
  description?: string;
  keywords?: string[];
  [key: string]: unknown;
}

interface OperationClass {
  new (config?: Record<string, unknown>): unknown;
  name: string;
  version?: string;
  description?: string;
  category?: string;
  keywords?: string[];
  metadata?: OperationMetadata;
  dependencies?: string[];
  prototype: {
    execute?: Function;
    validate?: Function;
    getMetadata?: Function;
    cleanup?: Function;
    [key: string]: unknown;
  };
}

interface OperationInfo {
  class: OperationClass;
  name: string;
  category: string;
  version: string;
  description: string;
  metadata: OperationMetadata;
  registeredAt: number;
}

interface CategoryMapping {
  inferredCategory: string;
  inferenceMethod: string;
  confidence: number;
}

interface ScanOptions {
  recursive?: boolean;
  filePattern?: RegExp;
  classPattern?: RegExp;
  ignorePatterns?: RegExp[];
}

interface ScanResult {
  name: string;
  filePath: string;
  exportName: string;
  category: string;
  inferenceMethod: string;
}

interface DirectoryScanResult {
  [key: string]: unknown;
}

interface ReinferResult {
  name: string;
  oldCategory: string;
  newCategory: string;
  changed: boolean;
}

interface CategoryRecommendation {
  category: string;
  confidence: number;
  suggestedOperations: string[];
}

interface CategoryAnalysis {
  categories: Record<string, {
    operationCount: number;
    operations: string[];
  }>;
  inferenceMethods: Record<string, number>;
  confidenceDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  totalMappings: number;
}

interface RegistryStatistics {
  totalOperations: number;
  totalCategories: number;
  scannedPaths: string[];
  config: OperationRegistryConfig;
  categories: Record<string, number>;
  operations: Array<{
    name: string;
    category: string;
    version: string;
  }>;
  categoryMappings: Record<string, CategoryMapping>;
}

interface DependencyValidationResult {
  valid: boolean;
  missingDependencies: string[];
  dependencies: string[];
}

export interface OperationRegistryConfig {
  enableDynamicCategories?: boolean;
  categoryInferenceMode?: 'directory' | 'metadata' | 'hybrid';
  defaultCategory?: string;
  categoryAliases?: Record<string, string>;
  [key: string]: unknown;
}

export class OperationRegistry {
  private operations: Map<string, OperationInfo>;
  private categories: Map<string, Map<string, OperationInfo>>;
  private scannedPaths: Set<string>;
  private categoryMappings: Map<string, CategoryMapping>;
  private config: OperationRegistryConfig;
  private logger: Logger;
  private lastInferenceMethod: string | null;
  private lastInferenceConfidence: number | null;

  constructor(config: OperationRegistryConfig = {}) {
    this.operations = new Map();
    this.categories = new Map();
    this.scannedPaths = new Set();
    this.categoryMappings = new Map(); // 动态类别映射
    this.config = {
      enableDynamicCategories: config.enableDynamicCategories ?? true,
      categoryInferenceMode: config.categoryInferenceMode || 'hybrid', // 'directory', 'metadata', 'hybrid'
      defaultCategory: config.defaultCategory || 'general',
      categoryAliases: config.categoryAliases || {},
      ...config
    };
    this.lastInferenceMethod = null;
    this.lastInferenceConfidence = null;
    this.logger = {
      info: (message: string, data: Record<string, unknown> = {}) => console.log(`[OperationRegistry] INFO: ${message}`, data),
      warn: (message: string, data: Record<string, unknown> = {}) => console.warn(`[OperationRegistry] WARN: ${message}`, data),
      error: (message: string, data: Record<string, unknown> = {}) => console.error(`[OperationRegistry] ERROR: ${message}`, data),
      debug: (message: string, data: Record<string, unknown> = {}) => console.debug(`[OperationRegistry] DEBUG: ${message}`, data)
    };
  }

  /**
   * 注册操作子
   */
  register(OperationClass: OperationClass, metadata: OperationMetadata = {}): OperationInfo {
    const operationName = metadata.name || OperationClass.name;

    // 动态发现类别
    const category = this.discoverCategory(OperationClass, metadata);

    // 创建操作子信息
    const operationInfo: OperationInfo = {
      class: OperationClass,
      name: operationName,
      category,
      version: metadata.version || OperationClass.version || '1.0.0',
      description: metadata.description || OperationClass.description || '',
      metadata: { ...metadata, ...OperationClass.metadata },
      registeredAt: Date.now()
    };

    // 注册到主映射
    this.operations.set(operationName, operationInfo);

    // 注册到分类映射
    if (!this.categories.has(category)) {
      this.categories.set(category, new Map());
    }
    this.categories.get(category)!.set(operationName, operationInfo);

    // 记录类别映射关系
    this.categoryMappings.set(operationName, {
      inferredCategory: category,
      inferenceMethod: this.getLastInferenceMethod(),
      confidence: this.getLastInferenceConfidence()
    });

    this.logger.info('Operation registered', {
      name: operationName,
      category,
      version: operationInfo.version,
      inferenceMethod: this.getLastInferenceMethod()
    });

    return operationInfo;
  }

  /**
   * 动态发现类别
   */
  discoverCategory(OperationClass: OperationClass, metadata: OperationMetadata = {}, filePath: string | null = null): string {
    if (!this.config.enableDynamicCategories) {
      return metadata.category || OperationClass.category || this.config.defaultCategory!;
    }

    let category = this.config.defaultCategory!;
    let inferenceMethod = 'default';
    let confidence = 0.5;

    switch (this.config.categoryInferenceMode) {
      case 'directory':
        if (filePath) {
          category = this.inferCategoryFromDirectory(filePath);
          inferenceMethod = 'directory';
          confidence = 0.8;
        }
        break;

      case 'metadata':
        category = this.inferCategoryFromMetadata(OperationClass, metadata);
        inferenceMethod = 'metadata';
        confidence = 0.9;
        break;

      case 'hybrid':
      default:
        // 混合模式：优先使用元数据，然后使用目录结构
        if (metadata.category || OperationClass.category) {
          category = metadata.category || OperationClass.category!;
          inferenceMethod = 'explicit-metadata';
          confidence = 1.0;
        } else if (filePath) {
          category = this.inferCategoryFromDirectory(filePath);
          inferenceMethod = 'directory';
          confidence = 0.8;
        } else {
          category = this.inferCategoryFromMetadata(OperationClass, metadata);
          inferenceMethod = 'inferred-metadata';
          confidence = 0.7;
        }
        break;
    }

    // 应用类别别名
    category = this.applyCategoryAliases(category);

    // 缓存推理结果
    this.lastInferenceMethod = inferenceMethod;
    this.lastInferenceConfidence = confidence;

    return category;
  }

  /**
   * 从目录结构推断类别
   */
  inferCategoryFromDirectory(filePath: string): string {
    const parsedPath = path.parse(filePath);
    const relativePath = path.relative(process.cwd(), filePath);
    const pathParts = relativePath.split(path.sep);

    // 寻找可能的类别目录
    const categoryIndicators = [
      'operations', 'ops', 'handlers', 'processors',
      'post-processing', 'preprocessing', 'transformers',
      'extractors', 'formatters', 'analyzers', 'validators'
    ];

    for (const part of pathParts) {
      const normalizedPart = part.toLowerCase().replace(/[-_\s]/g, '-');

      // 检查是否是已知的类别指示器
      if (categoryIndicators.includes(normalizedPart)) {
        return this.normalizeCategoryName(normalizedPart);
      }

      // 检查是否是类别目录（包含operations的目录）
      if (normalizedPart.includes('operation') || normalizedPart.includes('processor')) {
        return this.normalizeCategoryName(normalizedPart);
      }
    }

    // 如果没有找到明确的类别，使用父目录名作为类别
    const parentDir = pathParts[pathParts.length - 2];
    if (parentDir && !parentDir.startsWith('.')) {
      return this.normalizeCategoryName(parentDir);
    }

    return this.config.defaultCategory!;
  }

  /**
   * 从元数据推断类别
   */
  inferCategoryFromMetadata(OperationClass: OperationClass, metadata: OperationMetadata): string {
    // 从操作子类名推断
    const className = OperationClass.name;
    const classCategory = this.extractCategoryFromName(className);

    // 从描述文本推断
    const description = metadata.description || OperationClass.description || '';
    const descCategory = this.extractCategoryFromDescription(description);

    // 从关键词推断
    const keywords = metadata.keywords || OperationClass.keywords || [];
    const keywordCategory = this.extractCategoryFromKeywords(keywords);

    // 按置信度排序选择最合适的类别
    const candidates = [
      { category: classCategory, confidence: 0.8 },
      { category: descCategory, confidence: 0.6 },
      { category: keywordCategory, confidence: 0.7 }
    ].filter(c => c.category !== this.config.defaultCategory);

    if (candidates.length > 0) {
      // 选择置信度最高的候选
      const bestCandidate = candidates.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );
      return bestCandidate.category;
    }

    return this.config.defaultCategory!;
  }

  /**
   * 从类名提取类别
   */
  extractCategoryFromName(className: string): string {
    // 移除Operation后缀
    const baseName = className.replace(/Operation$/i, '');

    // 按驼峰命名法分割
    const parts = baseName.split(/(?=[A-Z])/);

    // 寻找类别关键词
    const categoryKeywords = [
      'Browser', 'Navigation', 'Scraping', 'Crawling', 'Extraction',
      'Processing', 'Post', 'Pre', 'Transform', 'Format', 'Analyze',
      'Validate', 'File', 'HTML', 'Content', 'Data', 'AI', 'ML',
      'Summary', 'Organize', 'Merge', 'Search', 'Capture', 'Automate'
    ];

    for (const part of parts) {
      if (categoryKeywords.includes(part)) {
        return this.normalizeCategoryName(part);
      }
    }

    return this.config.defaultCategory!;
  }

  /**
   * 从描述文本提取类别
   */
  extractCategoryFromDescription(description: string): string {
    const categoryPatterns = [
      /\b(browser|web|page|navigation|scraping)\b/i,
      /\b(process|processing|transform|format|clean)\b/i,
      /\b(analyze|analysis|summary|summarize)\b/i,
      /\b(file|document|data|content)\b/i,
      /\b(organize|merge|combine|structure)\b/i,
      /\b(validate|check|verify|test)\b/i,
      /\b(ai|artificial|intelligence|ml|machine)\b/i
    ];

    for (const [index, pattern] of categoryPatterns.entries()) {
      if (pattern.test(description)) {
        const categories = ['browser', 'processing', 'analysis', 'data', 'organization', 'validation', 'ai'];
        return categories[index];
      }
    }

    return this.config.defaultCategory!;
  }

  /**
   * 从关键词提取类别
   */
  extractCategoryFromKeywords(keywords: string[]): string {
    const keywordCategoryMap: Record<string, string> = {
      'browser,web,navigation,page': 'browser',
      'process,transform,format,clean': 'processing',
      'analyze,analysis,summary,insight': 'analysis',
      'file,data,document,content': 'data',
      'organize,merge,combine,structure': 'organization',
      'validate,check,verify,test': 'validation',
      'ai,ml,machine,intelligence': 'ai',
      'post,after,finalize': 'post-processing',
      'pre,before,initial': 'pre-processing'
    };

    const keywordString = keywords.join(',').toLowerCase();

    for (const [keywordPattern, category] of Object.entries(keywordCategoryMap)) {
      if (keywordPattern.split(',').some(keyword => keywordString.includes(keyword))) {
        return category;
      }
    }

    return this.config.defaultCategory!;
  }

  /**
   * 应用类别别名
   */
  applyCategoryAliases(category: string): string {
    return this.config.categoryAliases![category] || category;
  }

  /**
   * 规范化类别名称
   */
  normalizeCategoryName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[-_\s]+/g, '-')
      .replace(/-+$/, '')
      .replace(/^-+/, '')
      .replace(/operation(s)?$/, '');
  }

  /**
   * 获取最后一次推理方法
   */
  getLastInferenceMethod(): string {
    return this.lastInferenceMethod || 'default';
  }

  /**
   * 获取最后一次推理置信度
   */
  getLastInferenceConfidence(): number {
    return this.lastInferenceConfidence || 0.5;
  }

  /**
   * 注销操作子
   */
  unregister(operationName: string): boolean {
    const operationInfo = this.operations.get(operationName);
    if (!operationInfo) {
      this.logger.warn('Operation not found for unregistration', { operationName });
      return false;
    }

    // 从主映射中删除
    this.operations.delete(operationName);

    // 从分类映射中删除
    const categoryMap = this.categories.get(operationInfo.category);
    if (categoryMap) {
      categoryMap.delete(operationName);
      if (categoryMap.size === 0) {
        this.categories.delete(operationInfo.category);
      }
    }

    // 从类别映射中删除
    this.categoryMappings.delete(operationName);

    this.logger.info('Operation unregistered', { operationName });
    return true;
  }

  /**
   * 获取操作子
   */
  get(operationName: string): OperationInfo {
    const operationInfo = this.operations.get(operationName);
    if (!operationInfo) {
      throw new Error(`Operation '${operationName}' not found`);
    }
    return operationInfo;
  }

  /**
   * 获取所有操作子
   */
  getAll(): OperationInfo[] {
    return Array.from(this.operations.values());
  }

  /**
   * 按分类获取操作子
   */
  getByCategory(category: string): OperationInfo[] {
    const categoryMap = this.categories.get(category);
    return categoryMap ? Array.from(categoryMap.values()) : [];
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * 检查操作子是否存在
   */
  has(operationName: string): boolean {
    return this.operations.has(operationName);
  }

  /**
   * 创建操作子实例
   */
  createInstance<T = unknown>(operationName: string, config: Record<string, unknown> = {}): T {
    const operationInfo = this.get(operationName);
    const OperationClass = operationInfo.class;

    try {
      const instance = new OperationClass(config);
      this.logger.debug('Operation instance created', {
        operationName,
        config: Object.keys(config)
      });
      return instance as T;
    } catch (error) {
      this.logger.error('Failed to create operation instance', {
        operationName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * 扫描目录中的操作子
   */
  async scanDirectory(directoryPath: string, options: ScanOptions = {}): Promise<ScanResult[]> {
    const {
      recursive = true,
      filePattern = /\.js$/,
      classPattern = /class\s+(\w+Operation|Operation)\s+extends/,
      ignorePatterns = [/\.test\.js$/, /\.spec\.js$/, /node_modules/]
    } = options;

    this.logger.info('Scanning directory for operations', { directoryPath, recursive });

    if (!fs.existsSync(directoryPath)) {
      this.logger.error('Directory not found', { directoryPath });
      return [];
    }

    const registeredOperations: ScanResult[] = [];
    const filesToScan: string[] = [];

    // 收集文件
    const collectFiles = (dir: string) => {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        // 检查是否应该忽略
        const shouldIgnore = ignorePatterns.some(pattern =>
          pattern.test(fullPath) || pattern.test(item.name)
        );

        if (shouldIgnore) {
          continue;
        }

        if (item.isFile() && filePattern.test(item.name)) {
          filesToScan.push(fullPath);
        } else if (item.isDirectory() && recursive) {
          collectFiles(fullPath);
        }
      }
    };

    collectFiles(directoryPath);

    // 扫描文件
    for (const filePath of filesToScan) {
      try {
        const operations = await this.scanFile(filePath, classPattern);
        registeredOperations.push(...operations);
      } catch (error) {
        this.logger.warn('Failed to scan file', {
          filePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.scannedPaths.add(directoryPath);

    this.logger.info('Directory scan completed', {
      directoryPath,
      filesScanned: filesToScan.length,
      operationsFound: registeredOperations.length
    });

    return registeredOperations;
  }

  /**
   * 扫描单个文件中的操作子
   */
  async scanFile(filePath: string, classPattern: RegExp): Promise<ScanResult[]> {
    this.logger.debug('Scanning file for operations', { filePath });

    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(classPattern);

    if (!matches) {
      return [];
    }

    // 动态导入模块
    try {
      // 清除模块缓存以便重新加载
      delete require.cache[require.resolve(filePath)];
      const module = await import(filePath);

      const registeredOperations: ScanResult[] = [];

      // 检查模块的导出
      for (const [exportName, exportValue] of Object.entries(module)) {
        if (this.isOperationClass(exportValue as OperationClass)) {
          try {
            // 传递文件路径用于动态类别发现
            const operationInfo = this.register(exportValue as OperationClass, {}, filePath);
            registeredOperations.push({
              name: operationInfo.name,
              filePath,
              exportName,
              category: operationInfo.category,
              inferenceMethod: this.getLastInferenceMethod()
            });
          } catch (error) {
            this.logger.warn('Failed to register operation from file', {
              filePath,
              exportName,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }

      return registeredOperations;
    } catch (error) {
      this.logger.warn('Failed to load module', {
        filePath,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * 检查是否是操作子类
   */
  isOperationClass(obj: OperationClass): boolean {
    if (typeof obj !== 'function' || !obj.prototype) {
      return false;
    }

    // 检查是否继承自BaseOperation（需要导入BaseOperation）
    // 这里使用一些启发式方法
    const className = obj.name;
    const hasOperationMethods = [
      'execute', 'validate', 'getMetadata', 'cleanup'
    ].some(method => typeof obj.prototype[method] === 'function');

    return (
      (className.includes('Operation') || className.endsWith('Operation')) &&
      hasOperationMethods
    );
  }

  /**
   * 自动扫描多个目录
   */
  async autoScan(directories: string[], options: ScanOptions = {}): Promise<ScanResult[]> {
    const allOperations: ScanResult[] = [];

    for (const directory of directories) {
      try {
        const operations = await this.scanDirectory(directory, options);
        allOperations.push(...operations);
      } catch (error) {
        this.logger.error('Failed to scan directory', {
          directory,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.logger.info('Auto scan completed', {
      directories: directories.length,
      totalOperations: allOperations.length
    });

    return allOperations;
  }

  /**
   * 重新加载所有操作子
   */
  async reloadAll(): Promise<number> {
    this.logger.info('Reloading all operations');

    // 清空当前注册
    this.operations.clear();
    this.categories.clear();

    // 重新扫描所有路径
    const scanPromises = Array.from(this.scannedPaths).map(dirPath =>
      this.scanDirectory(dirPath)
    );

    const results = await Promise.all(scanPromises);
    const totalOperations = results.reduce((sum, ops) => sum + ops.length, 0);

    this.logger.info('All operations reloaded', {
      scannedPaths: this.scannedPaths.size,
      totalOperations
    });

    return totalOperations;
  }

  /**
   * 获取注册统计信息
   */
  getStatistics(): RegistryStatistics {
    return {
      totalOperations: this.operations.size,
      totalCategories: this.categories.size,
      scannedPaths: Array.from(this.scannedPaths),
      config: this.config,
      categories: Object.fromEntries(
        Array.from(this.categories.entries()).map(([category, ops]) => [
          category,
          ops.size
        ])
      ),
      operations: Array.from(this.operations.values()).map(op => ({
        name: op.name,
        category: op.category,
        version: op.version
      })),
      categoryMappings: Object.fromEntries(this.categoryMappings.entries())
    };
  }

  /**
   * 获取类别分析信息
   */
  getCategoryAnalysis(): CategoryAnalysis {
    const analysis: CategoryAnalysis = {
      categories: {},
      inferenceMethods: {},
      confidenceDistribution: { high: 0, medium: 0, low: 0 },
      totalMappings: this.categoryMappings.size
    };

    // 分析每个类别
    for (const [category, operations] of this.categories.entries()) {
      analysis.categories[category] = {
        operationCount: operations.size,
        operations: Array.from(operations.keys())
      };
    }

    // 分析推理方法分布
    for (const mapping of this.categoryMappings.values()) {
      const method = mapping.inferenceMethod || 'unknown';
      analysis.inferenceMethods[method] = (analysis.inferenceMethods[method] || 0) + 1;

      // 分析置信度分布
      const confidence = mapping.confidence || 0.5;
      if (confidence >= 0.8) {
        analysis.confidenceDistribution.high++;
      } else if (confidence >= 0.6) {
        analysis.confidenceDistribution.medium++;
      } else {
        analysis.confidenceDistribution.low++;
      }
    }

    return analysis;
  }

  /**
   * 更新类别别名配置
   */
  updateCategoryAliases(aliases: Record<string, string>): void {
    this.config.categoryAliases = { ...this.config.categoryAliases, ...aliases };
    this.logger.info('Category aliases updated', {
      aliasCount: Object.keys(aliases).length
    });
  }

  /**
   * 重新推理所有操作子的类别
   */
  async reinferAllCategories(): Promise<ReinferResult[]> {
    this.logger.info('Re-inferring all operation categories');

    const reinferringOperations: ReinferResult[] = [];

    // 收集所有操作子信息
    const operationsToReinfer = Array.from(this.operations.entries()).map(([name, info]) => ({
      name,
      class: info.class,
      metadata: info.metadata,
      currentCategory: info.category
    }));

    // 清空当前分类映射
    this.categories.clear();
    this.categoryMappings.clear();

    // 重新注册所有操作子
    for (const op of operationsToReinfer) {
      try {
        const newInfo = this.register(op.class, op.metadata);
        reinferringOperations.push({
          name: op.name,
          oldCategory: op.currentCategory,
          newCategory: newInfo.category,
          changed: op.currentCategory !== newInfo.category
        });
      } catch (error) {
        this.logger.warn('Failed to re-infer operation category', {
          name: op.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    this.logger.info('Category re-inference completed', {
      totalProcessed: reinferringOperations.length,
      changedCount: reinferringOperations.filter(op => op.changed).length
    });

    return reinferringOperations;
  }

  /**
   * 获取推荐的新类别
   */
  getRecommendedCategories(): CategoryRecommendation[] {
    const recommendations: CategoryRecommendation[] = [];

    // 分析当前操作子名称模式
    const namePatterns = new Map<string, number>();
    for (const op of this.operations.values()) {
      const className = op.class.name;
      const baseName = className.replace(/Operation$/i, '');

      // 提取关键词
      const keywords = baseName.split(/(?=[A-Z])/).filter(word => word.length > 2);

      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        namePatterns.set(lowerKeyword, (namePatterns.get(lowerKeyword) || 0) + 1);
      }
    }

    // 推荐高频关键词作为新类别
    for (const [keyword, count] of namePatterns.entries()) {
      if (count >= 2 && !this.categories.has(keyword)) {
        recommendations.push({
          category: keyword,
          confidence: Math.min(count / 5, 1.0),
          suggestedOperations: Array.from(this.operations.values())
            .filter(op => op.class.name.toLowerCase().includes(keyword))
            .map(op => op.name)
        });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 搜索操作子
   */
  search(query: string): OperationInfo[] {
    const results: OperationInfo[] = [];
    const lowerQuery = query.toLowerCase();

    for (const operationInfo of this.operations.values()) {
      if (
        operationInfo.name.toLowerCase().includes(lowerQuery) ||
        operationInfo.category.toLowerCase().includes(lowerQuery) ||
        operationInfo.description.toLowerCase().includes(lowerQuery)
      ) {
        results.push(operationInfo);
      }
    }

    return results;
  }

  /**
   * 验证操作子依赖
   */
  validateDependencies(operationName: string): DependencyValidationResult {
    const operationInfo = this.get(operationName);
    const OperationClass = operationInfo.class;

    // 检查是否有必需的依赖
    const dependencies = OperationClass.dependencies || [];
    const missingDependencies: string[] = [];

    for (const dep of dependencies) {
      try {
        require.resolve(dep);
      } catch (error) {
        missingDependencies.push(dep);
      }
    }

    return {
      valid: missingDependencies.length === 0,
      missingDependencies,
      dependencies
    };
  }

  /**
   * 清理注册表
   */
  cleanup(): void {
    this.operations.clear();
    this.categories.clear();
    this.scannedPaths.clear();
    this.categoryMappings.clear();
    this.lastInferenceMethod = null;
    this.lastInferenceConfidence = null;
    this.logger.info('Registry cleaned up');
  }
}

// 创建全局注册表实例，启用动态类别发现
export const globalRegistry = new OperationRegistry({
  enableDynamicCategories: true,
  categoryInferenceMode: 'hybrid',
  defaultCategory: 'general',
  categoryAliases: {
    'post': 'post-processing',
    'pre': 'pre-processing',
    'browser': 'browser',
    'file': 'data',
    'content': 'data',
    'ml': 'ai',
    'machine-learning': 'ai'
  }
});

export default OperationRegistry;