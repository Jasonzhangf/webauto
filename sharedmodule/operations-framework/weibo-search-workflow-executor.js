#!/usr/bin/env node

/**
 * 基于工作流的微博搜索执行器
 * 使用weibo-search-workflow.json工作流
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WeiboSearchWorkflowExecutor {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.workflow = null;
  }

  async initialize() {
    console.log('=== 初始化微博搜索工作流执行器 ===');

    // 加载工作流配置
    const workflowPath = path.join(__dirname, 'workflows', 'weibo-search-workflow.json');
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

  async buildSearchUrl(keyword, sortBy = 'hot') {
    console.log(`构建搜索URL: ${keyword}`);

    const params = new URLSearchParams({
      q: keyword,
      xsort: sortBy,
      Refer: 'hotmore',
      page: 1
    });

    return `https://s.weibo.com/weibo?${params.toString()}`;
  }

  async performSearch(keyword, count = 50) {
    console.log(`开始搜索关键词: ${keyword}，目标数量: ${count}`);

    const searchUrl = await this.buildSearchUrl(keyword);

    await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面加载
    console.log('等待搜索结果加载...');
    await this.page.waitForTimeout(5000);

    // 等待搜索结果出现
    try {
      await this.page.waitForSelector('.Feed_body_3R0rO', { timeout: 15000 });
    } catch (error) {
      console.log('搜索结果选择器超时，尝试继续处理...');
    }

    const searchResults = [];

    // 尝试滚动加载更多结果
    for (let i = 0; i < 5; i++) {
      console.log(`第 ${i + 1} 次加载搜索结果...`);

      const currentResults = await this.page.evaluate(() => {
        const results = [];
        const elements = document.querySelectorAll('.Feed_body_3R0rO');

        elements.forEach((element, index) => {
          try {
            const content = element.textContent.trim();

            if (content.length > 20 && content.length < 2000) {
              // 提取用户名
              let username = '';
              const usernameMatch = content.match(/^([^\s\n]+)/);
              if (usernameMatch) {
                username = usernameMatch[1];
              }

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
              let cleanContent = content.replace(/^\s*[^\s\n]+\s*/, '').trim(); // 移除开头的用户名
              cleanContent = cleanContent.replace(/\s*\d+(?:\.\d+)?[万千亿]?\s*点赞\s*\d+(?:\.\d+)?[万千亿]?\s*评论\s*\d+(?:\.\d+)?[万千亿]?\s*转发.*$/, '').trim();
              cleanContent = cleanContent.replace(/\s*展开\s*$/, '').trim();

              if (cleanContent.length < 10) {
                cleanContent = content;
              }

              results.push({
                id: `search_${Date.now()}_${index}`,
                username,
                content: cleanContent,
                time,
                stats,
                keyword
              });
            }
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

      // 去重并添加到结果列表
      const existingContentHashes = new Set(searchResults.map(r => r.content.substring(0, 50)));
      const newResults = currentResults.filter(r => !existingContentHashes.has(r.content.substring(0, 50)));

      searchResults.push(...newResults);
      console.log(`当前搜索结果: ${searchResults.length} 条`);

      if (searchResults.length >= count) {
        break;
      }

      // 滚动加载更多
      if (i < 4) {
        await this.page.evaluate(() => {
          window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
          });
        });

        await this.page.waitForTimeout(3000);
      }
    }

    return searchResults.slice(0, count);
  }

  async saveSearchResults(results, keyword) {
    console.log('保存搜索结果...');

    const saveDir = '/Users/fanzhang/.webauto/weibo';
    const keywordDir = path.join(saveDir, keyword);

    try {
      await fs.mkdir(keywordDir, { recursive: true });
    } catch (error) {
      // 目录可能已存在
    }

    const result = {
      timestamp: new Date().toISOString(),
      workflow: {
        name: this.workflow.name,
        version: this.workflow.version
      },
      keyword,
      totalResults: results.length,
      searchResults: results
    };

    const savePath = path.join(keywordDir, 'search-results.json');
    await fs.writeFile(savePath, JSON.stringify(result, null, 2), 'utf8');

    console.log(`搜索结果已保存到: ${savePath}`);

    // 显示统计信息
    const totalLikes = results.reduce((sum, result) => sum + result.stats.likes, 0);
    const totalComments = results.reduce((sum, result) => sum + result.stats.comments, 0);
    const totalReposts = results.reduce((sum, result) => sum + result.stats.reposts, 0);

    console.log('\n=== 搜索统计信息 ===');
    console.log(`搜索关键词: ${keyword}`);
    console.log(`搜索结果数量: ${results.length}`);
    console.log(`总点赞数: ${totalLikes.toLocaleString()}`);
    console.log(`总评论数: ${totalComments.toLocaleString()}`);
    console.log(`总转发数: ${totalReposts.toLocaleString()}`);
    console.log(`平均点赞: ${Math.round(totalLikes / results.length).toLocaleString()}`);
    console.log(`平均评论: ${Math.round(totalComments / results.length).toLocaleString()}`);
    console.log(`平均转发: ${Math.round(totalReposts / results.length).toLocaleString()}`);

    return results.length;
  }

  async execute(keyword, count = 50) {
    try {
      await this.initialize();

      // 加载Cookie
      const hasCookies = await this.loadCookies();
      if (!hasCookies) {
        console.log('警告: 未找到有效Cookie，可能无法正常访问');
      }

      // 执行搜索
      const results = await this.performSearch(keyword, count);

      // 保存结果
      const savedCount = await this.saveSearchResults(results, keyword);

      console.log(`\n🎉 搜索工作流执行完成！共获取 ${savedCount} 条搜索结果`);
      return savedCount;

    } catch (error) {
      console.error('搜索工作流执行失败:', error);
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
  const executor = new WeiboSearchWorkflowExecutor();

  // 使用测试关键词
  const keyword = process.argv[2] || '查理柯克';
  const count = parseInt(process.argv[3]) || 50;

  console.log('执行微博搜索工作流');
  console.log(`搜索关键词: ${keyword}`);
  console.log(`目标数量: ${count}`);

  const result = await executor.execute(keyword, count);

  process.exit(result > 0 ? 0 : 1);
}

main().catch(error => {
  console.error('程序执行失败:', error);
  process.exit(1);
});