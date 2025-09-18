#!/usr/bin/env node

/**
 * 微博个人主页抓取工作流执行器
 * 使用工作流系统进行独立的内容抓取
 */

import { ConfigurableWorkflowExecutor } from './src/ConfigurableWorkflowExecutor.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileWithWorkflow(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (工作流版) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    // 设置工作流配置
    const workflowConfig = {
      profileUrl: profileUrl,
      maxPages: options.maxPages || 3, // 默认抓取3页，约50-60条帖子
      postsPerPage: options.postsPerPage || 20,
      includeMedia: options.includeMedia !== false,
      includeInteractions: options.includeInteractions !== false,
      enableImageFiltering: options.enableImageFiltering !== false,
      // 确保Cookie加载配置正确
      cookiePath: '/Users/fanzhang/.webauto/cookies',
      cookieDomain: 'weibo.com',
      loadCookies: true,
      autoInjectCookies: true
    };

    console.log('工作流配置:', workflowConfig);

    // 创建工作流执行器
    const executor = new ConfigurableWorkflowExecutor({
      logLevel: 'info',
      enableScreenshot: false,
      enableReport: true
    });

    // 加载工作流文件
    const workflowPath = path.join(__dirname, 'workflows', 'weibo-user-profile-workflow.json');

    console.log('加载工作流文件:', workflowPath);

    // 执行工作流
    const result = await executor.executeWorkflow(workflowPath, workflowConfig);

    if (result.success) {
      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 工作流执行成功');
      console.log('用户名:', result.data.userInfo?.username || '未知');
      console.log('帖子总数:', result.data.postsCount || 0);
      console.log('保存路径:', result.data.savePath);
      console.log('新增内容:', result.data.newItemsCount || 0);
      console.log('现有内容:', result.data.existingItemsCount || 0);

      if (result.data.userInfo) {
        console.log('');
        console.log('=== 用户信息 ===');
        console.log('用户名:', result.data.userInfo.username);
        console.log('粉丝数:', result.data.userInfo.followers);
        console.log('关注数:', result.data.userInfo.following);
        console.log('微博数:', result.data.userInfo.posts);
        console.log('认证状态:', result.data.userInfo.verified ? '已认证' : '未认证');
      }

      if (result.data.statistics) {
        console.log('');
        console.log('=== 统计信息 ===');
        console.log('总帖子数:', result.data.statistics.totalPosts);
        console.log('带图片帖子:', result.data.statistics.postsWithImages);
        console.log('带视频帖子:', result.data.statistics.postsWithVideos);
        console.log('总图片数:', result.data.statistics.totalImages);
        console.log('总视频数:', result.data.statistics.totalVideos);
      }

      console.log('');
      console.log('=== 文件信息 ===');
      console.log('基础目录:', result.data.files.basePath);
      console.log('元数据文件:', result.data.files.metadata);
      console.log('汇总文件:', result.data.files.summary);
      console.log('CSV文件:', result.data.files.csv);
      console.log('说明文档:', result.data.files.readme);

      return {
        success: true,
        username: result.data.userInfo?.username,
        postsCount: result.data.postsCount,
        savePath: result.data.savePath,
        files: result.data.files,
        statistics: result.data.statistics,
        executionTime: result.data.executionTime
      };
    } else {
      console.error('❌ 工作流执行失败');
      console.error('错误信息:', result.message);
      console.error('错误详情:', result.error);

      return {
        success: false,
        error: result.message,
        details: result.error
      };
    }

  } catch (error) {
    console.error('❌ 工作流执行器异常:', error.message);
    console.error('错误堆栈:', error.stack);

    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node workflow_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大抓取页面数 (默认: 3)');
    console.log('  --posts-per-page 每页帖子数 (默认: 20)');
    console.log('  --no-media      不包含媒体内容');
    console.log('  --no-interactions 不包含互动数据');
    console.log('  --no-image-filtering 不启用图片过滤');
    console.log('');
    console.log('示例:');
    console.log('  node workflow_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node workflow_profile_scraper.js https://weibo.com/央视新闻 --max-pages 5');
    console.log('  node workflow_profile_scraper.js https://weibo.com/1671109627 --max-pages 3 --no-interactions');
    process.exit(1);
  }

  const profileUrl = args[0];
  const options = {};

  // 解析选项
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--max-pages':
        options.maxPages = parseInt(args[++i]);
        break;
      case '--posts-per-page':
        options.postsPerPage = parseInt(args[++i]);
        break;
      case '--no-media':
        options.includeMedia = false;
        break;
      case '--no-interactions':
        options.includeInteractions = false;
        break;
      case '--no-image-filtering':
        options.enableImageFiltering = false;
        break;
      default:
        console.warn('未知选项:', args[i]);
    }
  }

  scrapeWeiboProfileWithWorkflow(profileUrl, options)
    .then(result => {
      console.log('');
      if (result.success) {
        console.log('工作流执行完成!');
        process.exit(0);
      } else {
        console.log('工作流执行失败!');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scrapeWeiboProfileWithWorkflow };