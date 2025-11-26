#!/usr/bin/env node

/**
 * 测试根容器匹配功能
 * 专门测试1688主页的根容器匹配
 */

import { chromium } from 'playwright';

const TEST_URL = 'https://www.1688.com';

async function testRootContainerMatch() {
  console.log('=== 测试根容器匹配功能 ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 加载页面
    console.log('1. 加载1688主页...');
    await page.goto(TEST_URL);
    await page.waitForLoadState('domcontentloaded');
    console.log(`   ✓ 页面加载完成: ${page.url()}\n`);

    // 2. 读取容器库
    console.log('2. 读取容器库配置...');
    const fs = await import('fs');
    const containerLibrary = JSON.parse(fs.readFileSync('./container-library.json', 'utf-8'));
    const containers = containerLibrary.cbu.containers;
    console.log(`   ✓ 加载 ${Object.keys(containers).length} 个容器\n`);

    // 3. 识别根容器
    console.log('3. 识别根容器...');
    const parentMap = {};
    Object.entries(containers).forEach(([id, c]) => {
      (c.children || []).forEach(childId => {
        parentMap[childId] = id;
      });
    });

    const rootIds = Object.keys(containers).filter(id => !parentMap[id]);
    console.log(`   发现 ${rootIds.length} 个根容器:`);
    rootIds.forEach(id => {
      const c = containers[id];
      console.log(`     - ${id}: ${c.description || '(无描述)'} [${c.selector || '(无选择器)'}]`);
    });
    console.log();

    // 4. 验证每个根容器
    console.log('4. 验证根容器匹配...\n');
    console.log('='.repeat(60));

    const results = [];
    for (const rootId of rootIds) {
      const container = containers[rootId];
      console.log(`\n检查根容器: ${rootId}`);
      console.log(`描述: ${container.description || '(无)'}`);
      console.log(`选择器: ${container.selector || '(无)'}`);

      const exists = await page.evaluate(async (selector) => {
        // 同样在页面上下文中定义函数
        if (!selector) return false;

        console.log(`  调试: 解析选择器 "${selector}"`);

        if (selector.includes(',')) {
          const selectors = selector.split(',').map(s => s.trim()).filter(s => s);
          console.log(`  调试: 分割为 ${selectors.length} 个子选择器`);
          for (const singleSelector of selectors) {
            try {
              const elements = document.querySelectorAll(singleSelector);
              console.log(`  调试: "${singleSelector}" 找到 ${elements.length} 个元素`);
              if (elements.length > 0) {
                console.log(`  ✓ 匹配成功！`);
                return true;
              }
            } catch (e) {
              console.log(`  调试: "${singleSelector}" 选择器无效 (${e.message})`);
            }
          }
          console.log(`  ✗ 所有子选择器都未找到`);
          return false;
        } else {
          try {
            const elements = document.querySelectorAll(selector);
            const found = elements.length > 0;
            console.log(`  ${found ? '✓' : '✗'} ${selector} ${found ? `找到 ${elements.length} 个元素` : '未找到'}`);
            return found;
          } catch (e) {
            console.log(`  ✗ 选择器无效: ${e.message}`);
            return false;
          }
        }
      }, container.selector);

      results.push({ id: rootId, exists, container });
      console.log(`结果: ${exists ? '✅ 匹配' : '❌ 不匹配'}`);
    }

    console.log('\n' + '='.repeat(60));

    // 5. 统计结果
    console.log('\n=== 测试结果汇总 ===\n');
    const matchedRoots = results.filter(r => r.exists);
    console.log(`总根容器数: ${rootIds.length}`);
    console.log(`匹配根容器数: ${matchedRoots.length}`);
    console.log(`匹配率: ${(matchedRoots.length / rootIds.length * 100).toFixed(1)}%\n`);

    if (matchedRoots.length > 0) {
      console.log('✅ 匹配的根容器:');
      matchedRoots.forEach(r => {
        console.log(`  - ${r.id}: ${r.container.description || '(无描述)'}`);
      });
    } else {
      console.log('❌ 没有找到任何匹配的根容器！');
      console.log('\n可能的原因:');
      console.log('1. 页面尚未完全加载');
      console.log('2. 选择器不再匹配页面结构');
      console.log('3. 需要登录或特殊状态');
    }

    // 6. 特别检查 home 根容器
    console.log('\n=== 重点检查 home 根容器 ===\n');
    const homeResult = results.find(r => r.id === 'home');
    if (homeResult) {
      if (homeResult.exists) {
        console.log('✅ SUCCESS: home 根容器匹配成功！');
        console.log('   这表明修复生效，1688根容器现在能被正确识别。');
      } else {
        console.log('❌ FAIL: home 根容器仍未匹配。');
        console.log('\n进一步调试:');

        // 测试每个选择器部分
        await page.evaluate((selector) => {
          console.log(`\n选择器: "${selector}"`);
          if (selector.includes(',')) {
            const parts = selector.split(',').map(s => s.trim());
            parts.forEach((part, i) => {
              console.log(`  部分 ${i + 1}: "${part}"`);
              try {
                const el = document.querySelector(part);
                console.log(`    - querySelector: ${el ? '找到' : '未找到'}`);
                const all = document.querySelectorAll(part);
                console.log(`    - querySelectorAll: ${all.length} 个元素`);
              } catch (e) {
                console.log(`    - 错误: ${e.message}`);
              }
            });
          } else {
            try {
              const el = document.querySelector(selector);
              console.log(`  querySelector: ${el ? '找到' : '未找到'}`);
              const all = document.querySelectorAll(selector);
              console.log(`  querySelectorAll: ${all.length} 个元素`);
            } catch (e) {
              console.log(`  错误: ${e.message}`);
            }
          }
        }, homeResult.container.selector);
      }
    }

    // 7. 截图
    console.log('\n7. 保存测试截图...');
    await page.screenshot({
      path: './test-results/root-container-match-test.png',
      fullPage: true
    });
    console.log('   ✓ 截图已保存\n');

    // 返回 home 根容器是否匹配
    return homeResult && homeResult.exists;

  } catch (error) {
    console.error('\n✗ 测试过程中发生错误:', error);
    return false;
  } finally {
    await browser.close();
  }
}

// 运行测试
testRootContainerMatch()
  .then(success => {
    console.log(`\n=== 测试完成 ===`);
    console.log(`状态: ${success ? '✅ 成功' : '❌ 失败'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
