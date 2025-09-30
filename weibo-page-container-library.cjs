#!/usr/bin/env node

/**
 * 微博页面容器分类和注册系统
 * 支持不同页面类型的自动配置
 */

const fs = require('fs');
const path = require('path');

class WeiboPageContainerLibrary {
  constructor(config = {}) {
    this.config = {
      containerLibraryPath: config.containerLibraryPath || './container-library.json',
      pageTypeConfigPath: config.pageTypeConfigPath || './weibo-page-type-configs.json',
      verbose: config.verbose || true,
      ...config
    };

    this.containerLibrary = {};
    this.pageTypeConfigs = {};
  }

  /**
   * 初始化容器库和页面类型配置
   */
  async initialize() {
    console.log('🗃️ 初始化微博页面容器库...');

    // 1. 加载容器库
    await this.loadContainerLibrary();

    // 2. 动态扫描和加载JSON配置文件
    await this.dynamicLoadJsonConfigs();

    // 3. 加载页面类型配置
    await this.loadPageTypeConfigs();

    console.log('✅ 容器库初始化完成');
  }

  /**
   * 加载现有容器库
   */
  async loadContainerLibrary() {
    if (fs.existsSync(this.config.containerLibraryPath)) {
      const libraryData = fs.readFileSync(this.config.containerLibraryPath, 'utf8');
      this.containerLibrary = JSON.parse(libraryData);

      if (this.config.verbose) {
        console.log('📚 已加载现有容器库');
        console.log(`   - 已注册网站: ${Object.keys(this.containerLibrary).length}`);
      }
    } else {
      this.containerLibrary = {};
      console.log('📚 创建新容器库');
    }

    // 确保微博网站条目存在
    if (!this.containerLibrary.weibo) {
      this.containerLibrary.weibo = {
        website: 'weibo.com',
        registeredAt: new Date().toISOString(),
        containers: {},
        pageTypes: {},
        metadata: {
          version: '2.0.0',
          lastUpdated: new Date().toISOString(),
          containerCount: 0,
          pageTypeCount: 0
        }
      };
    }
  }

  /**
   * 加载页面类型配置
   */
  async loadPageTypeConfigs() {
    if (fs.existsSync(this.config.pageTypeConfigPath)) {
      const configData = fs.readFileSync(this.config.pageTypeConfigPath, 'utf8');
      this.pageTypeConfigs = JSON.parse(configData);

      if (this.config.verbose) {
        console.log('📋 已加载页面类型配置');
        console.log(`   - 配置的页面类型: ${Object.keys(this.pageTypeConfigs).length}`);
      }
    } else {
      // 创建默认页面类型配置
      this.pageTypeConfigs = this.createDefaultPageTypeConfigs();
      await this.savePageTypeConfigs();
      console.log('📋 创建默认页面类型配置');
    }
  }

  /**
   * 动态扫描和加载JSON配置文件
   */
  async dynamicLoadJsonConfigs() {
    console.log('🔍 动态扫描JSON配置文件...');

    const configDirs = [
      './container-configs',
      './configs/containers',
      './weibo-container-configs',
      './sharedmodule/containers'
    ];

    let totalLoaded = 0;

    for (const configDir of configDirs) {
      try {
        const loaded = await this.loadConfigsFromDirectory(configDir);
        totalLoaded += loaded;

        if (loaded > 0 && this.config.verbose) {
          console.log(`   📁 ${configDir}: 加载了 ${loaded} 个配置文件`);
        }
      } catch (error) {
        if (this.config.verbose) {
          console.log(`   ⚠️ ${configDir}: ${error.message}`);
        }
      }
    }

    if (totalLoaded > 0) {
      console.log(`✅ 动态配置加载完成: ${totalLoaded} 个配置文件`);
    } else {
      console.log('ℹ️ 未找到外部配置文件，使用默认配置');
    }
  }

