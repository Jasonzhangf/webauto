#!/usr/bin/env node

/**
 * 简化版微博搜索工作量脚本
 * 使用已有的测试脚本架构，专注于搜索和保存功能
 * 避免复杂的浏览器管理器依赖
 */

import { WeiboSearchOperation } from './src/micro-operations/SearchOperations.js';
import { FileSaveOperation } from './src/micro-operations/FileSaveOperation.js';
import { CookieOperation } from './src/micro-operations/CookieOperation.js';

class SimpleWeiboSearchWorkload {
  constructor(options = {}) {
    this.options = {
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      ...options
    };

    this.manager = null;
    this.page = null;
    this.searchOperation = null;
    this.saveOperation = null;
    this.cookieOperation = null;
  }

  async initialize() {
    console.log('🚀 初始化简化微博搜索工作量...');

    try {
      // 动态导入Playwright
      console.log('📦 正在导入Playwright...');
      const { chromium } = await import('playwright');

      // 启动浏览器
      console.log('🌐 正在启动浏览器...');
      this.manager = await chromium.launch({
        headless: this.options.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      // 创建上下文和页面
      console.log('📋 正在创建浏览器上下文...');
      const context = await this.manager.newContext({
        viewport: this.options.viewport,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      console.log('📄 正在创建页面...');
      this.page = await context.newPage();
      this.page.setDefaultTimeout(this.options.timeout);

      // 设置页面错误处理
      this.page.on('pageerror', (error) => {
        console.warn(`页面错误: ${error.message}`);
      });

      this.page.on('console', (msg) => {
        if (msg.type() === 'error') {
          console.warn(`控制台错误: ${msg.text()}`);
        }
      });

      // 初始化操作子
      console.log('⚙️ 正在初始化操作子...');
      this.searchOperation = new WeiboSearchOperation();
      this.saveOperation = new FileSaveOperation();
      this.cookieOperation = new CookieOperation();

      console.log('✅ 简化微博搜索工作量初始化完成');
      console.log('🔍 调试: 页面对象最终状态:', this.page ? '已初始化' : '未初始化');
    } catch (error) {
      console.error('❌ 初始化失败:', error.message);
      throw error;
    }
  }

  async loadCookies() {
    console.log('🍪 尝试加载微博Cookie...');

    try {
      const cookieContext = {
        page: this.page
      };

      const cookieResult = await this.cookieOperation.execute(cookieContext, {
        action: 'load',
        domain: 'weibo.com',
        cookiePath: '~/.webauto/cookies'
      });

      if (cookieResult.success && cookieResult.result.loaded) {
        console.log(`✅ Cookie加载成功: ${cookieResult.result.message}`);
        return true;
      } else {
        console.log(`⚠️ Cookie加载失败: ${cookieResult.result.message}`);
        console.log('💡 提示: 可能需要手动登录或检查Cookie文件');
        return false;
      }

    } catch (error) {
      console.warn('Cookie加载过程出错:', error.message);
      return false;
    }
  }

  async executeSearch(keyword, options = {}) {
    const searchOptions = {
      count: 50,  // 目标50条结果
      contentType: 'all',
      timeframe: 'all',
      sortBy: 'hot',
      maxPages: 10,  // 最多翻10页
      usePagination: true,
      ...options
    };

    console.log(`🔍 开始执行微博搜索: "${keyword}"`);
    console.log(`📊 搜索参数:`, searchOptions);

    try {
      // 构建搜索URL
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;
      console.log(`🌐 访问URL: ${searchUrl}`);

      // 导航到搜索页面
      console.log('🌐 正在导航到搜索页面...');
      console.log('🔍 调试: 页面对象状态:', this.page ? '已初始化' : '未初始化');
      if (!this.page) {
        throw new Error('页面对象未正确初始化');
      }
      await this.page.goto(searchUrl, { waitUntil: 'networkidle' });
      console.log('✅ 页面导航完成');

      // 尝试加载Cookie
      await this.loadCookies();

      // 等待页面加载
      await this.page.waitForTimeout(3000);

      // 检查是否需要登录
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('newlogin')) {
        console.log('🔐 检测到登录页面，请手动完成登录');
        console.log('⏳ 等待30秒手动登录时间...');

        // 等待用户登录
        await this.page.waitForTimeout(30000);

        // 检查登录状态
        const newUrl = this.page.url();
        if (newUrl.includes('login')) {
          throw new Error('登录超时，请检查Cookie或手动登录');
        }
      }

      // 执行搜索操作
      console.log('📥 开始提取搜索结果...');
      const searchContext = {
        browser: this.manager,
        page: this.page
      };

      const searchResult = await this.searchOperation.execute(searchContext, { ...searchOptions, keyword });

      if (!searchResult.success) {
        throw new Error(`搜索失败: ${searchResult.error}`);
      }

      console.log(`✅ 搜索完成，成功提取到 ${searchResult.results.length} 条结果`);

      // 保存搜索结果
      console.log('💾 开始保存搜索结果...');

      const saveParams = {
        content: searchResult.results,
        keyword: keyword,
        basePath: '~/.webauto/weibo',
        includeCSV: true,
        includeIndividualFiles: true,
        includeImages: true,
        createReadme: true,
        filePrefix: 'weibo-search',
        deduplication: true,
        skipExistingImages: true,
        incrementalMode: true
      };

      const saveContext = {};
      const saveResult = await this.saveOperation.execute(saveContext, saveParams);

      if (!saveResult.success) {
        throw new Error(`文件保存失败: ${saveResult.error}`);
      }

      console.log('✅ 文件保存完成');

      // 显示详细结果
      this.displayResults(searchResult, saveResult);

      return {
        searchResult,
        saveResult,
        totalExecutionTime: searchResult.metadata.executionTime + saveResult.metadata.executionTime
      };

    } catch (error) {
      console.error('❌ 搜索执行失败:', error.message);
      throw error;
    }
  }

  displayResults(searchResult, saveResult) {
    console.log('\n📋 微博搜索结果报告');
    console.log('=========================');

    // 搜索信息
    console.log(`🔍 搜索关键词: ${searchResult.metadata.keyword}`);
    console.log(`📊 成功提取: ${searchResult.results.length} 条结果`);
    console.log(`⏱️ 搜索耗时: ${searchResult.metadata.executionTime}ms`);
    console.log(`💾 保存耗时: ${saveResult.metadata.executionTime}ms`);
    console.log(`📁 保存路径: ${saveResult.result.basePath}`);
    console.log(`📄 总文件数: ${saveResult.result.totalFiles}`);

    // 增量更新信息
    if (saveResult.result.isNewContent !== undefined) {
      if (saveResult.result.isNewContent) {
        console.log(`✨ 新增内容: ${saveResult.result.newItemsCount} 条`);
        console.log(`📦 现有内容: ${saveResult.result.existingItemCount} 条`);
      } else {
        console.log(`🔄 无新内容，跳过保存`);
        console.log(`📦 现有内容: ${saveResult.result.existingItemCount} 条`);
      }
    }

    // 内容统计
    const stats = this.calculateStats(searchResult.results);
    console.log('\n📈 内容统计:');
    console.log(`👥 用户数量: ${stats.uniqueUsers} 个`);
    console.log(`🖼️ 含图片帖子: ${stats.withImages} 条`);
    console.log(`📝 纯文字帖子: ${stats.textOnly} 条`);
    console.log(`🔗 有链接帖子: ${stats.withLinks} 条`);

    // 互动数据统计
    console.log('\n🔄 互动数据统计:');
    console.log(`👍 点赞总数: ${stats.totalLikes}`);
    console.log(`💬 评论总数: ${stats.totalComments}`);
    console.log(`🔄 转发总数: ${stats.totalReposts}`);

    // 显示前10条结果
    console.log('\n📝 前10条搜索结果:');
    console.log('=========================');
    searchResult.results.slice(0, 10).forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.username || '未知用户'}`);
      console.log(`   📅 时间: ${result.time || '未知'}`);
      console.log(`   📝 内容: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}`);
      console.log(`   🖼️ 图片: ${result.images.length} 张`);
      console.log(`   🔗 链接: ${result.url || '无'}`);
      console.log(`   📊 互动: 👍${result.stats?.likes || '0'} 💬${result.stats?.comments || '0'} 🔄${result.stats?.reposts || '0'}`);
    });

    if (searchResult.results.length > 10) {
      console.log(`\n... 还有 ${searchResult.results.length - 10} 条结果`);
    }

    console.log('\n📁 文件保存结构:');
    console.log('=========================');
    console.log(`${saveResult.result.basePath}/`);
    console.log('├── metadata.json           # 搜索元数据');
    console.log('├── all-items.json          # 所有帖子汇总');
    console.log('├── all-items.csv           # CSV格式（Excel可用）');
    console.log('├── README.md               # 搜索结果说明');
    console.log('├── item_1/                 # 第1个帖子');
    console.log('│   ├── data.json           # 帖子数据');
    console.log('│   ├── images/             # 图片目录');
    console.log('│   ├── url.txt            # 原文链接');
    console.log('│   └── README.md           # 帖子说明');
    console.log('└── ...                     # 其他帖子目录');

    console.log('\n✅ 微博搜索完成！');
  }

  calculateStats(results) {
    const stats = {
      uniqueUsers: new Set(results.map(r => r.username)).size,
      withImages: results.filter(r => r.images.length > 0).length,
      textOnly: results.filter(r => r.images.length === 0).length,
      withLinks: results.filter(r => r.url).length,
      totalLikes: 0,
      totalComments: 0,
      totalReposts: 0
    };

    // 计算互动数据
    results.forEach(result => {
      if (result.stats) {
        const likes = this.parseNumber(result.stats.likes);
        const comments = this.parseNumber(result.stats.comments);
        const reposts = this.parseNumber(result.stats.reposts);

        stats.totalLikes += likes;
        stats.totalComments += comments;
        stats.totalReposts += reposts;
      }
    });

    return stats;
  }

  parseNumber(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;

    // 处理中文数字格式
    const cleanStr = str.toString().replace(/[^\d.]/g, '');
    const num = parseFloat(cleanStr) || 0;

    // 处理万、亿等单位
    if (str.includes('万')) return num * 10000;
    if (str.includes('亿')) return num * 100000000;

    return num;
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.manager) {
        await this.manager.close();
      }
      console.log('🧹 清理完成');
    } catch (error) {
      console.error('清理失败:', error.message);
    }
  }
}

// 命令行执行函数
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node weibo_search_simple.js <搜索关键词> [选项]');
    console.log('示例: node weibo_search_simple.js "查理柯克"');
    console.log('选项: --count=50 --no-headless');
    process.exit(1);
  }

  const keyword = args[0];
  const options = {};

  // 解析命令行选项
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1]);
    } else if (arg === '--no-headless') {
      options.headless = false;
    }
  });

  const workload = new SimpleWeiboSearchWorkload(options);

  try {
    console.log('🚀 开始微博搜索工作量...');
    await workload.initialize();
    const result = await workload.executeSearch(keyword, options);

    console.log('\n🎉 工作量执行成功完成！');
    console.log('\n📊 最终统计:');
    console.log('=============');
    console.log(`✅ 总执行时间: ${result.totalExecutionTime}ms`);
    console.log(`✅ 提取结果: ${result.searchResult.results.length} 条`);
    console.log(`✅ 保存文件: ${result.saveResult.result.totalFiles} 个`);
    console.log(`✅ 保存路径: ${result.saveResult.result.basePath}`);

    return result;
  } catch (error) {
    console.error('\n❌ 工作量执行失败:', error.message);
    process.exit(1);
  } finally {
    await workload.cleanup();
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { SimpleWeiboSearchWorkload };