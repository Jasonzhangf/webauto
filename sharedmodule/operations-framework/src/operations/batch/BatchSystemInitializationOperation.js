/**
 * 批量系统初始化操作子
 * 负责初始化浏览器、创建目录结构、加载历史记录
 */

import { BaseOperation } from '../core/BaseOperation.js';
import { mkdir, readFile, writeFile, access } from 'fs/promises';
import { join, dirname } from 'path';
import { homedir } from 'os';

export class BatchSystemInitializationOperation extends BaseOperation {
  constructor(config = {}) {
    super('batch-system-initialization', config);
    this.category = 'system-initialization';
    this.supportedContainers = ['weibo-batch-download'];
    this.capabilities = ['browser-init', 'directory-creation', 'history-loading'];
  }

  async execute(context = {}) {
    this.logger.info('开始批量系统初始化...');

    try {
      const result = {
        browserContext: null,
        directoryStructure: null,
        downloadHistory: new Map(),
        initializationTime: Date.now()
      };

      // 1. 创建目录结构
      if (this.config.createDirectoryStructure) {
        result.directoryStructure = await this.createDirectoryStructure(
          this.config.directoryConfig
        );
        this.logger.info('目录结构创建完成', result.directoryStructure);
      }

      // 2. 加载历史记录
      if (this.config.loadHistory) {
        result.downloadHistory = await this.loadDownloadHistory(
          this.config.historyConfig,
          result.directoryStructure
        );
        this.logger.info(`加载历史记录: ${result.downloadHistory.size} 条`);
      }

      // 3. 初始化浏览器
      if (this.config.initBrowser) {
        result.browserContext = await this.initializeBrowser(
          this.config.browserConfig
        );
        this.logger.info('浏览器初始化完成');
      }

      this.logger.info('批量系统初始化完成');
      return result;

    } catch (error) {
      this.logger.error('批量系统初始化失败:', error);
      throw error;
    }
  }

  async createDirectoryStructure(directoryConfig) {
    const rootDir = directoryConfig.root.replace('~', homedir());
    const structure = {};

    for (const [key, path] of Object.entries(directoryConfig.structure)) {
      const fullPath = join(rootDir, path);

      try {
        await mkdir(fullPath, { recursive: true });
        structure[key] = fullPath;
        this.logger.debug(`创建目录: ${fullPath}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          throw error;
        }
        structure[key] = fullPath;
      }
    }

    // 创建元数据目录
    const metadataDir = join(rootDir, directoryConfig.structure.metadata);
    try {
      await mkdir(metadataDir, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }

    return {
      root: rootDir,
      ...structure,
      metadata: metadataDir
    };
  }

  async loadDownloadHistory(historyConfig, directoryStructure) {
    if (!historyConfig.enabled) return new Map();

    try {
      const historyFile = join(
        directoryStructure.metadata,
        historyConfig.historyFile
      );

      if (await access(historyFile).catch(() => false)) {
        const content = await readFile(historyFile, 'utf8');
        const history = JSON.parse(content);

        // 清理过期记录
        const cutoffTime = Date.now() - (historyConfig.maxHistoryDays * 24 * 60 * 60 * 1000);
        const filteredHistory = Object.entries(history)
          .filter(([_, record]) => record.timestamp > cutoffTime);

        this.logger.debug(`历史记录过滤: ${Object.keys(history).length} -> ${filteredHistory.length}`);
        return new Map(filteredHistory);
      }
    } catch (error) {
      this.logger.debug('未找到历史记录文件:', error.message);
    }

    return new Map();
  }

  async initializeBrowser(browserConfig) {
    // 这里应该集成现有的浏览器初始化操作子
    // 暂时返回模拟的浏览器上下文
    this.logger.info('初始化浏览器环境...');

    return {
      initialized: true,
      config: browserConfig,
      userAgent: browserConfig.userAgent,
      headless: browserConfig.headless,
      targetDomain: browserConfig.targetDomain,
      // 实际实现中这里应该返回真实的浏览器实例
    };
  }

  async validate() {
    const errors = [];

    if (!this.config.directoryConfig) {
      errors.push('缺少目录配置');
    }

    if (this.config.createDirectoryStructure && !this.config.directoryConfig?.structure) {
      errors.push('缺少目录结构配置');
    }

    if (this.config.loadHistory && !this.config.historyConfig) {
      errors.push('缺少历史记录配置');
    }

    if (this.config.initBrowser && !this.config.browserConfig) {
      errors.push('缺少浏览器配置');
    }

    return errors;
  }

  async cleanup() {
    this.logger.info('清理批量系统初始化资源...');
    // 清理浏览器资源等
  }
}

export default BatchSystemInitializationOperation;