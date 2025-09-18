#!/usr/bin/env node

/**
 * 直接执行微博个人主页工作流脚本
 * 跳过ConfigurableWorkflowExecutor，直接使用操作执行
 */

import { WeiboSearchOperation } from './src/micro-operations/SearchOperations.js';
import { FileSaveOperation } from './src/micro-operations/FileSaveOperation.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileDirect(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (直接执行) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    // 第一步：使用WeiboSearchOperation抓取内容
    const searchOperation = new WeiboSearchOperation();

    const searchConfig = {
      keyword: profileUrl.split('/').pop() || 'profile', // 从URL提取ID
      source: 'profile',
      maxItems: (options.maxPages || 3) * (options.postsPerPage || 20),
      targetUrl: profileUrl,
      contentSelector: '.Feed_body_3R0rO, .WB_detail, .card-wrap, .WB_feed',
      includeFields: ['id', 'username', 'content', 'time', 'stats', 'images', 'links', 'source'],
      imageFiltering: {
        enabled: options.enableImageFiltering !== false,
        filterRules: {
          avatars: ['avatar', 'head', 'profile'],
          logos: ['logo', 'icon', 'vip', 'svvip'],
          system: ['s.weibo.com/upload', 's.weibo.com/default', 'weibo.com/img'],
          thumbnails: ['thumb', 'orj', 'crop', 'square', 'small', 'mini'],
          emojis: ['expression', 'emoji', 'sinajs.cn/t4/appstyle', 'face.t.sinajs.cn'],
          sizes: ['20x20', '24x24', '32x32', '64x64']
        }
      }
    };

    console.log('正在抓取个人主页内容...');
    console.log('使用关键词:', searchConfig.keyword);

    // 创建一个模拟的context对象
    const mockContext = {
      browser: null,
      page: null
    };

    const searchResult = await searchOperation.execute(mockContext, searchConfig);

    if (!searchResult.success || !searchResult.data || searchResult.data.length === 0) {
      throw new Error('抓取失败或没有获取到数据');
    }

    console.log(`成功抓取 ${searchResult.data.length} 条帖子`);

    // 尝试从第一篇帖子中提取用户名
    let username = 'unknown_user';
    if (searchResult.data[0].username) {
      username = searchResult.data[0].username;
    } else {
      // 从URL中提取用户名
      const urlMatch = profileUrl.match(/weibo\.com\/([^\/\?]+)/);
      if (urlMatch) {
        username = urlMatch[1];
      }
    }

    console.log('用户名:', username);

    // 第二步：保存数据
    const saveOperation = new FileSaveOperation();

    const saveConfig = {
      content: searchResult.data,
      keyword: username,
      basePath: path.join(process.env.HOME || '~', '.webauto', 'weibo', 'user-profiles'),
      includeCSV: true,
      includeIndividualFiles: true,
      includeImages: true,
      createReadme: true,
      filePrefix: 'user-profile',
      deduplication: true,
      skipExistingImages: true,
      incrementalMode: true
    };

    console.log('正在保存数据...');
    const saveResult = await saveOperation.execute(saveConfig);

    console.log('');
    console.log('=== 抓取结果 ===');
    console.log('✅ 抓取成功');
    console.log('用户名:', username);
    console.log('帖子总数:', searchResult.data.length);
    console.log('保存路径:', saveResult.basePath);
    console.log('总文件数:', saveResult.totalFiles);
    console.log('新增项目:', saveResult.newItemsCount);

    // 显示前10条帖子
    if (searchResult.data.length > 0) {
      console.log('');
      console.log('=== 最新博文 ===');
      const displayCount = Math.min(10, searchResult.data.length);
      searchResult.data.slice(0, displayCount).forEach((post, index) => {
        console.log(`${index + 1}. ${post.content?.substring(0, 200)}...`);
        console.log(`   时间: ${post.time || '未知'}`);
        console.log(`   点赞: ${post.stats?.likes || 0} | 评论: ${post.stats?.comments || 0} | 转发: ${post.stats?.reposts || 0}`);
        if (post.images && post.images.length > 0) {
          console.log(`   图片: ${post.images.length} 张`);
        }
        console.log('---');
      });
    }

    // 统计信息
    const totalLikes = searchResult.data.reduce((sum, post) => sum + (post.stats?.likes || 0), 0);
    const totalComments = searchResult.data.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);
    const postsWithImages = searchResult.data.filter(post => post.images && post.images.length > 0).length;

    console.log('');
    console.log('=== 统计信息 ===');
    console.log(`总点赞数: ${totalLikes}`);
    console.log(`总评论数: ${totalComments}`);
    console.log(`带图片的帖子: ${postsWithImages}`);
    console.log(`平均点赞: ${Math.round(totalLikes / searchResult.data.length)}`);

    return {
      success: true,
      username: username,
      postsCount: searchResult.data.length,
      data: searchResult.data,
      saveResult: saveResult,
      stats: {
        totalLikes,
        totalComments,
        postsWithImages,
        avgLikes: Math.round(totalLikes / searchResult.data.length)
      }
    };

  } catch (error) {
    console.error('抓取失败:', error.message);
    throw error;
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node direct_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('示例:');
    console.log('  node direct_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node direct_profile_scraper.js https://weibo.com/央视新闻');
    process.exit(1);
  }

  const profileUrl = args[0];

  scrapeWeiboProfileDirect(profileUrl)
    .then(result => {
      console.log('');
      console.log('抓取完成!');
      process.exit(0);
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

export { scrapeWeiboProfileDirect };