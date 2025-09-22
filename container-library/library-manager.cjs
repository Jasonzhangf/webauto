#!/usr/bin/env node

/**
 * 文件式容器库管理器
 * 提供基于文件夹结构的容器加载和管理功能
 */

const fs = require('fs');
const path = require('path');

class FileBasedContainerManager {
  constructor(containerLibraryPath = './container-library') {
    this.containerLibraryPath = containerLibraryPath;
    this.globalIndexPath = path.join(containerLibraryPath, 'global-index.json');
    this.cache = new Map();
    this.lastRefresh = 0;
    this.cacheTimeout = 30000; // 30秒缓存
  }

  /**
   * 刷新缓存
   */
  async refreshCache() {
    const now = Date.now();
    if (now - this.lastRefresh < this.cacheTimeout) {
      return;
    }

    this.cache.clear();
    this.lastRefresh = now;

    try {
      const globalIndex = JSON.parse(fs.readFileSync(this.globalIndexPath, 'utf8'));

      for (const [website, websiteInfo] of Object.entries(globalIndex.websites)) {
        const indexPath = path.join(this.containerLibraryPath, website, 'index.json');
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        const websiteCache = new Map();
        for (const container of indexData.containers) {
          const containerPath = path.join(this.containerLibraryPath, website, container.fileName);
          const containerData = JSON.parse(fs.readFileSync(containerPath, 'utf8'));
          websiteCache.set(container.id, containerData);
        }

        this.cache.set(website, websiteCache);
      }

      console.log('🔄 容器库缓存已刷新');
    } catch (error) {
      console.error('❌ 刷新缓存失败:', error.message);
    }
  }

  /**
   * 加载所有容器
   */
  async loadAllContainers() {
    await this.refreshCache();

    const allContainers = {};
    for (const [website, websiteCache] of this.cache.entries()) {
      allContainers[website] = {
        website: website,
        containers: Object.fromEntries(websiteCache),
        containerCount: websiteCache.size,
        metadata: {
          loadedAt: new Date().toISOString(),
          source: 'file-based-library'
        }
      };
    }

    return allContainers;
  }

  /**
   * 获取指定网站的容器
   */
  async getWebsiteContainers(website) {
    await this.refreshCache();
    return this.cache.get(website) || new Map();
  }

  /**
   * 查找容器
   */
  async findContainer(website, containerId) {
    await this.refreshCache();
    const websiteCache = this.cache.get(website);
    return websiteCache ? websiteCache.get(containerId) : null;
  }

  /**
   * 按选择器查找容器
   */
  async findContainerBySelector(website, selector) {
    await this.refreshCache();
    const websiteCache = this.cache.get(website);

    if (!websiteCache) {
      return null;
    }

    for (const [containerId, containerData] of websiteCache.entries()) {
      if (containerData.selector === selector) {
        return { id: containerId, data: containerData };
      }
    }

    return null;
  }

  /**
   * 按类型查找容器
   */
  async findContainersByType(website, type) {
    await this.refreshCache();
    const websiteCache = this.cache.get(website);
    const results = [];

    if (websiteCache) {
      for (const [containerId, containerData] of websiteCache.entries()) {
        if (containerData.type === type) {
          results.push({ id: containerId, data: containerData });
        }
      }
    }

    return results;
  }

  /**
   * 获取容器统计信息
   */
  async getStatistics() {
    await this.refreshCache();

    const stats = {
      totalContainers: 0,
      totalWebsites: 0,
      typeDistribution: {},
      websiteDistribution: {}
    };

    for (const [website, websiteCache] of this.cache.entries()) {
      stats.totalWebsites++;
      stats.totalContainers += websiteCache.size;
      stats.websiteDistribution[website] = websiteCache.size;

      for (const [containerId, containerData] of websiteCache.entries()) {
        const type = containerData.type || 'container';
        stats.typeDistribution[type] = (stats.typeDistribution[type] || 0) + 1;
      }
    }

    return stats;
  }
}

module.exports = FileBasedContainerManager;

// 命令行测试
if (require.main === module) {
  const manager = new FileBasedContainerManager();

  (async () => {
    console.log('🔍 测试文件式容器库管理器...');

    const stats = await manager.getStatistics();
    console.log('📊 统计信息:', stats);

    const weiboContainers = await manager.getWebsiteContainers('weibo');
    console.log('🌐 微博容器数量:', weiboContainers.size);

    process.exit(0);
  })();
}