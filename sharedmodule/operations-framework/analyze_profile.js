#!/usr/bin/env node

/**
 * 分析微博个人主页结构
 */

import { chromium } from 'playwright';

async function analyzeProfile() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    console.log('分析主页结构...');
    await page.goto('https://weibo.com/1671109627', { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面加载
    await page.waitForTimeout(5000);

    // 获取页面标题
    const title = await page.title();
    console.log('页面标题:', title);

    // 查找不同的内容选择器
    const selectors = [
      '.Feed_body_3R0rO',
      '.WB_detail',
      '.card-wrap',
      '.WB_feed',
      '.feed_item',
      '.weibo-post',
      '.WB_text',
      '[node-type="feed_list_item"]',
      '.card-feed',
      '.wbs-feed'
    ];

    console.log('\n检查各种选择器:');
    for (const selector of selectors) {
      const count = await page.$$eval(selector, els => els.length);
      console.log(`${selector}: ${count} 个元素`);
    }

    // 获取页面源码分析
    const html = await page.content();
    console.log('\n页面长度:', html.length);

    // 查找可能的加载更多按钮
    const loadMoreSelectors = [
      '.load_more',
      '.next_loading',
      '.WB_more',
      '.page_next',
      '.next',
      '[action-type="load_more"]',
      '.feed_load_more'
    ];

    console.log('\n检查加载更多按钮:');
    for (const selector of loadMoreSelectors) {
      const exists = await page.$(selector);
      console.log(`${selector}: ${exists ? '存在' : '不存在'}`);
    }

    // 尝试滚动并查看内容变化
    console.log('\n滚动测试...');
    const beforeScroll = await page.evaluate(() => document.body.scrollHeight);
    console.log('滚动前页面高度:', beforeScroll);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(3000);

    const afterScroll = await page.evaluate(() => document.body.scrollHeight);
    console.log('滚动后页面高度:', afterScroll);

    // 检查是否有分页
    const paginationSelectors = [
      '.page',
      '.pagination',
      '.WB_page',
      '.feed_page'
    ];

    console.log('\n检查分页:');
    for (const selector of paginationSelectors) {
      const exists = await page.$(selector);
      console.log(`${selector}: ${exists ? '存在' : '不存在'}`);
    }

    // 检查是否需要登录
    const loginSelectors = [
      '.login',
      '.login_btn',
      '[action-type="login"]',
      '.gn_login'
    ];

    console.log('\n检查登录提示:');
    for (const selector of loginSelectors) {
      const exists = await page.$(selector);
      console.log(`${selector}: ${exists ? '可能需要登录' : '未发现登录提示'}`);
    }

    // 尝试获取更多详细信息
    console.log('\n详细页面分析:');
    const pageInfo = await page.evaluate(() => {
      const info = {
        url: window.location.href,
        title: document.title,
        feedElements: document.querySelectorAll('.Feed_body_3R0rO, .WB_detail, .card-wrap').length,
        scrollHeight: document.body.scrollHeight,
        allElements: document.querySelectorAll('*').length,
        feedItems: document.querySelectorAll('[node-type="feed_list_item"]').length,
        wbFeeds: document.querySelectorAll('.WB_feed').length
      };
      return info;
    });

    console.log('页面信息:', pageInfo);

    // 截图保存以便分析
    await page.screenshot({ path: 'profile_analysis.png', fullPage: true });
    console.log('\n已保存截图: profile_analysis.png');

  } catch (error) {
    console.error('分析失败:', error);
  } finally {
    await browser.close();
  }
}

analyzeProfile().catch(console.error);