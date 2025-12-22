#!/usr/bin/env node

/**
 * 直接执行1688动态搜索
 * 不依赖工作流引擎的变量替换，在JavaScript中直接处理所有逻辑
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import GBKEncoder from './utils/gbk-encoder.js';

/**
 * 直接执行1688搜索
 * @param {string} keyword - 搜索关键词
 * @param {boolean} debug - 是否显示调试信息
 */
async function runDirect1688Search(keyword, debug = false) {
  console.log(`🚀 开始1688动态搜索: ${keyword}`);

  // 生成正确的GBK编码URL
  const encoder = new GBKEncoder();
  const searchURL = encoder.generate1688URL(keyword);
  console.log(`🔗 生成的搜索URL: ${searchURL}`);

  try {
    // 直接使用Camoufox执行搜索
    const command = `CAMOUFOX_PATH="/Users/fanzhang/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox" node -e "
import { spawn } from 'child_process';

// 创建浏览器实例
const browser = await spawn('/Users/fanzhang/Library/Camoufox/Camoufox.app/Contents/MacOS/camoufox', [
  '--headless=false',
  '--no-first-run',
  '--disable-web-security',
  '--disable-features=VizDisplayCompositor',
  '--lang=zh-CN',
  '--accept-lang=zh-CN,zh'
]);

let page;
try {
  // 启动浏览器进程
  const browserProcess = await new Promise((resolve, reject) => {
    browser.stdout.on('data', (data) => {
      if (debug) console.log('Browser stdout:', data.toString());
    });

    browser.stderr.on('data', (data) => {
      if (debug) console.log('Browser stderr:', data.toString());
    });

    browser.on('spawn', async () => {
      try {
        // 启动Playwright连接
        const { chromium } = require('playwright');
        const playwright = require('playwright');

        const connection = await playwright.chromium.connect({
          wsEndpoint: \`ws://\${browser.stderr.toString().match(/ws:\\/([^\\s\\n]+)/)[1]}\`
        });

        page = connection;
        resolve(connection);
      } catch (error) {
        console.error('Playwright连接失败:', error.message);
        reject(error);
      }
    });

    browser.on('error', reject);
    browser.on('close', () => {
      if (debug) console.log('浏览器进程关闭');
    });
  });

  // 导航到1688主页先建立会话
  await page.goto('https://www.1688.com/', { waitUntil: 'networkidle' });
  console.log('✅ 已访问1688主页');

  // 导航到搜索页面
  await page.goto(searchURL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('✅ 已导航到搜索页面');

  // 等待页面加载
  await page.waitForTimeout(3000);

  // 提取搜索结果
  const searchResults = await page.evaluate(() => {
    const offerItems = document.querySelectorAll('.sm-offer-item, .offer-item, .sm-offer, [class*=offer]');
    console.log('找到 ' + offerItems.length + ' 个商品项');

    let merchantLinks = [];
    let merchantTitles = [];

    if (offerItems.length > 0) {
      for (let i = 0; i < Math.min(20, offerItems.length); i++) {
        const item = offerItems[i];
        const link = item.querySelector('a[href*="1688.com"]');
        const title = item.querySelector('h4, [class*=title], a[title]');

        if (link && link.href) {
          merchantLinks.push(link.href);
          merchantTitles.push(title ? title.textContent.trim() : '');
        }
      }
    }

    return {
      merchantLinks,
      merchantTitles,
      totalFound: merchantLinks.length,
      pageTitle: document.title,
      currentUrl: window.location.href
    };
  });

  console.log(`📊 找到 ${searchResults.totalFound} 个商家链接`);

  if (searchResults.totalFound > 0) {
    console.log('📝 前3个商品标题:', searchResults.merchantTitles.slice(0, 3));

    // 打开第一条商家链接
    console.log('🔗 正在打开第一条商家链接...');
    await page.goto(searchResults.merchantLinks[0], { waitUntil: 'networkidle', timeout: 30000 });

    // 分析商家页面
    const merchantInfo = await page.evaluate(() => {
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString()
      };

      const isMerchantPage = window.location.href.includes('1688.com') &&
        (window.location.href.includes('/offer/') ||
         window.location.href.includes('/company/') ||
         window.location.href.includes('member_id='));

      const merchantInfo = {};
      const companyTitle = document.querySelector('[class*=company], [class*=title], h1');
      const contactInfo = document.querySelector('[class*=contact], [class*=phone], [class*=tel]');
      const productImages = document.querySelectorAll('img[src*="1688"]');

      merchantInfo.companyName = companyTitle ? companyTitle.textContent.trim() : '';
      merchantInfo.hasContact = !!contactInfo;
      merchantInfo.imageCount = productImages.length;

      return {
        pageInfo,
        merchantInfo,
        isMerchantPage
      };
    });

    console.log('🏪 商家页面分析完成');
    console.log(`📋 公司名称: ${merchantInfo.merchantInfo.companyName}`);
    console.log(`📱 产品图片数量: ${merchantInfo.merchantInfo.imageCount}`);
    console.log(`📞 是否商家页面: ${merchantInfo.isMerchantPage ? '是' : '否'}`);

    return {
      success: true,
      keyword,
      searchURL,
      searchResults,
      merchantInfo,
      timestamp: new Date().toISOString()
    };
  } else {
    console.log('❌ 未找到任何商家链接');
    return {
      success: false,
      keyword,
      searchURL,
      searchResults,
      timestamp: new Date().toISOString()
    };
  }

} catch (error) {
  console.error('❌ 搜索执行失败:', error.message);
  return {
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  };
} finally {
  if (page) {
    await page.close();
  }
  if (browser) {
    browser.kill();
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('使用方法:');
    console.log('  node scripts/dynamic-1688-search.js <搜索关键词> [--debug]');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/dynamic-1688-search.js "钢化膜"');
    console.log('  node scripts/dynamic-1688-search.js "手机" --debug');
    console.log('  node scripts/dynamic-1688-search.js "汽车配件"');
    process.exit(1);
  }

  const keyword = args[0];
  const debug = args.includes('--debug');

  try {
    const result = await runDirect1688Search(keyword, debug);

    // 保存结果
    const resultFile = `archive/workflow-records/dynamic-search-${keyword.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '-')}-${Date.now()}.json`;
    const resultDir = path.dirname(resultFile);

    if (!fs.existsSync(resultDir)) {
      fs.mkdirSync(resultDir, { recursive: true });
    }

    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log(`💾 结果已保存到: ${resultFile}`);

    if (result.success) {
      console.log('✅ 搜索完成');
    } else {
      console.log('❌ 搜索失败');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === \`file://\${process.argv[1]}\`) {
  main();
}

export { runDirect1688Search };