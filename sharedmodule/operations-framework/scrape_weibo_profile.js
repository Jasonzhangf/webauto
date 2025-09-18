#!/usr/bin/env node

/**
 * 微博个人主页抓取脚本
 * 使用工作流执行器来抓取指定用户的主页内容
 */

import { ConfigurableWorkflowExecutor } from './src/ConfigurableWorkflowExecutor.js';
import path from 'path';
import { fileURLToPath } from 'url';

// ES模块环境下获取当前文件路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfile(profileUrl, options = {}) {
  try {
    const executor = new ConfigurableWorkflowExecutor();

    const workflowConfig = {
      profileUrl: profileUrl,
      maxPages: options.maxPages || 3,
      postsPerPage: options.postsPerPage || 20,
      includeMedia: options.includeMedia !== false,
      includeInteractions: options.includeInteractions !== false,
      enableImageFiltering: options.enableImageFiltering !== false,
      saveDir: options.saveDir || '~/.webauto/weibo/user-profiles'
    };

    console.log('=== 微博个人主页抓取 ===');
    console.log('目标链接:', profileUrl);
    console.log('抓取页面数:', workflowConfig.maxPages);
    console.log('每页帖子数:', workflowConfig.postsPerPage);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    const result = await executor.executeWorkflow(
      path.join(__dirname, 'workflows', 'weibo-user-profile-workflow.json'),
      workflowConfig
    );

    console.log('');
    console.log('=== 执行结果 ===');
    console.log('状态:', result.success ? '✅ 成功' : '❌ 失败');

    if (result.success) {
      const { data } = result;

      console.log('');
      console.log('=== 用户信息 ===');
      console.log('用户名:', data.userInfo?.username || '未知');
      console.log('粉丝数:', data.userInfo?.stats?.followers || 0);
      console.log('关注数:', data.userInfo?.stats?.following || 0);
      console.log('总帖子数:', data.userInfo?.stats?.posts || 0);

      console.log('');
      console.log('=== 抓取统计 ===');
      console.log('帖子总数:', data.timelinePosts?.length || 0);
      console.log('带图片帖子:', data.timelinePosts?.filter(post => post.images && post.images.length > 0).length || 0);
      console.log('保存路径:', data.saveResult?.basePath);

      if (data.timelinePosts && data.timelinePosts.length > 0) {
        console.log('');
        console.log('=== 最新博文 ===');
        const displayCount = Math.min(10, data.timelinePosts.length);
        data.timelinePosts.slice(0, displayCount).forEach((post, index) => {
          console.log(`${index + 1}. ${post.content?.substring(0, 200)}...`);
          console.log(`   时间: ${post.time}`);
          console.log(`   点赞: ${post.stats?.likes || 0} | 评论: ${post.stats?.comments || 0} | 转发: ${post.stats?.reposts || 0}`);
          if (post.images && post.images.length > 0) {
            console.log(`   图片: ${post.images.length} 张`);
          }
          console.log('---');
        });
      }

      console.log('');
      console.log('=== 保存信息 ===');
      console.log('基础路径:', data.saveResult?.basePath);
      console.log('总文件数:', data.saveResult?.totalFiles || 0);
      console.log('新增项目:', data.saveResult?.newItemsCount || 0);

      if (data.downloadResults) {
        console.log('图片下载成功:', data.downloadResults.successCount || 0);
        console.log('图片下载失败:', data.downloadResults.failedCount || 0);
      }

    } else {
      console.log('错误信息:', result.error);
    }

    return result;

  } catch (error) {
    console.error('执行失败:', error.message);
    throw error;
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node scrape_weibo_profile.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大抓取页面数 (默认: 3)');
    console.log('  --posts-per-page 每页帖子数 (默认: 20)');
    console.log('  --no-media       不包含媒体内容');
    console.log('  --no-interactions 不包含互动数据');
    console.log('  --save-dir       保存目录');
    console.log('  --no-image-filter 不启用图片过滤');
    console.log('');
    console.log('示例:');
    console.log('  node scrape_weibo_profile.js https://weibo.com/1671109627');
    console.log('  node scrape_weibo_profile.js https://weibo.com/央视新闻 --max-pages 5');
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
      case '--save-dir':
        options.saveDir = args[++i];
        break;
      case '--no-image-filter':
        options.enableImageFiltering = false;
        break;
      default:
        console.warn('未知选项:', args[i]);
    }
  }

  scrapeWeiboProfile(profileUrl, options)
    .then(result => {
      console.log('');
      console.log('抓取完成!');
      process.exit(result.success ? 0 : 1);
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

export { scrapeWeiboProfile };