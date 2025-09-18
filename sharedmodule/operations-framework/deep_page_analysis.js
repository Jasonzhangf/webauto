#!/usr/bin/env node

/**
 * 深度分析微博个人主页结构
 */

import { chromium } from 'playwright';
import fs from 'fs/promises';

async function deepPageAnalysis() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    console.log('=== 深度分析微博个人主页结构 ===');

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
    }

    // 导航到个人主页
    console.log('正在导航到个人主页...');
    await page.goto('https://weibo.com/1671109627', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面完全加载
    await page.waitForTimeout(10000);

    // 深度分析页面结构
    const analysis = await page.evaluate(() => {
      console.log('开始深度分析页面结构...');

      // 获取页面基本信息
      const info = {
        title: document.title,
        url: window.location.href,
        bodyTextLength: document.body.textContent.length,
        allElementsCount: document.querySelectorAll('*').length,
        allDivsCount: document.querySelectorAll('div').length,
        allSpansCount: document.querySelectorAll('span').length,
        allArticlesCount: document.querySelectorAll('article').length
      };

      // 分析各种可能的帖子选择器
      const selectors = {
        '.Feed_body_3R0rO': document.querySelectorAll('.Feed_body_3R0rO').length,
        '.WB_detail': document.querySelectorAll('.WB_detail').length,
        '.card-wrap': document.querySelectorAll('.card-wrap').length,
        '.WB_feed': document.querySelectorAll('.WB_feed').length,
        '[node-type="feed_list_item"]': document.querySelectorAll('[node-type="feed_list_item"]').length,
        '.card-feed': document.querySelectorAll('.card-feed').length,
        '.wbs-feed': document.querySelectorAll('.wbs-feed').length,
        '.Feed_body': document.querySelectorAll('.Feed_body').length,
        '.weibo-post': document.querySelectorAll('.weibo-post').length,
        '.post': document.querySelectorAll('.post').length,
        '.feed': document.querySelectorAll('.feed').length,
        '.content': document.querySelectorAll('.content').length
      };

      // 分析页面中的主要区域
      const mainAreas = [];
      const mainSections = document.querySelectorAll('main, section, .main, .content, .feed');
      mainSections.forEach((section, index) => {
        const rect = section.getBoundingClientRect();
        mainAreas.push({
          index,
          tagName: section.tagName,
          className: section.className,
          id: section.id,
          rect: {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
          },
          childrenCount: section.children.length,
          textContent: section.textContent.substring(0, 200)
        });
      });

      // 查找所有包含较长文本的元素
      const textElements = [];
      const allElements = document.querySelectorAll('*');

      allElements.forEach((element, index) => {
        const text = element.textContent.trim();
        // 只分析长度在10到500之间的文本
        if (text.length > 10 && text.length < 500) {
          // 排除导航、广告等非帖子内容
          const skipKeywords = ['登录', '注册', '首页', '发现', '消息', '设置', '退出', '微博', '随时随地', '新鲜事'];
          const hasSkipKeyword = skipKeywords.some(keyword => text.includes(keyword));

          if (!hasSkipKeyword) {
            // 检查是否包含时间信息
            const hasTimeInfo = /\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|\d{4}-\d{1,2}-\d{1,2}|今天|昨天|刚刚/.test(text);

            // 检查是否包含数字（可能是点赞数等）
            const hasNumbers = /\d+/.test(text);

            // 获取元素的路径
            function getElementPath(element) {
              const path = [];
              let current = element;
              while (current && current !== document.body) {
                const tagName = current.tagName.toLowerCase();
                const className = current.className;
                const identifier = className ? `${tagName}.${className.replace(/\s+/g, '.')}` : tagName;
                path.unshift(identifier);
                current = current.parentElement;
              }
              return path.join(' > ');
            }

            textElements.push({
              index,
              tagName: element.tagName,
              className: element.className,
              textLength: text.length,
              text: text,
              hasTimeInfo,
              hasNumbers,
              path: getElementPath(element)
            });
          }
        }
      });

      // 分析可能的帖子容器
      const possiblePosts = textElements
        .filter(el => el.hasTimeInfo || el.hasNumbers)
        .slice(0, 20); // 只取前20个

      // 检查是否有滚动加载或分页
      const loadMoreElements = document.querySelectorAll('.load_more, .next, .page_next, .WB_more, .more');
      const hasLoadMore = loadMoreElements.length > 0;

      // 检查页面高度和滚动情况
      const scrollInfo = {
        scrollHeight: document.body.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
        scrollPercentage: Math.round((document.documentElement.scrollTop + document.documentElement.clientHeight) / document.body.scrollHeight * 100)
      };

      // 查找所有可能的图片元素
      const imageElements = document.querySelectorAll('img');
      const imageInfo = {
        totalCount: imageElements.length,
        contentImages: Array.from(imageElements).filter(img => {
          const src = img.getAttribute('src') || '';
          return !src.includes('avatar') && !src.includes('icon') && !src.includes('logo') && !src.includes('thumb');
        }).length
      };

      return {
        info,
        selectors,
        mainAreas,
        possiblePosts,
        loadMoreInfo: {
          hasLoadMore,
          loadMoreCount: loadMoreElements.length
        },
        scrollInfo,
        imageInfo
      };
    });

    console.log('\n=== 页面基本信息 ===');
    console.log('标题:', analysis.info.title);
    console.log('URL:', analysis.info.url);
    console.log('页面文本长度:', analysis.info.bodyTextLength);
    console.log('总元素数:', analysis.info.allElementsCount);
    console.log('DIV元素数:', analysis.info.allDivsCount);
    console.log('SPAN元素数:', analysis.info.allSpansCount);
    console.log('ARTICLE元素数:', analysis.info.allArticlesCount);

    console.log('\n=== 选择器分析 ===');
    Object.entries(analysis.selectors).forEach(([selector, count]) => {
      console.log(`${selector}: ${count} 个元素`);
    });

    console.log('\n=== 主要区域分析 ===');
    analysis.mainAreas.forEach(area => {
      console.log(`区域 ${area.index}: <${area.tagName}>`);
      console.log(`  类名: ${area.className}`);
      console.log(`  尺寸: ${area.rect.width}x${area.rect.height}`);
      console.log(`  子元素数: ${area.childrenCount}`);
      console.log(`  文本预览: ${area.textContent}`);
      console.log('---');
    });

    console.log('\n=== 可能的帖子元素 ===');
    analysis.possiblePosts.forEach((post, index) => {
      console.log(`${index + 1}. <${post.tagName} class="${post.className}">`);
      console.log(`   文本长度: ${post.textLength}`);
      console.log(`   时间信息: ${post.hasTimeInfo ? '有' : '无'}`);
      console.log(`   数字信息: ${post.hasNumbers ? '有' : '无'}`);
      console.log(`   路径: ${post.path}`);
      console.log(`   文本: ${post.text}`);
      console.log('---');
    });

    console.log('\n=== 滚动和加载信息 ===');
    console.log('页面高度:', analysis.scrollInfo.scrollHeight);
    console.log('可视区域高度:', analysis.scrollInfo.clientHeight);
    console.log('滚动百分比:', analysis.scrollInfo.scrollPercentage + '%');
    console.log('加载更多按钮:', analysis.loadMoreInfo.hasLoadMore ? '有' : '无');
    console.log('加载更多元素数:', analysis.loadMoreInfo.loadMoreCount);

    console.log('\n=== 图片信息 ===');
    console.log('总图片数:', analysis.imageInfo.totalCount);
    console.log('内容图片数:', analysis.imageInfo.contentImages);

    // 保存截图
    await page.screenshot({ path: 'deep_page_analysis.png', fullPage: true });
    console.log('\n已保存截图: deep_page_analysis.png');

    // 保存分析结果
    const analysisData = {
      timestamp: new Date().toISOString(),
      analysis
    };

    await fs.writeFile('/Users/fanzhang/.webauto/weibo/user-profiles/包容万物恒河水/page_analysis.json', JSON.stringify(analysisData, null, 2), 'utf8');
    console.log('\n已保存分析结果: page_analysis.json');

  } catch (error) {
    console.error('分析失败:', error);
  } finally {
    await browser.close();
  }
}

deepPageAnalysis().catch(console.error);