  /**
   * 从目录加载JSON配置文件
   */
  async loadConfigsFromDirectory(configDir) {
    if (!fs.existsSync(configDir)) {
      return 0;
    }

    const files = fs.readdirSync(configDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    let loadedCount = 0;

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(configDir, file);
        const configData = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(configData);

        // 根据文件类型和内容处理配置
        if (config.containers) {
          await this.mergeContainerConfig(config);
          loadedCount++;
        } else if (config.pageTypes) {
          await this.mergePageTypeConfigs(config.pageTypes);
          loadedCount++;
        } else if (config.website === 'weibo.com') {
          await this.mergeWeiboConfig(config);
          loadedCount++;
        }

      } catch (error) {
        if (this.config.verbose) {
          console.warn(`⚠️ 加载配置文件失败 ${file}:`, error.message);
        }
      }
    }

    return loadedCount;
  }

  /**
   * 合并容器配置
   */
  async mergeContainerConfig(config) {
    const weiboEntry = this.containerLibrary.weibo;

    if (!weiboEntry) {
      console.warn('⚠️ 微博网站条目不存在，跳过容器配置合并');
      return;
    }

    for (const [containerType, containerInfo] of Object.entries(config.containers)) {
      // 更新或创建容器
      if (weiboEntry.containers[containerType]) {
        // 更新现有容器，保留使用统计
        const existingUsage = weiboEntry.containers[containerType].usage;
        weiboEntry.containers[containerType] = {
          ...containerInfo,
          registeredAt: new Date().toISOString(),
          isActive: true,
          usage: existingUsage || {
            accessCount: 0,
            lastUsed: null,
            successRate: 0
          },
          validation: {
            selectorValid: true,
            lastValidation: new Date().toISOString(),
            validationMethod: 'dynamic-load'
          }
        };
      } else {
        // 创建新容器
        weiboEntry.containers[containerType] = {
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
            validationMethod: 'dynamic-load'
          }
        };
      }
    }

    if (this.config.verbose) {
      console.log(`🔄 已合并 ${Object.keys(config.containers).length} 个容器配置`);
    }
  }

  /**
   * 合并页面类型配置
   */
  async mergePageTypeConfigs(pageTypeConfigs) {
    for (const [pageTypeName, pageConfig] of Object.entries(pageTypeConfigs)) {
      this.pageTypeConfigs[pageTypeName] = {
        ...pageConfig,
        loadedFrom: 'dynamic',
        loadedAt: new Date().toISOString()
      };
    }

    if (this.config.verbose) {
      console.log(`🔄 已合并 ${Object.keys(pageTypeConfigs).length} 个页面类型配置`);
    }
  }

  /**
   * 合并微博配置
   */
  async mergeWeiboConfig(config) {
    const weiboEntry = this.containerLibrary.weibo;

    if (!weiboEntry) {
      console.warn('⚠️ 微博网站条目不存在，跳过微博配置合并');
      return;
    }

    // 合并容器
    if (config.containers) {
      await this.mergeContainerConfig({ containers: config.containers });
    }

    // 合并页面类型
    if (config.pageTypes) {
      await this.mergePageTypeConfigs(config.pageTypes);
    }

    // 更新元数据
    if (config.metadata) {
      weiboEntry.metadata = {
        ...weiboEntry.metadata,
        ...config.metadata,
        lastUpdated: new Date().toISOString(),
        dynamicConfigs: true
      };
    }

    if (this.config.verbose) {
      console.log('🔄 已合并微博完整配置');
    }
  }

  /**
   * 创建默认页面类型配置
   */
  createDefaultPageTypeConfigs() {
    return {
      homepage: {
        name: '微博主页',
        description: '无限垂直刷新信息流页面',
        urlPattern: '^https?://weibo\\.com/?$',
        scrollType: 'infinite',
        containers: {
          required: ['page', 'feed', 'post'],
          optional: []
        },
        operations: {
          scroll: {
            condition: 'viewport_no_change',
            action: 'scroll_to_bottom',
            interval: 2000,
            maxAttempts: 50
          },
          extract: {
            target: 'posts',
            selector: '[class*="Card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])',
            limit: 50
          }
        }
      },
      search: {
        name: '微博搜索结果',
        description: '分页式搜索结果页面',
        urlPattern: '^https?://weibo\\.com/search.*',
        scrollType: 'pagination',
        containers: {
          required: ['page', 'feed', 'post', 'pagination'],
          optional: ['next_page']
        },
        operations: {
          scroll: {
            condition: 'element_count_reached',
            action: 'click_next_page',
            interval: 3000,
            maxAttempts: 10
          },
          pagination: {
            selector: '[class*="page"], [class*="pagination"], .next, [aria-label*="next"]',
            condition: 'not_last_page'
          }
        }
      },
      user_profile: {
        name: '用户主页',
        description: '用户个人微博页面',
        urlPattern: '^https?://weibo\\.com/u/\\d+',
        scrollType: 'infinite',
        containers: {
          required: ['page', 'feed', 'post'],
          optional: ['user_info']
        },
        operations: {
          scroll: {
            condition: 'viewport_no_change',
            action: 'scroll_to_bottom',
            interval: 2000,
            maxAttempts: 30
          },
          extract: {
            target: 'user_posts',
            selector: '[class*="Card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])',
            limit: 30
          }
        }
      },
      single_post: {
        name: '单条微博详情',
        description: '单条微博及其评论页面',
        urlPattern: '^https?://weibo\\.com/\\d+/',
        scrollType: 'infinite',
        containers: {
          required: ['page', 'post', 'comments'],
          optional: ['comment_form']
        },
        operations: {
          scroll: {
            condition: 'viewport_no_change',
            action: 'scroll_to_bottom',
            interval: 1500,
            maxAttempts: 20
          },
          extract: {
            target: 'comments',
            selector: '[class*="comment"], [class*="reply"]',
            limit: 100
          }
        }
      }
    };
  }

  /**
   * 注册基础容器到容器库
   */
  async registerBaseContainers(containers) {
    console.log('🔄 注册基础容器到容器库...');

    const weiboEntry = this.containerLibrary.weibo;
    const registrationResults = {
      success: 0,
      updated: 0,
      failed: 0,
      details: {}
    };

    // 注册每个基础容器
    for (const [containerType, containerInfo] of Object.entries(containers)) {
      try {
        const result = await this.registerBaseContainer(containerType, containerInfo, weiboEntry);

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

    if (this.config.verbose) {
      console.log('📊 基础容器注册统计:');
      console.log(`   - 成功注册: ${registrationResults.success}`);
      console.log(`   - 更新现有: ${registrationResults.updated}`);
      console.log(`   - 注册失败: ${registrationResults.failed}`);
      console.log(`   - 总容器数: ${weiboEntry.metadata.containerCount}`);
    }

    return registrationResults;
  }

  /**
   * 注册单个基础容器
   */
  async registerBaseContainer(containerType, containerInfo, weiboEntry) {
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
      discovery: {
        strategy: 'precise-selector',
        specificityThreshold: 100,
        uniquenessThreshold: 0.8,
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

    return {
      success: true,
      updated: isUpdate,
      containerType,
      containerInfo,
      registeredContainer
    };
  }

  /**
   * 注册页面类型配置
   */
  async registerPageTypeConfig(pageTypeName, pageConfig) {
    console.log(`📋 注册页面类型配置: ${pageTypeName}`);

    const weiboEntry = this.containerLibrary.weibo;

    // 确保pageTypes对象存在
    if (!weiboEntry.pageTypes) {
      weiboEntry.pageTypes = {};
    }

    // 注册页面类型配置
    weiboEntry.pageTypes[pageTypeName] = {
      ...pageConfig,
      registeredAt: new Date().toISOString(),
      isActive: true,
      usage: {
        accessCount: 0,
        lastUsed: null,
        successRate: 0
      }
    };

    // 更新元数据
    weiboEntry.metadata.lastUpdated = new Date().toISOString();
    weiboEntry.metadata.pageTypeCount = Object.keys(weiboEntry.pageTypes).length;

    if (this.config.verbose) {
      console.log(`✅ 页面类型配置已注册: ${pageConfig.name}`);
      console.log(`   - URL模式: ${pageConfig.urlPattern}`);
      console.log(`   - 滚动类型: ${pageConfig.scrollType}`);
      console.log(`   - 必需容器: ${pageConfig.containers.required.join(', ')}`);
    }

    return {
      success: true,
      pageTypeName,
      pageConfig
    };
  }

  /**
   * 根据URL自动检测页面类型
   */
  detectPageType(url) {
    for (const [pageTypeName, pageConfig] of Object.entries(this.pageTypeConfigs)) {
      const pattern = new RegExp(pageConfig.urlPattern);
      if (pattern.test(url)) {
        return pageTypeName;
      }
    }
    return 'unknown';
  }

  /**
   * 获取页面类型的容器配置
   */
  getPageTypeContainers(pageTypeName) {
    const pageConfig = this.pageTypeConfigs[pageTypeName];
    if (!pageConfig) {
      return null;
    }

    const containers = {};
    const weiboEntry = this.containerLibrary.weibo;

    // 收集必需容器
    for (const containerType of pageConfig.containers.required) {
      if (weiboEntry.containers[containerType]) {
        containers[containerType] = weiboEntry.containers[containerType];
      }
    }

    // 收集可选容器
    for (const containerType of pageConfig.containers.optional) {
      if (weiboEntry.containers[containerType]) {
        containers[containerType] = weiboEntry.containers[containerType];
      }
    }

    return {
      pageConfig,
      containers,
      required: pageConfig.containers.required.filter(type => containers[type]),
      optional: pageConfig.containers.optional.filter(type => containers[type])
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
   * 保存页面类型配置
   */
  async savePageTypeConfigs() {
    const configDir = path.dirname(this.config.pageTypeConfigPath);

    // 确保目录存在
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    // 保存页面类型配置
    fs.writeFileSync(this.config.pageTypeConfigPath, JSON.stringify(this.pageTypeConfigs, null, 2));

    if (this.config.verbose) {
      console.log(`💾 页面类型配置已保存到: ${this.config.pageTypeConfigPath}`);
    }
  }

  /**
   * 获取容器库统计信息
   */
  getLibraryStats() {
    const stats = {
      totalWebsites: Object.keys(this.containerLibrary).length,
      totalContainers: 0,
      activeContainers: 0,
      totalPageTypes: 0,
      activePageTypes: 0,
      websiteStats: {}
    };

    for (const [website, entry] of Object.entries(this.containerLibrary)) {
      const containers = Object.values(entry.containers);
      const activeContainers = containers.filter(c => c.isActive).length;
      const pageTypes = entry.pageTypes ? Object.values(entry.pageTypes) : [];
      const activePageTypes = pageTypes.filter(pt => pt.isActive).length;

      stats.totalContainers += containers.length;
      stats.activeContainers += activeContainers;
      stats.totalPageTypes += pageTypes.length;
      stats.activePageTypes += activePageTypes;

      stats.websiteStats[website] = {
        containerCount: containers.length,
        activeContainers: activeContainers,
        pageTypeCount: pageTypes.length,
        activePageTypes: activePageTypes,
        lastUpdated: entry.metadata.lastUpdated,
        version: entry.metadata.version
      };
    }

    return stats;
  }

  /**
   * 创建示例配置文件和目录结构
   */
  createSampleConfigStructures() {
    console.log('🏗️ 创建示例配置文件和目录结构...');

    const configDirs = [
      './container-configs',
      './configs/containers',
      './weibo-container-configs'
    ];

    // 创建目录
    for (const configDir of configDirs) {
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
        console.log(`   📁 创建目录: ${configDir}`);
      }
    }

    // 创建示例容器配置文件
    const containerConfig = {
      website: 'weibo.com',
      version: '2.0.0',
      containers: {
        page: {
          name: '页面容器',
          selector: '#app',
          description: '整个微博页面的根容器',
          priority: 1,
          specificity: 1000
        },
        feed: {
          name: '主帖子列表容器',
          selector: '#app [class*="feed"]',
          description: '包含所有微博帖子的主要容器',
          priority: 2,
          specificity: 1010
        },
        post: {
          name: '帖子容器',
          selector: '[class*="Card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])',
          description: '单个微博帖子的容器',
          priority: 3,
          specificity: 40
        }
      },
      metadata: {
        description: '微博基础容器配置',
        author: 'Container Library System',
        createdAt: new Date().toISOString()
      }
    };

    // 创建示例页面类型配置文件
    const pageTypeConfig = {
      pageTypes: {
        search_page: {
          name: '搜索结果页面',
          description: '微博搜索结果的分页式页面',
          urlPattern: '^https?://weibo\\.com/search.*',
          scrollType: 'pagination',
          containers: {
            required: ['page', 'feed', 'post', 'pagination'],
            optional: ['next_page', 'search_filters']
          },
          operations: {
            scroll: {
              condition: 'element_count_reached',
              action: 'click_next_page',
              interval: 3000,
              maxAttempts: 10
            },
            pagination: {
              selector: '[class*="page"], [class*="pagination"], .next, [aria-label*="next"]',
              condition: 'not_last_page'
            }
          }
        },
        hot_search: {
          name: '热搜页面',
          description: '微博热搜榜单页面',
          urlPattern: '^https?://weibo\\.com/hot.*',
          scrollType: 'static',
          containers: {
            required: ['page', 'hot_list'],
            optional: ['hot_filters', 'refresh_button']
          },
          operations: {
            extract: {
              target: 'hot_topics',
              selector: '[class*="hot"], [class*="trending"]',
              limit: 50
            }
          }
        }
      },
      metadata: {
        description: '微博页面类型扩展配置',
        author: 'Container Library System',
        createdAt: new Date().toISOString()
      }
    };

    // 创建示例完整配置文件
    const completeConfig = {
      website: 'weibo.com',
      version: '2.0.0',
      containers: {
        comments_section: {
          name: '评论区容器',
          selector: '[class*="comment"], [class*="reply"]',
          description: '微博评论区域容器',
          priority: 4,
          specificity: 20
        },
        user_info_panel: {
          name: '用户信息面板',
          selector: '[class*="user"], [class*="profile"]',
          description: '用户信息展示面板',
          priority: 5,
          specificity: 15
        }
      },
      pageTypes: {
        comments_page: {
          name: '评论详情页',
          description: '单条微博的评论页面',
          urlPattern: '^https?://weibo\\.com/\\d+/.*',
          scrollType: 'infinite',
          containers: {
            required: ['page', 'post', 'comments_section'],
            optional: ['user_info_panel', 'comment_form']
          },
          operations: {
            scroll: {
              condition: 'viewport_no_change',
              action: 'scroll_to_bottom',
              interval: 1500,
              maxAttempts: 30
            }
          }
        }
      },
      metadata: {
        description: '微博扩展容器和页面类型配置',
        author: 'Container Library System',
        createdAt: new Date().toISOString()
      }
    };

    // 保存配置文件
    const configFiles = [
      { path: './container-configs/weibo-basic-containers.json', data: containerConfig },
      { path: './configs/containers/weibo-page-types.json', data: pageTypeConfig },
      { path: './weibo-container-configs/weibo-extended.json', data: completeConfig }
    ];

    for (const { path: filePath, data } of configFiles) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`   📄 创建配置文件: ${filePath}`);
    }

    console.log('✅ 示例配置文件创建完成');
    console.log('   📁 配置目录结构:');
    for (const configDir of configDirs) {
      console.log(`     - ${configDir}/`);
    }
    console.log('   📄 配置文件:');
    for (const { path: filePath } of configFiles) {
      console.log(`     - ${filePath}`);
    }

    return {
      configDirs,
      configFiles: configFiles.map(f => f.path)
    };
  }

  /**
   * 导出当前匹配的容器到独立容器库
   */
  exportMatchedContainers(containerLibraryPath = './exported-containers.json') {
    console.log('📦 导出当前匹配的容器...');

    const weiboEntry = this.containerLibrary.weibo;
    const exportedData = {
      website: 'weibo.com',
      exportTime: new Date().toISOString(),
      containers: {},
      pageTypes: {},
      metadata: {
        version: '2.0.0',
        source: 'auto-discovery',
        totalContainers: Object.keys(weiboEntry.containers).length,
        totalPageTypes: weiboEntry.pageTypes ? Object.keys(weiboEntry.pageTypes).length : 0
      }
    };

    // 导出所有容器
    for (const [containerType, containerInfo] of Object.entries(weiboEntry.containers)) {
      exportedData.containers[containerType] = {
        name: containerInfo.name,
        selector: containerInfo.selector,
        description: containerInfo.description,
        priority: containerInfo.priority,
        specificity: containerInfo.specificity,
        discovery: containerInfo.discovery,
        usage: containerInfo.usage
      };
    }

    // 导出页面类型配置
    if (weiboEntry.pageTypes) {
      for (const [pageTypeName, pageConfig] of Object.entries(weiboEntry.pageTypes)) {
        exportedData.pageTypes[pageTypeName] = {
          name: pageConfig.name,
          description: pageConfig.description,
          urlPattern: pageConfig.urlPattern,
          scrollType: pageConfig.scrollType,
          containers: pageConfig.containers,
          operations: pageConfig.operations
        };
      }
    }

    // 保存导出的容器库
    fs.writeFileSync(containerLibraryPath, JSON.stringify(exportedData, null, 2));

    console.log(`✅ 容器库已导出到: ${containerLibraryPath}`);
    console.log(`   - 导出容器数: ${exportedData.metadata.totalContainers}`);
    console.log(`   - 导出页面类型数: ${exportedData.metadata.totalPageTypes}`);

    return exportedData;
  }
}

/**
 * 便利函数：注册基础容器
 */
async function registerWeiboBaseContainers(containers, config = {}) {
  const library = new WeiboPageContainerLibrary(config);

  try {
    await library.initialize();
    const result = await library.registerBaseContainers(containers);
    await library.saveContainerLibrary();

    console.log('\n🎯 基础容器注册结果:');
    console.log(`✅ 成功注册: ${result.success}`);
    console.log(`✅ 更新现有: ${result.updated}`);
    console.log(`❌ 注册失败: ${result.failed}`);

    // 显示统计信息
    const stats = library.getLibraryStats();
    console.log('\n📊 容器库统计:');
    console.log(`   - 网站总数: ${stats.totalWebsites}`);
    console.log(`   - 容器总数: ${stats.totalContainers}`);
    console.log(`   - 活跃容器: ${stats.activeContainers}`);

    return {
      ...result,
      library,
      stats
    };

  } catch (error) {
    console.error('❌ 基础容器注册失败:', error.message);
    throw error;
  }
}

/**
 * 便利函数：注册页面类型配置
 */
async function registerWeiboPageTypeConfig(pageTypeName, pageConfig, config = {}) {
  const library = new WeiboPageContainerLibrary(config);

  try {
    await library.initialize();
    const result = await library.registerPageTypeConfig(pageTypeName, pageConfig);
    await library.saveContainerLibrary();

    console.log('\n✅ 页面类型配置注册完成!');

    return {
      ...result,
      library
    };

  } catch (error) {
    console.error('❌ 页面类型配置注册失败:', error.message);
    throw error;
  }
}

module.exports = {
  WeiboPageContainerLibrary,
  registerWeiboBaseContainers,
  registerWeiboPageTypeConfig
};

// 命令行执行
if (require.main === module) {
  (async () => {
    console.log('🗃️ 微博页面容器库系统 - 动态JSON加载版本');
    console.log('='.repeat(60));

    try {
      const library = new WeiboPageContainerLibrary({ verbose: true });

      console.log('\n🏗️ 阶段1: 创建示例配置文件');
      library.createSampleConfigStructures();

      console.log('\n🚀 阶段2: 初始化容器库（包含动态配置加载）');
      await library.initialize();

      // 注册当前已发现的容器
      const currentContainers = {
        page: {
          name: '页面容器',
          selector: '#app',
          description: '整个微博页面的根容器',
          priority: 1,
          specificity: 1000
        },
        feed: {
          name: '主帖子列表容器',
          selector: '#app [class*="feed"]',
          description: '包含所有微博帖子的主要容器',
          priority: 2,
          specificity: 1010
        },
        post: {
          name: '帖子容器',
          selector: '[class*="Card"]:not([class*="head"]):not([class*="nav"]):not([class*="footer"])',
          description: '单个微博帖子的容器',
          priority: 3,
          specificity: 40
        }
      };

      console.log('\n📝 阶段3: 注册基础容器');
      const result = await library.registerBaseContainers(currentContainers);
      await library.saveContainerLibrary();

      console.log('\n✅ 容器注册完成！');

      // 导出容器库
      const exported = library.exportMatchedContainers();
      console.log('\n📦 容器库已导出！');

      // 显示动态加载统计
      console.log('\n📊 动态配置加载统计:');
      const stats = library.getLibraryStats();
      console.log(`   - 总容器数: ${stats.totalContainers}`);
      console.log(`   - 活跃容器: ${stats.activeContainers}`);
      console.log(`   - 页面类型数: ${Object.keys(library.pageTypeConfigs).length}`);

      // 显示注册的容器
      console.log('\n📋 已注册的容器:');
      for (const [containerType, containerInfo] of Object.entries(library.containerLibrary.weibo.containers)) {
        const validationMethod = containerInfo.validation?.validationMethod || 'unknown';
        console.log(`   - ${containerInfo.name}: ${containerInfo.selector} (${validationMethod})`);
      }

      // 显示页面类型配置
      console.log('\n📋 页面类型配置:');
      for (const [pageTypeName, pageConfig] of Object.entries(library.pageTypeConfigs)) {
        const loadedFrom = pageConfig.loadedFrom || 'default';
        console.log(`   - ${pageConfig.name}: ${pageConfig.urlPattern} (${loadedFrom})`);
      }

      // 测试页面类型检测
      console.log('\n🔍 页面类型检测测试:');
      const testUrls = [
        'https://weibo.com',
        'https://weibo.com/search?q=test',
        'https://weibo.com/u/1234567890',
        'https://weibo.com/1234567890/abc',
        'https://weibo.com/hot'
      ];

      for (const url of testUrls) {
        const detectedType = library.detectPageType(url);
        const pageConfig = library.pageTypeConfigs[detectedType];
        const configName = pageConfig ? pageConfig.name : '未知页面类型';
        console.log(`   ${url} -> ${detectedType} (${configName})`);
      }

      console.log('\n🎉 容器库系统初始化完成！');
      console.log('💡 现在可以通过添加JSON配置文件到配置目录来动态扩展容器和页面类型');

    } catch (error) {
      console.error('\n💥 容器库操作失败:', error.message);
      process.exit(1);
    }
  })();
}