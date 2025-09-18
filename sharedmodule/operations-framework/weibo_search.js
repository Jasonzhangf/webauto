#!/usr/bin/env node

/**
 * 微博搜索工作量脚本
 * 执行完整的微博搜索流程，包含内容提取和结构化文件保存
 * 支持大量结果搜索和分页处理
 */

import { CamoufoxManager } from '../../browser-assistant/dist-simple/browser/CamoufoxManager.js';
import { CookieManager } from '../../browser-assistant/dist-simple/browser/SimpleCookieManager.js';
import { WeiboSearchOperation } from './src/micro-operations/SearchOperations.js';
import { FileSaveOperation } from './src/micro-operations/FileSaveOperation.js';

class WeiboSearchWorkload {
  constructor(options = {}) {
    this.options = {
      headless: false,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      ...options
    };

    this.manager = null;
    this.cookieManager = null;
    this.searchOperation = null;
    this.saveOperation = null;
  }

  async initialize() {
    console.log('🚀 初始化微博搜索工作量...');

    // 初始化浏览器管理器
    this.manager = new CamoufoxManager({
      headless: this.options.headless,
      viewport: this.options.viewport,
      timeout: this.options.timeout
    });

    // 初始化Cookie管理器
    this.cookieManager = new CookieManager('weibo');

    // 初始化操作子
    this.searchOperation = new WeiboSearchOperation();
    this.saveOperation = new FileSaveOperation();

    console.log('✅ 微博搜索工作量初始化完成');
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
      // 启动浏览器
      await this.manager.initialize();

      // 构建搜索URL
      const searchUrl = `https://s.weibo.com/weibo?q=${encodeURIComponent(keyword)}`;

      // 执行搜索操作
      const searchContext = {
        browser: this.manager,
        page: await this.manager.navigate(searchUrl)
      };

      // 加载Cookie确保认证状态
      console.log('🍪 加载微博Cookie...');
      await this.cookieManager.loadCookies(this.manager.page);

      // 等待页面加载
      await this.manager.page.waitForTimeout(2000);

      // 执行搜索操作 - 只负责内容提取
      console.log('📥 开始提取搜索结果...');
      const searchResult = await this.searchOperation.execute(searchContext, searchOptions);

      if (!searchResult.success) {
        throw new Error(`搜索失败: ${searchResult.error}`);
      }

      console.log(`✅ 搜索完成，成功提取到 ${searchResult.results.length} 条结果`);

      // 第二步：将内容传递给文件操作子进行保存
      console.log('💾 开始保存搜索结果...');

      const saveParams = {
        content: searchResult.results,
        keyword: keyword,
        basePath: '~/.webauto',
        includeCSV: true,
        includeIndividualFiles: true,
        includeImages: true,
        createReadme: true,
        filePrefix: 'weibo-search'
      };

      const saveContext = {}; // FileSaveOperation不需要浏览器上下文

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

    // 显示前5条结果
    console.log('\n📝 前5条搜索结果:');
    console.log('=========================');
    searchResult.results.slice(0, 5).forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.username || '未知用户'}`);
      console.log(`   📅 时间: ${result.time || '未知'}`);
      console.log(`   📝 内容: ${result.content.substring(0, 100)}${result.content.length > 100 ? '...' : ''}`);
      console.log(`   🖼️ 图片: ${result.images.length} 张`);
      console.log(`   🔗 链接: ${result.url || '无'}`);
      console.log(`   📊 互动: 👍${result.stats?.likes || '0'} 💬${result.stats?.comments || '0'} 🔄${result.stats?.reposts || '0'}`);
    });

    if (searchResult.results.length > 5) {
      console.log(`\n... 还有 ${searchResult.results.length - 5} 条结果`);
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
      if (this.manager) {
        await this.manager.cleanup();
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
    console.log('使用方法: node weibo_search.js <搜索关键词> [选项]');
    console.log('示例: node weibo_search.js "查理柯克"');
    console.log('选项: --count=50 --headless');
    process.exit(1);
  }

  const keyword = args[0];
  const options = {};

  // 解析命令行选项
  args.slice(1).forEach(arg => {
    if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1]);
    } else if (arg === '--headless') {
      options.headless = true;
    }
  });

  const workload = new WeiboSearchWorkload(options);

  try {
    console.log('🚀 开始微博搜索工作量...');
    const result = await workload.executeSearch(keyword);

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

export { WeiboSearchWorkload };