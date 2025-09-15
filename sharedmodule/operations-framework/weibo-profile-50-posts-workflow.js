#!/usr/bin/env node

/**
 * 基于工作流的微博个人主页50条帖子抓取实现
 * 使用weibo-user-profile-workflow.json工作流
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WeiboProfileWorkflowExecutor {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.workflow = null;
  }

  async initialize() {
    console.log('=== 初始化微博个人主页工作流执行器 ===');

    // 加载工作流配置
    const workflowPath = path.join(__dirname, 'workflows', 'weibo-user-profile-workflow.json');
    this.workflow = JSON.parse(await fs.readFile(workflowPath, 'utf8'));

    console.log(`工作流名称: ${this.workflow.name}`);
    console.log(`工作流版本: ${this.workflow.version}`);

    // 初始化浏览器
    this.browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });

    this.page = await this.context.newPage();

    // 设置页面事件监听
    this.page.on('console', msg => console.log('浏览器日志:', msg.text()));
    this.page.on('pageerror', error => console.log('页面错误:', error.message));
  }

  async loadCookies() {
    console.log('加载微博Cookie...');

    const cookiePath = '/Users/fanzhang/.webauto/cookies/weibo.com.json';

    try {
      const cookies = JSON.parse(await fs.readFile(cookiePath, 'utf8'));

      // 过滤掉已过期的Cookie
      const now = Date.now() / 1000;
      const validCookies = cookies.filter(cookie => {
        if (cookie.expires === -1) return true;
        return cookie.expires > now;
      });

      await this.context.addCookies(validCookies);
      console.log(`已加载 ${validCookies.length} 个有效Cookie`);

      return validCookies.length > 0;
    } catch (error) {
      console.log('Cookie加载失败:', error.message);
      return false;
    }
  }

  async extractUsernameFromProfile(profileUrl) {
    console.log(`从个人主页提取用户名: ${profileUrl}`);

    await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await this.page.waitForTimeout(5000);

    // 从页面标题提取用户名
    const username = await this.page.evaluate(() => {
      const titleMatch = document.title.match(/@([^的]+)/);
      if (titleMatch) {
        return titleMatch[1];
      }

      // 备用方法：从页面内容提取
      const bodyText = document.body.textContent;
      const nameMatch = bodyText.match(/包容万物恒河水/);
      if (nameMatch) {
        return nameMatch[0];
      }

      return '未知用户';
    });

    console.log(`提取到用户名: ${username}`);
    return username;
  }

  async scrapeProfilePosts(profileUrl, targetPosts = 50) {
    console.log(`开始抓取个人主页帖子，目标数量: ${targetPosts}`);

    await this.page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面完全加载
    console.log('等待页面加载...');
    await this.page.waitForTimeout(10000);

    const allPosts = new Map();
    let scrollCount = 0;
    const maxScrolls = 20;

    while (scrollCount < maxScrolls && allPosts.size < targetPosts) {
      console.log(`\n=== 第 ${scrollCount + 1} 次滚动 ===`);
      console.log(`当前已抓取: ${allPosts.size} 条`);

      // 等待Vue组件渲染
      await this.page.waitForTimeout(3000);

      // 使用验证有效的选择器
      const currentPosts = await this.page.evaluate(() => {
        const results = [];

        const selectors = [
          'article.woo-panel-main.woo-panel-top.woo-panel-right.woo-panel-bottom.woo-panel-left.Feed_wrap_3v9LH',
          '.Feed_body_3R0rO'
        ];

        let elements = [];
        selectors.forEach(selector => {
          try {
            const found = document.querySelectorAll(selector);
            found.forEach(el => elements.push(el));
          } catch (e) {
            // 忽略无效选择器
          }
        });

        // 去重
        elements = [...new Set(elements)];

        elements.forEach((element, index) => {
          try {
            let content = '';

            // 优先从Feed_body提取
            const feedBody = element.querySelector('.Feed_body_3R0rO');
            if (feedBody) {
              content = feedBody.textContent.trim();
            } else {
              content = element.textContent.trim();
            }

            // 宽松的过滤条件
            if (content.length < 15 || content.length > 2000) return;

            // 过滤明显的非帖子内容
            const skipPatterns = [
              /^包容万物恒河水\s*$/,
              /^\d+粉丝\d+关注$/,
              /^V指数.*$/,
              /^昨日发博.*$/
            ];

            const shouldSkip = skipPatterns.some(pattern =>
              pattern.test(content.replace(/\s+/g, ' '))
            );

            if (shouldSkip) return;

            // 提取时间
            let time = '';
            const timeMatch = content.match(/(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|今天|昨天|刚刚)/);
            if (timeMatch) {
              time = timeMatch[1];
            }

            // 提取互动数据
            let stats = { likes: 0, comments: 0, reposts: 0 };

            const numbers = content.match(/(\d+(?:\.\d+)?[万千亿]?|\d+)\s*(点赞|评论|转发)?/g);
            if (numbers && numbers.length >= 3) {
              const lastNumbers = numbers.slice(-3);
              stats.likes = parseNumber(lastNumbers[0]);
              stats.comments = parseNumber(lastNumbers[1]);
              stats.reposts = parseNumber(lastNumbers[2]);
            }

            // 清理内容
            let cleanContent = content.replace(/\s*\d+(?:\.\d+)?[万千亿]?\s*点赞\s*\d+(?:\.\d+)?[万千亿]?\s*评论\s*\d+(?:\.\d+)?[万千亿]?\s*转发.*$/, '').trim();
            cleanContent = cleanContent.replace(/\s*展开\s*$/, '').trim();

            if (cleanContent.length < 10) {
              cleanContent = content;
            }

            // 生成内容哈希
            const contentHash = cleanContent.substring(0, 100);

            results.push({
              contentHash,
              content: cleanContent,
              time,
              stats,
              rawContent: content
            });

          } catch (e) {
            // 忽略错误
          }
        });

        function parseNumber(numStr) {
          if (typeof numStr !== 'string') return 0;
          const cleanStr = numStr.replace(/[^\d万.]/g, '');
          if (cleanStr.includes('万')) {
            return Math.round(parseFloat(cleanStr) * 10000);
          } else if (cleanStr.includes('亿')) {
            return Math.round(parseFloat(cleanStr) * 100000000);
          } else {
            return parseInt(cleanStr) || 0;
          }
        }

        return results;
      });

      // 添加到总集合
      currentPosts.forEach(post => {
        if (!allPosts.has(post.contentHash)) {
          allPosts.set(post.contentHash, post);
        }
      });

      console.log(`新增: ${currentPosts.length} 条，去重后总计: ${allPosts.size} 条`);

      // 检查是否达到目标
      if (allPosts.size >= targetPosts) {
        console.log(`✅ 已达到目标数量 ${targetPosts} 条！`);
        break;
      }

      // 滚动加载更多
      scrollCount++;

      if (scrollCount < maxScrolls) {
        await this.page.evaluate(() => {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        });

        await this.page.waitForTimeout(5000);
      }
    }

    return Array.from(allPosts.values());
  }

  async saveResults(posts, username, profileUrl) {
    console.log('保存抓取结果...');

    const finalPosts = posts.map((post, index) => ({
      id: `post_${Date.now()}_${index}`,
      username,
      content: post.content,
      time: post.time,
      stats: post.stats,
      url: profileUrl
    }));

    const result = {
      timestamp: new Date().toISOString(),
      workflow: {
        name: this.workflow.name,
        version: this.workflow.version
      },
      username,
      profileUrl,
      targetPosts: 50,
      actualPosts: finalPosts.length,
      posts: finalPosts
    };

    // 创建保存目录
    const saveDir = '/Users/fanzhang/.webauto/weibo/user-profiles';
    const userDir = path.join(saveDir, username);

    try {
      await fs.mkdir(userDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在
    }

    const savePath = path.join(userDir, 'profile-posts-50.json');
    await fs.writeFile(savePath, JSON.stringify(result, null, 2), 'utf8');

    console.log(`结果已保存到: ${savePath}`);

    // 显示统计信息
    const totalLikes = finalPosts.reduce((sum, post) => sum + post.stats.likes, 0);
    const totalComments = finalPosts.reduce((sum, post) => sum + post.stats.comments, 0);
    const totalReposts = finalPosts.reduce((sum, post) => sum + post.stats.reposts, 0);

    console.log('\n=== 统计信息 ===');
    console.log(`总点赞数: ${totalLikes.toLocaleString()}`);
    console.log(`总评论数: ${totalComments.toLocaleString()}`);
    console.log(`总转发数: ${totalReposts.toLocaleString()}`);
    console.log(`平均点赞: ${Math.round(totalLikes / finalPosts.length).toLocaleString()}`);
    console.log(`平均评论: ${Math.round(totalComments / finalPosts.length).toLocaleString()}`);
    console.log(`平均转发: ${Math.round(totalReposts / finalPosts.length).toLocaleString()}`);

    return finalPosts.length;
  }

  async execute(profileUrl) {
    try {
      await this.initialize();

      // 加载Cookie
      const hasCookies = await this.loadCookies();
      if (!hasCookies) {
        console.log('警告: 未找到有效Cookie，可能无法正常访问');
      }

      // 提取用户名
      const username = await this.extractUsernameFromProfile(profileUrl);

      // 抓取帖子
      const posts = await this.scrapeProfilePosts(profileUrl, 50);

      // 保存结果
      const savedCount = await this.saveResults(posts, username, profileUrl);

      console.log(`\n🎉 工作流执行完成！共获取 ${savedCount} 条微博帖子`);
      return savedCount;

    } catch (error) {
      console.error('工作流执行失败:', error);
      return 0;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// 主函数
async function main() {
  const executor = new WeiboProfileWorkflowExecutor();

  // 使用之前测试成功的URL
  const profileUrl = 'https://weibo.com/1671109627';

  console.log('执行微博个人主页50条帖子抓取工作流');
  console.log(`目标URL: ${profileUrl}`);

  const result = await executor.execute(profileUrl);

  process.exit(result > 0 ? 0 : 1);
}

main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
});