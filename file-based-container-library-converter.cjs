#!/usr/bin/env node

/**
 * 文件式容器库转换器
 * 将单一JSON文件容器库转换为文件夹结构的独立容器文件
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileBasedContainerLibraryConverter {
  constructor() {
    this.sourceLibraryPath = './container-library.json';
    this.backupLibraryPath = './container-library-backup.json';
    this.targetDirectory = './container-library';
    this.websiteSubdirectories = {
      'weibo': './container-library/weibo'
    };

    // 容器类型映射
    this.containerTypeMapping = {
      'container': 'container',
      'interactive': 'button',
      'indicator': 'indicator',
      'dropdown': 'dropdown'
    };
  }

  /**
   * 生成选择器哈希
   */
  generateSelectorHash(selector) {
    // 移除特殊字符，生成简洁的哈希
    const cleanSelector = selector.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
    return crypto.createHash('md5').update(selector).digest('hex').substring(0, 8);
  }

  /**
   * 生成容器文件名
   */
  generateContainerFileName(containerId, containerData, website) {
    const selector = containerData.selector || containerId;
    const selectorHash = this.generateSelectorHash(selector);
    const containerType = this.containerTypeMapping[containerData.type] || 'container';

    // 生成描述性的文件名前缀
    let prefix = '';
    if (containerId.includes('page') || containerId.includes('app')) {
      prefix = 'page';
    } else if (containerId.includes('feed') || containerId.includes('main')) {
      prefix = 'feed';
    } else if (containerId.includes('post') || containerId.includes('card')) {
      prefix = 'post';
    } else if (containerId.includes('comment')) {
      prefix = 'comment';
    } else if (containerId.includes('load') || containerId.includes('more')) {
      prefix = 'load';
    } else if (containerId.includes('button') || containerId.includes('icon')) {
      prefix = 'button';
    } else if (containerId.includes('spinner') || containerId.includes('loading')) {
      prefix = 'loading';
    } else if (containerId.includes('scroll') || containerId.includes('virtual')) {
      prefix = 'scroll';
    } else if (containerId.includes('reply') || containerId.includes('nested')) {
      prefix = 'reply';
    } else {
      prefix = 'general';
    }

    // 组合文件名：前缀_选择器哈希_类型.json
    const fileName = `${prefix}_${selectorHash}_${containerType}.json`;
    return fileName;
  }

  /**
   * 创建目录结构
   */
  createDirectoryStructure() {
    console.log('📁 创建目录结构...');

    // 创建主容器库目录
    if (!fs.existsSync(this.targetDirectory)) {
      fs.mkdirSync(this.targetDirectory, { recursive: true });
      console.log(`   ✅ 创建主目录: ${this.targetDirectory}`);
    }

    // 创建各网站的子目录
    for (const [website, subdirectory] of Object.entries(this.websiteSubdirectories)) {
      if (!fs.existsSync(subdirectory)) {
        fs.mkdirSync(subdirectory, { recursive: true });
        console.log(`   ✅ 创建网站目录: ${subdirectory}`);
      }
    }

    return true;
  }

  /**
   * 读取原始容器库
   */
  readSourceLibrary() {
    try {
      const data = fs.readFileSync(this.sourceLibraryPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('❌ 读取原始容器库失败:', error.message);
      return null;
    }
  }

  /**
   * 备份原始容器库
   */
  backupSourceLibrary() {
    try {
      const data = fs.readFileSync(this.sourceLibraryPath, 'utf8');
      fs.writeFileSync(this.backupLibraryPath, data);
      console.log('💾 原始容器库备份完成');
      return true;
    } catch (error) {
      console.error('❌ 备份原始容器库失败:', error.message);
      return false;
    }
  }

  /**
   * 转换单个容器为独立文件
   */
  convertContainerToFile(website, containerId, containerData) {
    const targetDir = this.websiteSubdirectories[website];
    if (!targetDir) {
      console.log(`⚠️ 跳过未知网站的容器: ${website}`);
      return false;
    }

    // 生成文件名
    const fileName = this.generateContainerFileName(containerId, containerData, website);
    const filePath = path.join(targetDir, fileName);

    // 创建独立的容器文件
    const containerFile = {
      id: containerId,
      website: website,
      ...containerData,
      metadata: {
        generatedFrom: 'container-library.json',
        generatedAt: new Date().toISOString(),
        originalPriority: containerData.priority || 999,
        selectorHash: this.generateSelectorHash(containerData.selector || ''),
        fileVersion: '1.0.0'
      }
    };

    // 写入文件
    try {
      fs.writeFileSync(filePath, JSON.stringify(containerFile, null, 2));
      console.log(`   ✅ 转换: ${containerId} -> ${fileName}`);
      return {
        success: true,
        containerId,
        fileName,
        filePath,
        selector: containerData.selector
      };
    } catch (error) {
      console.error(`   ❌ 转换失败: ${containerId} - ${error.message}`);
      return {
        success: false,
        containerId,
        error: error.message
      };
    }
  }

  /**
   * 生成目录索引文件
   */
  generateIndexFile(website, convertedContainers) {
    const targetDir = this.websiteSubdirectories[website];
    const indexPath = path.join(targetDir, 'index.json');

    const indexData = {
      website: website,
      generatedAt: new Date().toISOString(),
      containerCount: convertedContainers.length,
      containers: convertedContainers.map(container => ({
        id: container.containerId,
        fileName: container.fileName,
        selector: container.selector,
        type: container.type,
        priority: container.priority
      })),
      searchIndex: {
        byType: {},
        byPriority: {},
        byName: {}
      }
    };

    // 创建搜索索引
    convertedContainers.forEach(container => {
      const type = container.type || 'container';
      const priority = container.priority || 999;
      const name = container.containerId;

      if (!indexData.searchIndex.byType[type]) {
        indexData.searchIndex.byType[type] = [];
      }
      indexData.searchIndex.byType[type].push(container.containerId);

      if (!indexData.searchIndex.byPriority[priority]) {
        indexData.searchIndex.byPriority[priority] = [];
      }
      indexData.searchIndex.byPriority[priority].push(container.containerId);

      indexData.searchIndex.byName[name] = container.containerId;
    });

    // 写入索引文件
    try {
      fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
      console.log(`   📋 生成索引文件: ${website}/index.json`);
      return true;
    } catch (error) {
      console.error(`   ❌ 生成索引文件失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 生成全局索引文件
   */
  generateGlobalIndex(allWebsitesData) {
    const globalIndexPath = path.join(this.targetDirectory, 'global-index.json');

    const globalIndex = {
      generatedAt: new Date().toISOString(),
      websites: {},
      statistics: {
        totalContainers: 0,
        totalWebsites: 0,
        typeDistribution: {},
        priorityDistribution: {}
      }
    };

    // 处理每个网站的数据
    for (const [website, data] of Object.entries(allWebsitesData)) {
      // 检查数据结构
      if (data.containers && Array.isArray(data.containers)) {
        globalIndex.websites[website] = {
          containerCount: data.containers.length,
          path: this.websiteSubdirectories[website],
          lastUpdated: data.metadata?.lastUpdated || new Date().toISOString()
        };

        globalIndex.statistics.totalContainers += data.containers.length;
        globalIndex.statistics.totalWebsites++;

        // 统计类型分布
        data.containers.forEach(container => {
          const type = container.type || 'container';
          globalIndex.statistics.typeDistribution[type] = (globalIndex.statistics.typeDistribution[type] || 0) + 1;

          const priority = container.priority || 999;
          globalIndex.statistics.priorityDistribution[priority] = (globalIndex.statistics.priorityDistribution[priority] || 0) + 1;
        });
      } else if (data.containers && typeof data.containers === 'object') {
        // 处理对象形式的容器
        const containerArray = Object.values(data.containers);
        globalIndex.websites[website] = {
          containerCount: containerArray.length,
          path: this.websiteSubdirectories[website],
          lastUpdated: data.metadata?.lastUpdated || new Date().toISOString()
        };

        globalIndex.statistics.totalContainers += containerArray.length;
        globalIndex.statistics.totalWebsites++;

        // 统计类型分布
        containerArray.forEach(container => {
          const type = container.type || 'container';
          globalIndex.statistics.typeDistribution[type] = (globalIndex.statistics.typeDistribution[type] || 0) + 1;

          const priority = container.priority || 999;
          globalIndex.statistics.priorityDistribution[priority] = (globalIndex.statistics.priorityDistribution[priority] || 0) + 1;
        });
      }
    }

    // 写入全局索引文件
    try {
      fs.writeFileSync(globalIndexPath, JSON.stringify(globalIndex, null, 2));
      console.log(`   🌐 生成全局索引文件: global-index.json`);
      return true;
    } catch (error) {
      console.error(`   ❌ 生成全局索引文件失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 创建文件式容器库管理器
   */
  createFileManager() {
    const managerPath = path.join(this.targetDirectory, 'library-manager.cjs');

    const managerCode = `#!/usr/bin/env node

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
        const indexPath = path.join(this.containerLibraryPath, websiteInfo.path, 'index.json');
        const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

        const websiteCache = new Map();
        for (const container of indexData.containers) {
          const containerPath = path.join(this.containerLibraryPath, websiteInfo.path, container.fileName);
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
}`;

    try {
      fs.writeFileSync(managerPath, managerCode);
      console.log(`   🔧 创建管理器: ${managerPath}`);
      return true;
    } catch (error) {
      console.error(`   ❌ 创建管理器失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 执行转换过程
   */
  async performConversion() {
    console.log('🔄 开始文件式容器库转换...');
    console.log('====================================');

    // 1. 备份原始文件
    if (!this.backupSourceLibrary()) {
      console.log('❌ 转换失败：无法备份原始文件');
      return false;
    }

    // 2. 创建目录结构
    if (!this.createDirectoryStructure()) {
      console.log('❌ 转换失败：无法创建目录结构');
      return false;
    }

    // 3. 读取原始容器库
    const sourceLibrary = this.readSourceLibrary();
    if (!sourceLibrary) {
      console.log('❌ 转换失败：无法读取原始容器库');
      return false;
    }

    let totalConverted = 0;
    let totalFailed = 0;

    // 4. 转换每个网站的容器
    for (const [website, websiteData] of Object.entries(sourceLibrary)) {
      if (website === 'version' || website === 'metadata') {
        continue; // 跳过版本信息
      }

      console.log(`\n📋 转换网站: ${website}`);
      console.log(`   📊 容器数量: ${Object.keys(websiteData.containers).length}`);

      const convertedContainers = [];

      // 转换每个容器
      for (const [containerId, containerData] of Object.entries(websiteData.containers)) {
        const result = this.convertContainerToFile(website, containerId, containerData);

        if (result.success) {
          convertedContainers.push(result);
          totalConverted++;
        } else {
          totalFailed++;
        }
      }

      // 生成网站索引文件
      if (convertedContainers.length > 0) {
        this.generateIndexFile(website, convertedContainers);
      }

      console.log(`   ✅ ${website}: ${convertedContainers.length} 个容器转换成功`);
    }

    // 5. 生成全局索引
    this.generateGlobalIndex(sourceLibrary);

    // 6. 创建文件管理器
    this.createFileManager();

    // 7. 显示转换结果
    console.log('\n🎉 转换完成！');
    console.log('====================');
    console.log(`📊 转换统计:`);
    console.log(`   - 成功转换: ${totalConverted} 个容器`);
    console.log(`   - 转换失败: ${totalFailed} 个容器`);
    console.log(`   - 目标目录: ${this.targetDirectory}`);
    console.log(`   - 备份文件: ${this.backupLibraryPath}`);
    console.log('\n🔧 使用方法:');
    console.log('   const FileBasedContainerManager = require("./container-library/library-manager.cjs");');
    console.log('   const manager = new FileBasedContainerManager();');
    console.log('   const containers = await manager.loadAllContainers();');

    return true;
  }
}

// 命令行执行
if (require.main === module) {
  const converter = new FileBasedContainerLibraryConverter();

  console.log('🗂️ 文件式容器库转换系统');
  console.log('==========================');

  converter.performConversion().then((success) => {
    if (success) {
      console.log('\n🎯 文件式容器库创建完成！');
      console.log('容器库已成功转换为文件夹结构，每个容器现在都是独立的JSON文件。');
    } else {
      console.log('\n❌ 转换失败，请检查错误信息。');
      process.exit(1);
    }
  }).catch((error) => {
    console.error('\n❌ 转换过程中发生错误:', error);
    process.exit(1);
  });
}

module.exports = FileBasedContainerLibraryConverter;