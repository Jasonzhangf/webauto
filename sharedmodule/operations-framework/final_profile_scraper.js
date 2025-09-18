#!/usr/bin/env node

/**
 * 最终的微博个人主页抓取脚本
 * 能够识别和处理登录限制情况
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
      // 导航到个人主页
      console.log('正在导航到个人主页...');
      await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载
      await page.waitForTimeout(5000);

      // 分析页面状态
      const pageInfo = await page.evaluate(() => {
        // 检查是否需要登录
        const loginElements = document.querySelectorAll('.login, .login_btn, [action-type="login"], .gn_login');
        const hasLoginPrompt = loginElements.length > 0;

        // 检查是否有"登录/注册"文本
        const bodyText = document.body.textContent;
        const hasLoginText = bodyText.includes('登录') && bodyText.includes('注册');

        // 检查是否有用户信息
        const userInfo = {
          username: '',
          followers: 0,
          following: 0,
          posts: 0,
          description: '',
          verified: false
        };

        // 尝试提取用户信息
        try {
          // 用户名
          const usernameElements = document.querySelectorAll('.PCD_user_info .username, .Profile_header .name, .UserInfo_name, .gn_name');
          if (usernameElements.length > 0) {
            userInfo.username = usernameElements[0].textContent.trim();
          }

          // 从标题提取用户名
          if (!userInfo.username) {
            const titleMatch = document.title.match(/@([^的]+)/);
            if (titleMatch) {
              userInfo.username = titleMatch[1];
            }
          }

          // 粉丝数、关注数、微博数
          const statsElements = document.querySelectorAll('.Follow_item_2WdF9 .S_txt1, .Follow_item_2WdF9 .S_txt2, .PCD_user_info .followers_count, .PCD_user_info .friends_count, .PCD_user_info .weibo_count');
          statsElements.forEach(el => {
            const text = el.textContent;
            if (text.includes('粉丝') || text.includes('关注') || text.includes('微博')) {
              const match = text.match(/(\d+(?:\.\d+)?[万千亿]?)/);
              if (match) {
                const num = match[1];
                if (text.includes('粉丝')) userInfo.followers = num;
                else if (text.includes('关注')) userInfo.following = num;
                else if (text.includes('微博')) userInfo.posts = num;
              }
            }
          });

          // 个人简介
          const descElements = document.querySelectorAll('.ProfileHeader_descText_3AF6o, .PCD_user_info .intro, .UserInfo_intro');
          if (descElements.length > 0) {
            userInfo.description = descElements[0].textContent.trim();
          }

          // 认证状态
          const verifiedElements = document.querySelectorAll('.verified, .verify, .Icon_vip');
          userInfo.verified = verifiedElements.length > 0;
        } catch (e) {
          console.log('提取用户信息时出错:', e);
        }

        // 检查是否有内容区域
        const contentSelectors = [
          '.Feed_body_3R0rO',
          '.WB_detail',
          '.card-wrap',
          '.WB_feed',
          '[node-type="feed_list_item"]',
          '.card-feed',
          '.wbs-feed'
        ];

        let contentCount = 0;
        contentSelectors.forEach(selector => {
          contentCount += document.querySelectorAll(selector).length;
        });

        return {
          hasLoginPrompt,
          hasLoginText,
          userInfo,
          contentCount,
          title: document.title,
          url: window.location.href
        };
      });

      console.log('页面分析结果:');
      console.log('- 用户名:', pageInfo.userInfo.username || '未知');
      console.log('- 粉丝数:', pageInfo.userInfo.followers || '未知');
      console.log('- 关注数:', pageInfo.userInfo.following || '未知');
      console.log('- 微博数:', pageInfo.userInfo.posts || '未知');
      console.log('- 需要登录:', pageInfo.hasLoginPrompt || pageInfo.hasLoginText);
      console.log('- 内容元素数量:', pageInfo.contentCount);

      if (pageInfo.hasLoginPrompt || pageInfo.hasLoginText) {
        console.log('\n⚠️  该用户主页需要登录才能查看完整内容');
        console.log('当前只能获取到公开的基本信息');
      }

      // 尝试抓取可见内容
      const posts = [];
      if (pageInfo.contentCount > 0) {
        console.log('\n尝试抓取可见内容...');

        const visiblePosts = await page.evaluate(() => {
          const results = [];
          const selectors = ['.Feed_body_3R0rO', '.WB_detail', '.card-wrap', '.WB_feed'];

          selectors.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach((element, index) => {
              try {
                const contentElement = element.querySelector('.Feed_body_3R0rO, .WB_text, .text, .content');
                const content = contentElement ? contentElement.textContent.trim() : '';

                if (content && content.length > 5) {
                  const timeElement = element.querySelector('.time, .date, .from a');
                  const time = timeElement ? timeElement.textContent.trim() : '';

                  const images = [];
                  const imageElements = element.querySelectorAll('img');
                  imageElements.forEach(img => {
                    const src = img.getAttribute('src');
                    if (src && !src.includes('avatar') && !src.includes('thumb')) {
                      images.push(src.startsWith('//') ? 'https:' + src : src);
                    }
                  });

                  results.push({
                    id: `post_${Date.now()}_${index}`,
                    content,
                    time,
                    images,
                    isPartial: true
                  });
                }
              } catch (e) {
                // 忽略错误
              }
            });
          });

          return results;
        });

        posts.push(...visiblePosts);
        console.log(`找到 ${posts.length} 条可见内容`);
      }

      // 保存数据
      const username = pageInfo.userInfo.username || 'unknown_user';
      const saveDir = path.join(process.env.HOME || '~', '.webauto', 'weibo', 'user-profiles', username);
      await fs.mkdir(saveDir, { recursive: true });

      // 保存JSON数据
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonFileName = `profile_analysis_${timestamp}.json`;
      const jsonPath = path.join(saveDir, jsonFileName);

      const saveData = {
        username: pageInfo.userInfo.username,
        profileUrl,
        extractionTime: new Date().toISOString(),
        userInfo: pageInfo.userInfo,
        pageInfo: {
          needsLogin: pageInfo.hasLoginPrompt || pageInfo.hasLoginText,
          contentCount: pageInfo.contentCount,
          title: pageInfo.title
        },
        postsCount: posts.length,
        posts: posts,
        status: pageInfo.hasLoginPrompt || pageInfo.hasLoginText ? 'login_required' : 'partial_content'
      };

      await fs.writeFile(jsonPath, JSON.stringify(saveData, null, 2), 'utf8');

      console.log('');
      console.log('=== 抓取结果 ===');
      console.log('✅ 分析完成');
      console.log('用户名:', pageInfo.userInfo.username);
      console.log('粉丝数:', pageInfo.userInfo.followers);
      console.log('关注数:', pageInfo.userInfo.following);
      console.log('微博总数:', pageInfo.userInfo.posts);
      console.log('个人简介:', pageInfo.userInfo.description);
      console.log('认证状态:', pageInfo.userInfo.verified ? '已认证' : '未认证');
      console.log('登录要求:', pageInfo.hasLoginPrompt || pageInfo.hasLoginText ? '需要登录' : '公开可见');
      console.log('可见内容:', posts.length, '条');
      console.log('保存路径:', saveDir);
      console.log('分析文件:', jsonFileName);

      // 显示可见内容
      if (posts.length > 0) {
        console.log('');
        console.log('=== 可见内容 ===');
        posts.forEach((post, index) => {
          console.log(`${index + 1}. ${post.content?.substring(0, 200)}...`);
          if (post.time) console.log(`   时间: ${post.time}`);
          if (post.images && post.images.length > 0) {
            console.log(`   图片: ${post.images.length} 张`);
          }
          console.log('---');
        });
      }

      return {
        success: true,
        username: pageInfo.userInfo.username,
        userInfo: pageInfo.userInfo,
        needsLogin: pageInfo.hasLoginPrompt || pageInfo.hasLoginText,
        postsCount: posts.length,
        data: posts,
        savePath: saveDir,
        jsonFile: jsonFileName,
        status: pageInfo.hasLoginPrompt || pageInfo.hasLoginText ? 'login_required' : 'partial_content'
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
    console.log('使用方法: node final_profile_scraper.js <profileUrl> [options]');
    console.log('');
    console.log('参数:');
    console.log('  profileUrl      微博个人主页链接');
    console.log('');
    console.log('示例:');
    console.log('  node final_profile_scraper.js https://weibo.com/1671109627');
    console.log('  node final_profile_scraper.js https://weibo.com/央视新闻');
    process.exit(1);
  }

  const profileUrl = args[0];

  scrapeWeiboProfileFinal(profileUrl)
    .then(result => {
      console.log('');
      console.log('分析完成!');
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