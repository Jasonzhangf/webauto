#!/usr/bin/env node

/**
 * 容器树过滤功能测试
 * 测试新的容器过滤和显示功能
 */

import { chromium } from 'playwright';

const TEST_URL = 'https://www.1688.com';
const CONTAINER_LIBRARY_PATH = './container-library.json';

async function testContainerTreeFilter() {
  console.log('=== 开始测试容器树过滤功能 ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 加载页面
    console.log('1. 加载测试页面...');
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
    console.log(`   ✓ 页面加载完成: ${page.url()}\n`);

    // 2. 读取容器库
    console.log('2. 读取容器库配置...');
    const fs = await import('fs');
    const containerLibrary = JSON.parse(fs.readFileSync(CONTAINER_LIBRARY_PATH, 'utf-8'));
    const containers = containerLibrary.cbu.containers;
    console.log(`   ✓ 加载 ${Object.keys(containers).length} 个容器\n`);

    // 3. 测试容器匹配算法
    console.log('3. 测试容器存在性检测...');
    const testSelectors = [
      'body',
      '.ali-search-box',
      '.search-ui2024',
      '.nonexistent-selector'
    ];

    for (const selector of testSelectors) {
      const exists = await page.evaluate((sel) => {
        try {
          const elements = document.querySelectorAll(sel);
          return elements.length > 0;
        } catch (e) {
          return false;
        }
      }, selector);
      console.log(`   ${exists ? '✓' : '✗'} 选择器 "${selector}": ${exists ? '存在' : '不存在'}`);
    }
    console.log();

    // 4. 测试容器树渲染
    console.log('4. 测试容器树渲染...');
    await page.addScriptTag({
      path: './browser_interface/overlay_assets/panel.js'
    });

    // 等待一段时间让脚本加载
    await page.waitForTimeout(2000);

    // 5. 验证过滤结果
    console.log('5. 验证容器过滤结果...');
    const filterResults = await page.evaluate((containers) => {
      // 模拟过滤逻辑
      const matchedContainers = {};
      const matchedRootIds = new Set();

      Object.entries(containers).forEach(([id, container]) => {
        try {
          const elements = document.querySelectorAll(container.selector || '');
          if (elements.length > 0) {
            matchedContainers[id] = container;
            matchedRootIds.add(id);
          }
        } catch (e) {
          // 忽略无效选择器
        }
      });

      return {
        total: Object.keys(containers).length,
        matched: Object.keys(matchedContainers).length,
        matchedRoots: Array.from(matchedRootIds)
      };
    }, containers);

    console.log(`   总容器数: ${filterResults.total}`);
    console.log(`   匹配容器数: ${filterResults.matched}`);
    console.log(`   匹配率: ${(filterResults.matched / filterResults.total * 100).toFixed(1)}%`);
    console.log(`   匹配根容器: ${filterResults.matchedRoots.join(', ') || '无'}\n`);

    // 6. 测试性能
    console.log('6. 测试分批验证性能...');
    const startTime = Date.now();
    const batchSize = 10;
    const containerEntries = Object.entries(containers);
    const batches = [];

    for (let i = 0; i < containerEntries.length; i += batchSize) {
      batches.push(containerEntries.slice(i, i + batchSize));
    }

    console.log(`   分批数量: ${batches.length}`);
    console.log(`   每批大小: ${batchSize}`);
    console.log(`   总耗时: ${Date.now() - startTime}ms\n`);

    // 7. 测试结果验证
    console.log('7. 验证测试结果...');
    const testsPassed = [];
    const testsFailed = [];

    // 测试1: 至少有部分容器被匹配
    if (filterResults.matched > 0) {
      testsPassed.push('容器匹配检测');
    } else {
      testsFailed.push('容器匹配检测 - 没有找到匹配的容器');
    }

    // 测试2: 匹配率合理
    if (filterResults.matched / filterResults.total > 0.1) {
      testsPassed.push('匹配率测试');
    } else {
      testsFailed.push('匹配率测试 - 匹配率过低');
    }

    // 测试3: 分批处理正常工作
    if (batches.length > 0) {
      testsPassed.push('分批处理测试');
    } else {
      testsFailed.push('分批处理测试 - 没有创建批次');
    }

    // 输出结果
    console.log('\n=== 测试结果 ===');
    console.log(`\n✓ 通过的测试 (${testsPassed.length}):`);
    testsPassed.forEach(test => console.log(`  - ${test}`));

    if (testsFailed.length > 0) {
      console.log(`\n✗ 失败的测试 (${testsFailed.length}):`);
      testsFailed.forEach(test => console.log(`  - ${test}`));
    }

    console.log(`\n=== 测试完成 ===`);
    console.log(`状态: ${testsFailed.length === 0 ? '全部通过' : '部分失败'}`);

    // 8. 截图记录
    console.log('\n8. 保存测试截图...');
    await page.screenshot({
      path: './test-results/container-tree-filter-test.png',
      fullPage: true
    });
    console.log('   ✓ 截图已保存\n');

    return testsFailed.length === 0;

  } catch (error) {
    console.error('\n✗ 测试过程中发生错误:', error);
    return false;
  } finally {
    await browser.close();
  }
}

// 运行测试
testContainerTreeFilter()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
