/**
 * 微博专用超时配置
 * 针对微博页面特性优化的分级超时控制策略
 */

class WeiboTimeoutConfig {
  constructor(customConfig = {}) {
    // 基础超时配置
    this.config = {
      // 快速操作（点击、输入等）
      fast: 5000,

      // 中等操作（等待元素、短时间加载）
      medium: 8000,

      // 慢速操作（页面导航、内容加载）
      slow: 15000,

      // 关键操作（重要内容、批量操作）
      critical: 30000,

      // 特殊操作（需要更长时间）
      extended: 45000,

      // 最大超时（绝对上限）
      maximum: 60000,

      // 操作特定超时
      operations: {
        // 页面导航
        navigate: {
          homepage: 15000,     // 主页导航
          post: 20000,         // 帖子页面
          profile: 15000,      // 用户页面
          search: 12000,       // 搜索页面
          default: 15000       // 默认导航
        },

        // 内容等待
        content: {
          feedLoad: 8000,      // Feed加载
          commentsLoad: 10000, // 评论加载
          imagesLoad: 6000,    // 图片加载
          videoLoad: 12000,    // 视频加载
          default: 8000        // 默认内容等待
        },

        // 交互操作
        interaction: {
          click: 3000,         // 点击操作
          input: 3000,         // 输入操作
          scroll: 2000,        // 滚动操作
          select: 4000,        // 选择操作
          default: 3000        // 默认交互
        },

        // 等待操作
        wait: {
          element: 5000,       // 元素出现
          visible: 4000,       // 元素可见
          hidden: 4000,        // 元素隐藏
          navigation: 8000,    // 导航完成
          default: 5000        // 默认等待
        }
      },

      // 重试配置
      retry: {
        maxAttempts: 3,       // 最大重试次数
        baseDelay: 1000,       // 基础延迟
        multiplier: 1.5,       // 延迟倍数
        maxDelay: 10000        // 最大延迟
      },

      // 批量操作配置
      batch: {
        perItemTimeout: 45000,    // 每个项目超时
        totalTimeout: 300000,     // 总体超时
        concurrency: 3,            // 并发数
        retryFailed: true         // 重试失败项目
      }
    };

    // 合并自定义配置
    this.mergeConfig(customConfig);
  }

  /**
   * 合并配置
   */
  mergeConfig(customConfig) {
    if (customConfig) {
      this.config = this.deepMerge(this.config, customConfig);
    }
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * 获取操作超时
   */
  getOperationTimeout(operationType, specificOperation = null) {
    if (specificOperation && this.config.operations[operationType]?.[specificOperation]) {
      return this.config.operations[operationType][specificOperation];
    }

    if (this.config.operations[operationType]?.default) {
      return this.config.operations[operationType].default;
    }

    // 根据操作类型返回基础超时
    switch (operationType) {
      case 'navigate':
        return this.config.slow;
      case 'content':
        return this.config.medium;
      case 'interaction':
        return this.config.fast;
      case 'wait':
        return this.config.medium;
      default:
        return this.config.medium;
    }
  }

  /**
   * 获取页面导航超时
   */
  getNavigationTimeout(pageType = 'default') {
    return this.getOperationTimeout('navigate', pageType);
  }

  /**
   * 获取内容等待超时
   */
  getContentTimeout(contentType = 'default') {
    return this.getOperationTimeout('content', contentType);
  }

  /**
   * 获取交互操作超时
   */
  getInteractionTimeout(interactionType = 'default') {
    return this.getOperationTimeout('interaction', interactionType);
  }

  /**
   * 获取等待操作超时
   */
  getWaitTimeout(waitType = 'default') {
    return this.getOperationTimeout('wait', waitType);
  }

  /**
   * 获取重试配置
   */
  getRetryConfig() {
    return { ...this.config.retry };
  }

  /**
   * 获取批量操作配置
   */
  getBatchConfig() {
    return { ...this.config.batch };
  }

  /**
   * 获取基础超时级别
   */
  getBaseTimeout(level) {
    return this.config[level] || this.config.medium;
  }

  /**
   * 智能超时计算
   * 根据操作复杂度和历史表现动态调整超时
   */
  calculateSmartTimeout(baseOperation, complexity = 'medium', history = []) {
    let baseTimeout = this.getBaseTimeout(baseOperation);

    // 根据复杂度调整
    const complexityMultiplier = {
      'simple': 0.8,
      'medium': 1.0,
      'complex': 1.5,
      'critical': 2.0
    };

    let calculatedTimeout = baseTimeout * complexityMultiplier[complexity];

    // 根据历史表现调整
    if (history.length > 0) {
      const recentSuccesses = history.filter(h => h.success).slice(-5);
      const recentFailures = history.filter(h => !h.success).slice(-5);

      if (recentFailures.length > recentSuccesses.length) {
        // 如果最近失败较多，增加超时时间
        calculatedTimeout *= 1.2;
      } else if (recentSuccesses.length > 0) {
        // 如果最近成功较多，可以稍微减少超时时间
        calculatedTimeout *= 0.9;
      }
    }

    // 确保不超过最大超时限制
    calculatedTimeout = Math.min(calculatedTimeout, this.config.maximum);

    return Math.round(calculatedTimeout);
  }

  /**
   * 创建带重试的操作执行器
   */
  createRetryExecutor(operation, operationType, specificOperation = null) {
    const timeout = this.getOperationTimeout(operationType, specificOperation);
    const retryConfig = this.getRetryConfig();

    return async (...args) => {
      let lastError;

      for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
        try {
          // 为本次操作设置超时
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('操作超时')), timeout);
          });

