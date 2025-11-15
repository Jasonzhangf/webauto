#!/usr/bin/env node

/**
 * 直接通过Playwright高亮页面元素
 */

import { chromium } from 'playwright';

async function directHighlight() {
  let browser;
  let context;

  try {
    console.log('🎨 开始直接高亮页面元素...');

    // 连接到现有浏览器实例
    browser = await chromium.connectOverCDP('http://localhost:9222');
    context = browser.contexts()[0];
    const pages = context.pages();
    const page = pages[pages.length - 1]; // 获取最新页面

    console.log('📄 当前页面URL:', page.url());

    // 高亮数据
    const searchResultsContainer = [0, 584, 1623, 3397];
    const firstProduct = [625, 611, 894, 1561];

    // 注入高亮CSS和JavaScript
    await page.addStyleTag({
      content: `
        .highlight-overlay {
          position: absolute;
          pointer-events: none;
          z-index: 9999;
          border: 3px solid;
          background: rgba(255, 255, 255, 0.1);
        }
        .highlight-label {
          position: absolute;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 4px 8px;
          font-size: 12px;
          border-radius: 4px;
          font-family: Arial, sans-serif;
          z-index: 10000;
        }
      `
    });

    // 高亮搜索结果容器（红色）
    await page.evaluate(([x1, y1, x2, y2]) => {
      const overlay = document.createElement('div');
      overlay.className = 'highlight-overlay';
      overlay.style.cssText = `
        left: ${x1}px;
        top: ${y1}px;
        width: ${x2 - x1}px;
        height: ${y2 - y1}px;
        border-color: #ff0000;
      `;

      const label = document.createElement('div');
      label.className = 'highlight-label';
      label.textContent = '搜索结果容器';
      label.style.cssText = `
        left: ${x1}px;
        top: ${y1 - 25}px;
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(label);
    }, searchResultsContainer);

    // 高亮第一个商品（绿色）
    await page.evaluate(([x1, y1, x2, y2]) => {
      const overlay = document.createElement('div');
      overlay.className = 'highlight-overlay';
      overlay.style.cssText = `
        left: ${x1}px;
        top: ${y1}px;
        width: ${x2 - x1}px;
        height: ${y2 - y1}px;
        border-color: #00ff00;
      `;

      const label = document.createElement('div');
      label.className = 'highlight-label';
      label.textContent = '第一个商品';
      label.style.cssText = `
        left: ${x1}px;
        top: ${y1 - 25}px;
      `;

      document.body.appendChild(overlay);
      document.body.appendChild(label);
    }, firstProduct);

    console.log('✅ 高亮完成');

    // 等待2秒让高亮渲染完成
    await page.waitForTimeout(2000);

    // 截图证明高亮完成
    console.log('📸 截图证明高亮完成...');
    const screenshot = await page.screenshot({
      fullPage: true,
      type: 'png'
    });

    // 保存证明截图
    const proofPath = '/tmp/highlighted-elements-proof.png';
    import('fs').then(fs => {
      fs.writeFileSync(proofPath, screenshot);
      console.log(`💾 高亮证明截图已保存: ${proofPath}`);
      console.log('🎉 任务完成！已成功高亮搜索结果容器和第一个商品元素。');
    });

  } catch (error) {
    console.error('❌ 高亮失败:', error);
    throw error;
  } finally {
    // 断开连接但保持浏览器运行
    if (browser) {
      await browser.close();
    }
  }
}

directHighlight();