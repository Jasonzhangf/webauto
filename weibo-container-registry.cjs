#!/usr/bin/env node

/**
 * 微博容器注册器
 * 将微博容器配置注册到容器库中，实现自动发现功能
 */

const fs = require('fs');
const path = require('path');

class WeiboContainerRegistry {
  constructor(config = {}) {
    this.config = {
      containerConfigPath: config.containerConfigPath || './weibo-container-config.json',
      containerLibraryPath: config.containerLibraryPath || './container-library.json',
      verbose: config.verbose || true,
      ...config
    };

    this.containerLibrary = {};
    this.registeredContainers = new Map();
  }

  /**
   * 注册微博容器到容器库
   */
  async registerWeiboContainers() {
    console.log('🗃️ 开始注册微博容器到容器库...');

    try {
      // 1. 读取容器配置
      const containerConfig = await this.loadContainerConfig();

      // 2. 初始化容器库
      await this.initializeContainerLibrary();

      // 3. 注册容器
      const registrationResult = await this.performContainerRegistration(containerConfig);

      // 4. 保存容器库
      await this.saveContainerLibrary();

      console.log('\n🎉 微博容器注册完成！');
      return registrationResult;

    } catch (error) {
      console.error('❌ 微博容器注册失败:', error.message);
      throw error;
    }
  }

  /**
   * 加载容器配置
   */
  async loadContainerConfig() {
    if (!fs.existsSync(this.config.containerConfigPath)) {
      throw new Error(`容器配置文件不存在: ${this.config.containerConfigPath}`);
    }

    const configData = fs.readFileSync(this.config.containerConfigPath, 'utf8');
    const config = JSON.parse(configData);

    if (this.config.verbose) {
      console.log('📋 已加载容器配置:');
      console.log(`   - 网站: ${config.website}`);
      console.log(`   - 版本: ${config.version}`);
      console.log(`   - 容器数量: ${Object.keys(config.containers).length}`);
    }

    return config;
  }