          const operationPromise = operation(...args);

          return await Promise.race([operationPromise, timeoutPromise]);

        } catch (error) {
          lastError = error;

          if (attempt < retryConfig.maxAttempts) {
            const delay = Math.min(
              retryConfig.baseDelay * Math.pow(retryConfig.multiplier, attempt - 1),
              retryConfig.maxDelay
            );

            console.log(`⚠️ 操作失败，${delay}ms后进行第${attempt + 1}次重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            console.log(`❌ 操作已重试${retryConfig.maxAttempts}次，仍然失败`);
          }
        }
      }

      throw lastError;
    };
  }

  /**
   * 批量操作超时管理器
   */
  createBatchManager(items, operation) {
    const batchConfig = this.getBatchConfig();
    const startTime = Date.now();

    return {
      async execute() {
        const results = [];
        const promises = [];

        // 创建并发执行
        for (let i = 0; i < Math.min(items.length, batchConfig.concurrency); i++) {
          const item = items[i];

          const itemPromise = this.executeWithTimeout(
            () => operation(item),
            batchConfig.perItemTimeout,
            `项目 ${i + 1}/${items.length}`
          );

          promises.push(itemPromise);
        }

        // 设置总体超时
        const totalTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('批量操作总超时')), batchConfig.totalTimeout);
        });

        try {
          const batchResults = await Promise.race([
            Promise.allSettled(promises),
            totalTimeoutPromise
          ]);

          if (Array.isArray(batchResults)) {
            batchResults.forEach((result, index) => {
              if (result.status === 'fulfilled') {
                results.push({
                  item: items[index],
                  success: true,
                  result: result.value
                });
              } else {
                results.push({
                  item: items[index],
                  success: false,
                  error: result.reason.message
                });
              }
            });
          }

          return results;

        } catch (error) {
          console.log('批量操作超时:', error.message);
          return results; // 返回已完成的部分结果
        }
      },

      async executeWithTimeout(operation, timeout, itemName) {
        try {
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${itemName} 超时`)), timeout);
          });

          const result = await Promise.race([operation(), timeoutPromise]);
          return { success: true, result };

        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    };
  }

  /**
   * 获取配置统计
   */
  getConfigStats() {
    return {
      baseTimeouts: {
        fast: this.config.fast,
        medium: this.config.medium,
        slow: this.config.slow,
        critical: this.config.critical,
        extended: this.config.extended,
        maximum: this.config.maximum
      },
      retryConfig: this.config.retry,
      batchConfig: this.config.batch
    };
  }

  /**
   * 导出配置
   */
  exportConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * 从配置文件加载
   */
  loadFromFile(configPath) {
    try {
      const fs = require('fs');
      const configData = fs.readFileSync(configPath, 'utf8');
      const customConfig = JSON.parse(configData);
      this.mergeConfig(customConfig);
      console.log(`✅ 超时配置已从 ${configPath} 加载`);
    } catch (error) {
      console.error(`❌ 加载配置文件失败: ${error.message}`);
    }
  }

  /**
   * 保存配置到文件
   */
  saveToFile(configPath) {
    try {
      const fs = require('fs');
      const configData = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(configPath, configData, 'utf8');
      console.log(`✅ 超时配置已保存到 ${configPath}`);
    } catch (error) {
      console.error(`❌ 保存配置文件失败: ${error.message}`);
    }
  }
}

module.exports = WeiboTimeoutConfig;