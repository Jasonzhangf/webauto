#!/usr/bin/env node

/**
 * 最终版微博个人主页抓取脚本
 * 针对新版Vue架构进行完整优化
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function scrapeWeiboProfileFinal(profileUrl, options = {}) {
  try {
    console.log('=== 微博个人主页抓取 (最终版) ===');
    console.log('目标链接:', profileUrl);
    console.log('开始时间:', new Date().toLocaleString());
    console.log('');

    // 启动浏览器
    const browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    try {
      // 加载Cookie
      console.log('加载微博Cookie...');
      const cookiePath = '/Users/fanzhang/.webauto/cookies/weibo.com.json';
      const cookies = JSON.parse(await fs.readFile(cookiePath, 'utf8'));

      // 过滤掉已过期的Cookie
      const now = Date.now() / 1000;
      const validCookies = cookies.filter(cookie => {
        if (cookie.expires === -1) return true;
        return cookie.expires > now;
      });

      if (validCookies.length > 0) {
        await context.addCookies(validCookies);
        console.log(`已加载 ${validCookies.length} 个有效Cookie`);
      }

      // 导航到个人主页
      console.log('正在导航到个人主页...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面完全加载 - 新版架构需要更长时间
      console.log('等待页面完全加载...');
      await page.waitForTimeout(10000);

      // 检查页面状态
      const pageInfo = await page.evaluate(() => {
        const bodyText = document.body.textContent;

        // 提取用户名
        let username = '未知用户';
        const titleMatch = document.title.match(/@([^的]+)/);
        if (titleMatch) {
          username = titleMatch[1];
        }

        // 提取用户统计信息
        let userStats = {
          followers: '未知',
          following: '未知',
          posts: '未知'
        };

        // 从页面文本中提取统计信息
        const postsMatch = bodyText.match(/全部微博（([\d万.]+)）/);
        if (postsMatch) {
          userStats.posts = postsMatch[1];
        }

        const followersMatch = bodyText.match(/粉丝([\d万.]+)/);
        if (followersMatch) {
          userStats.followers = followersMatch[1];
        }

        const followingMatch = bodyText.match(/关注([\d万.]+)/);
        if (followingMatch) {
          userStats.following = followingMatch[1];
        }

        return {
          username,
          userStats,
          title: document.title,
          url: window.location.href
        };
      });

      console.log('用户信息:');
      console.log('- 用户名:', pageInfo.username);
      console.log('- 粉丝数:', pageInfo.userStats.followers);
      console.log('- 关注数:', pageInfo.userStats.following);
      console.log('- 微博数:', pageInfo.userStats.posts);

      // 开始抓取帖子
      const posts = [];
      let scrollCount = 0;
      const maxScrolls = options.maxPages || 15; // 增加滚动次数
      const targetPosts = 50; // 目标50条帖子

      console.log(`目标抓取 ${targetPosts} 条帖子...`);

      while (scrollCount < maxScrolls && posts.length < targetPosts) {
        console.log(`正在抓取第 ${scrollCount + 1} 页内容...`);

        // 等待Vue组件渲染
        await page.waitForTimeout(3000);

        // 提取当前页面的帖子 - 使用最全面的选择器
        const currentPosts = await page.evaluate(() => {
          const results = [];

          // 尝试所有可能的选择器
          const postSelectors = [
            // 新版Vue架构选择器
            'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH',
            '.Feed_body_3R0rO',
            '.Feed_wrap_3v9LH',
            '.vue-recycle-scroller__item-view article',
            // 旧版选择器
            '.WB_detail',
            '.card-wrap',
            '.WB_feed',
            '[node-type="feed_list_item"]',
            // 通用选择器
            '[class*="Feed"]',
            '[class*="feed"] article',
            '.wbpro-scroller-item article'
          ];

          let allElements = [];
          postSelectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => allElements.push(el));
            } catch (e) {
              // 忽略无效选择器
            }
          });

          // 去重
          allElements = [...new Set(allElements)];

          console.log(`找到 ${allElements.length} 个可能的帖子元素`);

          allElements.forEach((element, index) => {
            try {
              // 跳过明显的非帖子元素
              if (element.classList.contains('header') ||
                  element.classList.contains('footer') ||
                  element.classList.contains('nav') ||
                  element.classList.contains('sidebar')) {
                return;
              }

              // 提取内容 - 尝试多种方法
              let content = '';

              // 方法1: 从Feed_body提取
              const feedBody = element.querySelector('.Feed_body_3R0rO');
              if (feedBody) {
                content = feedBody.textContent.trim();
              }

              // 方法2: 从元素直接提取
              if (!content) {
                content = element.textContent.trim();
              }

              // 过滤掉非帖子内容
              const skipKeywords = [
                '登录', '注册', '首页', '发现', '消息', '设置', '退出',
                '微博', '随时随地发现新鲜事', '包容万物恒河水',
                '粉丝', '关注', '全部微博', 'V指数', '昨日发博',
                '阅读数', '互动数', '海外新鲜事博主', '顾问',
                '已实名', 'IP属地', '精选', '微博', '视频', '相册', '文章'
              ];

              if (content.length < 10 || content.length > 2000 ||
                  skipKeywords.some(keyword => content.includes(keyword))) {
                return;
              }

              // 提取时间信息
              let time = '';
              const timeElements = element.querySelectorAll('time, .time, .date, header span, [class*="time"]');
              timeElements.forEach(timeEl => {
                const timeText = timeEl.textContent.trim();
                if (timeText && timeText.length < 20) {
                  time = timeText;
                }
              });

              // 如果没有找到时间，尝试从内容中提取
              if (!time) {
                const timeMatch = content.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|今天|昨天|刚刚|\d+分钟前|\d+小时前)/);
                if (timeMatch) {
                  time = timeMatch[1];
                }
              }

              // 提取统计数据
              const stats = {
                likes: 0,
                comments: 0,
                reposts: 0
              };

              // 查找footer或操作区域
              const footer = element.querySelector('footer, .footer, [class*="toolbar"], [class*="action"]');
              if (footer) {
                const footerText = footer.textContent;
                const numbers = footerText.match(/(\d+(?:\.\d+)?[万千亿]?|\d+)/g);
                if (numbers && numbers.length >= 1) {
                  stats.likes = parseNumber(numbers[0]);
                  if (numbers.length >= 2) stats.comments = parseNumber(numbers[1]);
                  if (numbers.length >= 3) stats.reposts = parseNumber(numbers[2]);
                }
              }

              // 提取图片
              const images = [];
              const imageElements = element.querySelectorAll('img');
              imageElements.forEach(img => {
                const src = img.getAttribute('src') || img.getAttribute('data-src');
                if (src && !src.includes('avatar') && !src.includes('thumb') && !src.includes('emoji')) {
                  if (!src.includes('icon') && !src.includes('logo') && !src.includes('vip')) {
                    const fullSrc = src.startsWith('//') ? 'https:' + src : src;
                    images.push(fullSrc);
                  }
                }
              });

              // 生成帖子ID
              const id = `post_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`;

              results.push({
                id,
                username: document.title.match(/@([^的]+)/)?.[1] || '未知用户',
                content,
                time,
                stats,
                images,
                url: window.location.href
              });
            } catch (e) {
              // 忽略单个帖子的解析错误
            }
          });

          // 辅助函数：解析数字
          function parseNumber(numStr) {
            if (typeof numStr !== 'string') return 0;
            if (numStr.includes('万')) {
              return Math.round(parseFloat(numStr) * 10000);
            } else if (numStr.includes('亿')) {
              return Math.round(parseFloat(numStr) * 100000000);
            } else {
              return parseInt(numStr.replace(/[^0-9]/g, '')) || 0;
            }
          }

          return results;
        });

        // 添加新帖子（基于内容去重）
        const newPosts = currentPosts.filter(post =>
          !posts.some(existing =>
            existing.content === post.content &&
            existing.time === post.time
          )
        );

        posts.push(...newPosts);

        console.log(`当前帖子总数: ${posts.length} (新增: ${newPosts.length})`);

        // 如果已经达到目标数量，停止抓取
        if (posts.length >= targetPosts) {
          console.log(`已达到目标数量 ${targetPosts}，停止抓取`);
          break;
        }

        // 滚动到底部加载更多
        scrollCount++;

        if (scrollCount < maxScrolls && posts.length < targetPosts) {
          // 平滑滚动到底部
          await page.evaluate(() => {
            window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth'
            });
          });

          // 等待滚动和内容加载
          await page.waitForTimeout(5000);

          // 额外等待时间，确保Vue组件渲染完成
          await page.waitForTimeout(3000);
        }
      }

      console.log(`总共抓取 ${posts.length} 条帖子`);

      // 保存数据
      const saveDir = path.join(process.env.HOME || '~', '.webauto', 'weibo', 'user-profiles', pageInfo.username);
      await fs.mkdir(saveDir, { recursive: true });

      // 保存JSON数据
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonFileName = `profile_posts_${timestamp}.json`;
      const jsonPath = path.join(saveDir, jsonFileName);

      const saveData = {
        username: pageInfo.username,
        profileUrl,
        extractionTime: new Date().toISOString(),
        pageInfo: {
          userStats: pageInfo.userStats,
          targetPosts: targetPosts,
          actualPosts: posts.length,
          scrollCount: scrollCount,
          architecture: 'new-vue'
        },
        postsCount: posts.length,
        posts
      };

      await fs.writeFile(jsonPath, JSON.stringify(saveData, null, 2), 'utf8');

      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 抓取成功');
      console.log('用户名:', pageInfo.username);
      console.log('粉丝数:', pageInfo.userStats.followers);
      console.log('关注数:', pageInfo.userStats.following);
      console.log('微博总数:', pageInfo.userStats.posts);
      console.log('实际抓取:', posts.length, '条');
      console.log('滚动次数:', scrollCount);
      console.log('保存路径:', saveDir);
      console.log('JSON文件:', jsonFileName);

      // 显示前10条帖子
      if (posts.length > 0) {
        console.log('');
        console.log('=== 最新博文 ===');
        const displayCount = Math.min(10, posts.length);
        posts.slice(0, displayCount).forEach((post, index) => {
          console.log(`${index + 1}. ${post.content?.substring(0, 200)}...`);
          console.log(`   时间: ${post.time || '未知'}`);
          console.log(`   点赞: ${post.stats?.likes || 0} | 评论: ${post.stats?.comments || 0} | 转发: ${post.stats?.reposts || 0}`);
          if (post.images && post.images.length > 0) {
            console.log(`   图片: ${post.images.length} 张`);
          }
          console.log('---');
        });
      } else {
        console.log('\n⚠️  未能提取到帖子内容，可能原因：');
        console.log('   1. Cookie登录状态不完整');
        console.log('   2. 页面使用了动态加载机制');
        console.log('   3. 内容需要特定的交互才能显示');
        console.log('   4. 账号权限限制');
      }

      // 统计信息
      const totalLikes = posts.reduce((sum, post) => sum + (post.stats?.likes || 0), 0);
      const totalComments = posts.reduce((sum, post) => sum + (post.stats?.comments || 0), 0);
      const postsWithImages = posts.filter(post => post.images && post.images.length > 0).length;

      console.log('');
      console.log('=== 统计信息 ===');
      console.log(`总点赞数: ${totalLikes.toLocaleString()}`);
      console.log(`总评论数: ${totalComments.toLocaleString()}`);
      console.log(`带图片的帖子: ${postsWithImages}`);
      if (posts.length > 0) {
        console.log(`平均点赞: ${Math.round(totalLikes / posts.length).toLocaleString()}`);
      }

      return {
        success: true,
        username: pageInfo.username,
        userStats: pageInfo.userStats,
        postsCount: posts.length,
        targetPosts: targetPosts,
        data: posts,
        savePath: saveDir,
        jsonFile: jsonFileName,
        stats: {
          totalLikes,
          totalComments,
          postsWithImages,
          avgLikes: posts.length > 0 ? Math.round(totalLikes / posts.length) : 0
        }
      };

    } finally {
      await browser.close();
    }

  } catch (error) {
    console.error('抓取失败:', error.message);
    throw error;
  }
}

// 命令行参数处理
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法: node final_weibo_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('选项:');
    console.log('  --max-pages     最大滚动次数 (默认: 15)');
    console.log('');
    console.log('示例:');
    console.log('  node final_weibo_scraper.js https://weibo.com/1671109627');
    console.log('  node final_weibo_scraper.js https://weibo.com/央视新闻 --max-pages 20');
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
      default:
        console.warn('未知选项:', args[i]);
    }
  }

  scrapeWeiboProfileFinal(profileUrl, options)
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

export { scrapeWeiboProfileFinal };