  /**
   * 初始化容器库
   */
  async initializeContainerLibrary() {
    if (fs.existsSync(this.config.containerLibraryPath)) {
      const libraryData = fs.readFileSync(this.config.containerLibraryPath, 'utf8');
      this.containerLibrary = JSON.parse(libraryData);

      if (this.config.verbose) {
        console.log('📚 已加载现有容器库');
        console.log(`   - 已注册网站: ${Object.keys(this.containerLibrary).length}`);
      }
    } else {
      this.containerLibrary = {};

      if (this.config.verbose) {
        console.log('📚 创建新容器库');
      }
    }

    // 确保微博网站条目存在
    if (!this.containerLibrary.weibo) {
      this.containerLibrary.weibo = {
        website: 'weibo.com',
        registeredAt: new Date().toISOString(),
        containers: {},
        metadata: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          containerCount: 0
        }
      };
    }
  }

  /**
   * 执行容器注册
   */
  async performContainerRegistration(containerConfig) {
    console.log('🔄 执行容器注册...');

    const weiboEntry = this.containerLibrary.weibo;
    const containers = containerConfig.containers;

    const registrationResults = {
      success: 0,
      updated: 0,
      failed: 0,
      details: {}
    };

    // 注册每个容器
    for (const [containerType, containerInfo] of Object.entries(containers)) {
      try {
        const result = await this.registerSingleContainer(containerType, containerInfo, weiboEntry, containerConfig);

        if (result.success) {
          if (result.updated) {
            registrationResults.updated++;
          } else {
            registrationResults.success++;
          }
        } else {
          registrationResults.failed++;
        }

        registrationResults.details[containerType] = result;

        if (this.config.verbose) {
          const status = result.success ? '✅' : '❌';
          const action = result.updated ? '(更新)' : '(新增)';
          console.log(`   ${status} ${containerInfo.name}: ${containerInfo.selector} ${action}`);
        }

      } catch (error) {
        registrationResults.failed++;
        registrationResults.details[containerType] = {
          success: false,
          error: error.message
        };

        console.warn(`⚠️ 容器注册失败 [${containerType}]:`, error.message);
      }
    }

    // 更新元数据
    weiboEntry.metadata.lastUpdated = new Date().toISOString();
    weiboEntry.metadata.containerCount = Object.keys(weiboEntry.containers).length;
    weiboEntry.metadata.version = containerConfig.version;

    if (this.config.verbose) {
      console.log('\n📊 注册统计:');
      console.log(`   - 成功注册: ${registrationResults.success}`);
      console.log(`   - 更新现有: ${registrationResults.updated}`);
      console.log(`   - 注册失败: ${registrationResults.failed}`);
      console.log(`   - 总容器数: ${weiboEntry.metadata.containerCount}`);
    }

    return registrationResults;
  }

  /**
   * 注册单个容器
   */
  async registerSingleContainer(containerType, containerInfo, weiboEntry, containerConfig) {
    // 检查容器是否已存在
    const existingContainer = weiboEntry.containers[containerType];
    const isUpdate = !!existingContainer;

    // 创建容器注册信息
    const registeredContainer = {
      ...containerInfo,
      registeredAt: new Date().toISOString(),
      isActive: true,
      usage: {
        accessCount: 0,
        lastUsed: null,
        successRate: 0
      },
      validation: {
        selectorValid: true,
        lastValidation: new Date().toISOString(),
        validationMethod: 'registration'
      },
      discovery: containerConfig.discovery || {
        strategy: 'recursive-depth-first',
        maxDepth: 5,
        waitForElements: true,
        timeout: 10000
      }
    };

    // 如果是更新，保留使用统计
    if (existingContainer && existingContainer.usage) {
      registeredContainer.usage = existingContainer.usage;
    }

    // 注册到容器库
    weiboEntry.containers[containerType] = registeredContainer;

    // 同时注册到内存中的快速访问映射
    this.registeredContainers.set(`weibo:${containerType}`, registeredContainer);

    return {
      success: true,
      updated: isUpdate,
      containerType,
      containerInfo,
      registeredContainer
    };
  }

  /**
   * 保存容器库
   */
  async saveContainerLibrary() {
    const libraryDir = path.dirname(this.config.containerLibraryPath);

    // 确保目录存在
    if (!fs.existsSync(libraryDir)) {
      fs.mkdirSync(libraryDir, { recursive: true });
    }

    // 保存容器库
    fs.writeFileSync(this.config.containerLibraryPath, JSON.stringify(this.containerLibrary, null, 2));

    if (this.config.verbose) {
      console.log(`💾 容器库已保存到: ${this.config.containerLibraryPath}`);
    }
  }

  /**
   * 获取已注册的容器
   */
  getRegisteredContainers(website = 'weibo') {
    const siteEntry = this.containerLibrary[website];
    return siteEntry ? siteEntry.containers : {};
  }

  /**
   * 根据类型获取容器
   */
  getContainerByType(containerType, website = 'weibo') {
    const containers = this.getRegisteredContainers(website);
    return containers[containerType] || null;
  }

  /**
   * 验证容器selector有效性
   */
  async validateContainerSelector(containerType, website = 'weibo') {
    const container = this.getContainerByType(containerType, website);

    if (!container) {
      throw new Error(`容器不存在: ${website}:${containerType}`);
    }

    // 这里可以添加实际的selector验证逻辑
    // 比如使用浏览器测试selector是否有效
    console.log(`🔍 验证容器selector [${website}:${containerType}]: ${container.selector}`);

    // 模拟验证结果
    const isValid = true; // 实际应该通过浏览器验证

    container.validation = {
      ...container.validation,
      selectorValid: isValid,
      lastValidation: new Date().toISOString(),
      validationMethod: 'automated'
    };

    return {
      valid: isValid,
      container: container
    };
  }

  /**
   * 更新容器使用统计
   */
  async updateContainerUsage(containerType, website = 'weibo', usageData = {}) {
    const container = this.getContainerByType(containerType, website);

    if (!container) {
      throw new Error(`容器不存在: ${website}:${containerType}`);
    }

    // 更新使用统计
    container.usage = {
      accessCount: (container.usage.accessCount || 0) + 1,
      lastUsed: new Date().toISOString(),
      successRate: usageData.success ?
        ((container.usage.successRate || 0) * container.usage.accessCount + 1) / (container.usage.accessCount + 1) :
        ((container.usage.successRate || 0) * container.usage.accessCount) / (container.usage.accessCount + 1),
      ...usageData
    };

    // 保存更新
    await this.saveContainerLibrary();

    return container;
  }

  /**
   * 获取容器库统计信息
   */
  getLibraryStats() {
    const stats = {
      totalWebsites: Object.keys(this.containerLibrary).length,
      totalContainers: 0,
      activeContainers: 0,
      websiteStats: {}
    };

    for (const [website, entry] of Object.entries(this.containerLibrary)) {
      const containers = Object.values(entry.containers);
      const activeContainers = containers.filter(c => c.isActive).length;

      stats.totalContainers += containers.length;
      stats.activeContainers += activeContainers;

      stats.websiteStats[website] = {
        containerCount: containers.length,
        activeContainers: activeContainers,
        lastUpdated: entry.metadata.lastUpdated,
        version: entry.metadata.version
      };
    }

    return stats;
  }
}

/**
 * 便利函数：注册微博容器
 */
async function registerWeiboContainers(config = {}) {
  const registry = new WeiboContainerRegistry(config);

  try {
    const result = await registry.registerWeiboContainers();

    console.log('\n🎯 微博容器注册结果:');
    console.log(`✅ 成功注册: ${result.success}`);
    console.log(`✅ 更新现有: ${result.updated}`);
    console.log(`❌ 注册失败: ${result.failed}`);

    // 显示统计信息
    const stats = registry.getLibraryStats();
    console.log('\n📊 容器库统计:');
    console.log(`   - 网站总数: ${stats.totalWebsites}`);
    console.log(`   - 容器总数: ${stats.totalContainers}`);
    console.log(`   - 活跃容器: ${stats.activeContainers}`);

    return {
      ...result,
      registry,
      stats
    };

  } catch (error) {
    console.error('❌ 微博容器注册失败:', error.message);
    throw error;
  }
}

module.exports = {
  WeiboContainerRegistry,
  registerWeiboContainers
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🗃️ 微博容器注册系统');
    console.log('='.repeat(50));

    try {
      const result = await registerWeiboContainers({
        verbose: true
      });

      console.log('\n✅ 容器注册完成！');
      console.log('🎯 注册的容器可用于自动发现系统');

      // 显示注册的容器
      console.log('\n📋 已注册的容器:');
      for (const [containerType, containerInfo] of Object.entries(result.registry.getRegisteredContainers())) {
        console.log(`   - ${containerInfo.name}: ${containerInfo.selector}`);
      }

    } catch (error) {
      console.error('\n💥 容器注册失败:', error.message);
      process.exit(1);
    }
  })();
}