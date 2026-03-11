#!/usr/bin/env node
/**
 * 独立测试 ensure_tab_pool 功能
 * 目标：找出为什么 ensure_tab_pool 超时
 */

const http = require('http');

const profileId = 'xhs-qa-1';
const browserServicePort = 7704;

function callAPI(action, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ action, ...payload });
    const options = {
      hostname: '127.0.0.1',
      port: browserServicePort,
      path: '/api',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testPageList() {
  console.log('\n=== 测试 page:list ===');
  const start = Date.now();
  const result = await callAPI('page:list', { profileId });
  console.log(`耗时: ${Date.now() - start}ms`);
  return result;
}

async function testNewPage() {
  console.log('\n=== 测试 newPage ===');
  const start = Date.now();
  const result = await callAPI('newPage', { profileId });
  console.log(`耗时: ${Date.now() - start}ms`);
  return result;
}

async function testEnsureTabPool() {
  console.log('========================================');
  console.log('ensure_tab_pool 独立测试');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`profileId: ${profileId}`);
  console.log('========================================');

  // 1. 获取初始页面列表
  console.log('\n1. 获取初始页面列表...');
  const listBefore = await testPageList();
  const beforePages = listBefore?.result?.pages || listBefore?.pages || [];
  const beforeCount = beforePages.length;
  console.log(`当前页面数量: ${beforeCount}`);
  beforePages.forEach((p, i) => {
    console.log(`  [${i}] index=${p.index}, url=${(p.url || '').substring(0, 50)}...`);
  });

  // 2. 打开 3 个新标签页
  console.log('\n2. 打开 3 个新标签页...');
  for (let i = 0; i < 3; i++) {
    console.log(`\n--- 打开第 ${i + 1} 个标签页 ---`);
    const openStart = Date.now();
    const openResult = await testNewPage();
    console.log(`newPage 结果: ${JSON.stringify(openResult).substring(0, 100)}...`);
    
    // 等待页面出现
    console.log('\n轮询检查页面数量...');
    const waitStart = Date.now();
    const maxWaitMs = 10000;
    const pollMs = 500;
    let detected = false;

    while (Date.now() - waitStart < maxWaitMs) {
      const listResult = await callAPI('page:list', { profileId });
      const currentPages = listResult?.result?.pages || listResult?.pages || [];
      const afterCount = currentPages.length;
      const elapsed = Math.floor((Date.now() - waitStart) / 1000);
      console.log(`  [${elapsed}s] 页面数量: ${afterCount}`);

      if (afterCount > beforeCount + i) {
        console.log(`\n成功! 检测到新页面`);
        detected = true;
        break;
      }

      await sleep(pollMs);
    }

    if (!detected) {
      console.log('\n超时! 10秒内未检测到新页面');
    }
  }

  // 3. 最终状态
  console.log('\n3. 最终页面列表...');
  const listAfter = await testPageList();
  const afterPages = listAfter?.result?.pages || listAfter?.pages || [];
  console.log(`最终页面数量: ${afterPages.length}`);
  afterPages.forEach((p, i) => {
    console.log(`  [${i}] index=${p.index}, url=${(p.url || '').substring(0, 50)}...`);
  });
}

// 运行测试
testEnsureTabPool()
  .then(() => {
    console.log('\n========================================');
    console.log('测试完成');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n测试失败:', err);
    process.exit(1);
  });
