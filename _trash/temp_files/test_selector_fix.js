#!/usr/bin/env node

/**
 * 测试选择器修复功能
 * 验证逗号分隔选择器的正确处理
 */

import { chromium } from 'playwright';

const TEST_URL = 'https://www.1688.com';

async function testSelectorFix() {
  console.log('=== 测试选择器修复功能 ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. 加载页面
    console.log('1. 加载1688主页...');
    await page.goto(TEST_URL);
    await page.waitForLoadState('networkidle');
    console.log(`   ✓ 页面加载完成: ${page.url()}\n`);

    // 2. 注入修复后的检查逻辑
    console.log('2. 注入修复后的检查逻辑...');
    await page.addScriptTag({
      content: `
        // 修复后的容器检查函数
        async function checkContainerExists(selector) {
          try {
            if (!selector) return false;

            // 处理逗号分隔的选择器列表
            if (selector.includes(',')) {
              const selectors = selector.split(',').map(s => s.trim()).filter(s => s);
              for (const singleSelector of selectors) {
                try {
                  const elements = document.querySelectorAll(singleSelector);
                  if (elements.length > 0) {
                    console.log('✓ 容器匹配成功:', singleSelector, '- 找到', elements.length, '个元素');
                    return true;
                  }
                } catch (e) {
                  console.log('✗ 选择器无效:', singleSelector, '-', e.message);
                }
              }
              console.log('✗ 容器匹配失败:', selector, '- 所有子选择器都未找到');
              return false;
            } else {
              const elements = document.querySelectorAll(selector);
              const found = elements.length > 0;
              console.log(found ? '✓' : '✗', '容器匹配:', selector, found ? ('找到 ' + elements.length + ' 个元素') : '未找到');
              return found;
            }
          } catch (e) {
            console.error('✗ 容器检查异常:', selector, '-', e.message);
            return false;
          }
        }

        // 暴露到全局
        window.checkContainerExists = checkContainerExists;
      `
    });
    console.log('   ✓ 注入完成\n');

    // 3. 测试具体的选择器
    console.log('3. 测试关键容器的选择器...\n');

    const testCases = [
      { id: 'home', selector: 'body, .home, #page' },
      { id: 'home.search', selector: '.ali-search-box' },
      { id: 'home.search.searchbox', selector: '.ali-search-keywords input#alisearch-input, .ali-search-keywords input[name="keywords"], #alisearch-input, input[name="keywords"], input#alisearch-keywords' }
    ];

    const results = [];
    for (const testCase of testCases) {
      console.log(`测试容器: ${testCase.id}`);
      console.log(`选择器: ${testCase.selector}`);
      const exists = await page.evaluate(async (selector) => {
        // 同样在页面上下文中定义函数
        async function checkSelector(sel) {
          if (!sel) return false;
          if (sel.includes(',')) {
            const selectors = sel.split(',').map(s => s.trim()).filter(s => s);
            for (const singleSelector of selectors) {
              try {
                const elements = document.querySelectorAll(singleSelector);
                if (elements.length > 0) {
                  console.log('✓ 匹配:', singleSelector, '-', elements.length, '个元素');
                  return true;
                }
              } catch (e) {
                console.log('✗ 无效:', singleSelector, '-', e.message);
              }
            }
            return false;
          } else {
            const elements = document.querySelectorAll(sel);
            return elements.length > 0;
          }
        }
        return await checkSelector(selector);
      }, testCase.selector);
      results.push({ ...testCase, exists });
      console.log(`结果: ${exists ? '✓ 匹配' : '✗ 不匹配'}\n`);
    }

    // 4. 验证结果
    console.log('=== 测试结果汇总 ===\n');
    results.forEach(result => {
      console.log(`${result.exists ? '✓' : '✗'} ${result.id}: ${result.exists ? '匹配' : '不匹配'}`);
    });

    // 5. 重点验证 home 根容器
    console.log('\n=== 重点验证 home 根容器 ===\n');
    const homeResult = results.find(r => r.id === 'home');
    if (homeResult && homeResult.exists) {
      console.log('✅ SUCCESS: home 根容器匹配成功！');
      console.log('   这表明逗号分隔选择器修复生效。');
    } else {
      console.log('❌ FAIL: home 根容器仍未匹配。');
      console.log('   需要进一步调试选择器。');

      // 详细调试：测试每个子选择器
      console.log('\n详细调试：测试每个子选择器');
      await page.evaluate((selector) => {
        const parts = selector.split(',').map(s => s.trim());
        parts.forEach(part => {
          try {
            const elements = document.querySelectorAll(part);
            console.log(`  "${part}": ${elements.length} 个元素`);
          } catch (e) {
            console.log(`  "${part}": 无效选择器 (${e.message})`);
          }
        });
      }, homeResult.selector);
    }

    // 6. 截图
    console.log('\n6. 保存调试截图...');
    await page.screenshot({
      path: './test-results/selector-fix-test.png',
      fullPage: true
    });
    console.log('   ✓ 截图已保存\n');

    return homeResult && homeResult.exists;

  } catch (error) {
    console.error('\n✗ 测试过程中发生错误:', error);
    return false;
  } finally {
    await browser.close();
  }
}

// 运行测试
testSelectorFix()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
