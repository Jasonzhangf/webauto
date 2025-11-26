#!/usr/bin/env node

/**
 * 测试简化后的根容器匹配功能
 */

import { chromium } from 'playwright';

const TEST_URL = 'https://www.1688.com';

async function testSimplifiedMatch() {
  console.log('=== 测试简化后的根容器匹配 ===\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('1. 加载1688主页...');
    await page.goto(TEST_URL);
    await page.waitForLoadState('domcontentloaded');
    console.log(`   ✓ 页面加载完成\n`);

    console.log('2. 读取容器库配置...');
    const fs = await import('fs');
    const containerLibrary = JSON.parse(fs.readFileSync('./container-library.json', 'utf-8'));
    const containers = containerLibrary.cbu.containers;
    console.log(`   ✓ 加载 ${Object.keys(containers).length} 个容器\n`);

    // 注入简化后的检查逻辑
    console.log('3. 测试简化后的匹配逻辑...\n');
    const simplifiedLogic = `
      function checkContainerExists(selector) {
        if (!selector) return false;

        if (selector.includes(',')) {
          const selectors = selector.split(',').map(s => s.trim()).filter(s => s);
          for (const singleSelector of selectors) {
            try {
              const elements = document.querySelectorAll(singleSelector);
              if (elements.length > 0) return true;
            } catch (e) {}
          }
          return false;
        } else {
          try {
            const elements = document.querySelectorAll(selector);
            return elements.length > 0;
          } catch (e) {
            return false;
          }
        }
      }

      function filterMatchedRootContainers(containers) {
        const matchedContainers = {};
        const matchedRootIds = new Set();

        const parentMap = {};
        Object.entries(containers).forEach(([id, c]) => {
          (c.children || []).forEach(childId => {
            parentMap[childId] = id;
          });
        });

        const allRootIds = Object.keys(containers).filter(id => !parentMap[id]);
        console.log('根容器:', allRootIds);

        for (const rootId of allRootIds) {
          const rootContainer = containers[rootId];
          const exists = checkContainerExists(rootContainer.selector);
          if (exists) {
            matchedContainers[rootId] = rootContainer;
            matchedRootIds.add(rootId);
            addSubtreeToMatched(rootId, containers, matchedContainers);
          }
        }

        return {
          matchedContainers,
          matchedRoots: Array.from(matchedRootIds)
        };
      }

      function addSubtreeToMatched(containerId, allContainers, matchedContainers) {
        const container = allContainers[containerId];
        if (!container || !container.children) return;

        container.children.forEach(childId => {
          if (allContainers[childId]) {
            matchedContainers[childId] = allContainers[childId];
            addSubtreeToMatched(childId, allContainers, matchedContainers);
          }
        });
      }
    `;

    await page.addScriptTag({ content: simplifiedLogic });

    const result = await page.evaluate((containers) => {
      const result = filterMatchedRootContainers(containers);
      return {
        matchedRootCount: result.matchedRoots.length,
        matchedRoots: result.matchedRoots,
        totalContainers: Object.keys(result.matchedContainers).length,
        matchedContainerIds: Object.keys(result.matchedContainers)
      };
    }, containers);

    console.log('=== 测试结果 ===\n');
    console.log(`总根容器数: ${Object.keys(containers).filter(id => {
      const parentMap = {};
      Object.entries(containers).forEach(([cid, c]) => {
        (c.children || []).forEach(childId => {
          parentMap[childId] = cid;
        });
      });
      return !parentMap[id];
    }).length}`);
    console.log(`匹配根容器数: ${result.matchedRootCount}`);
    console.log(`匹配根容器: ${result.matchedRoots.join(', ') || '无'}\n`);
    console.log(`总匹配容器数: ${result.totalContainers}`);
    console.log(`匹配容器: ${result.matchedContainerIds.join(', ')}\n`);

    const homeMatched = result.matchedRoots.includes('home');
    console.log(`${homeMatched ? '✅' : '❌'} home 根容器: ${homeMatched ? '匹配' : '未匹配'}\n`);

    await page.screenshot({ path: './test-results/simplified-match-test.png', fullPage: true });
    console.log('✓ 截图已保存\n');

    return homeMatched;

  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    return false;
  } finally {
    await browser.close();
  }
}

testSimplifiedMatch()
  .then(success => {
    console.log(`=== 测试完成 ===`);
    console.log(`状态: ${success ? '✅ 成功' : '❌ 失败'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试运行失败:', error);
    process.exit(1);
  });
