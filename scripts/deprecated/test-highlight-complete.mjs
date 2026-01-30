#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 完整高亮回环测试
 * 测试：
 * 1. selector 高亮
 * 2. dom_path 高亮  
 * 3. 容器匹配
 * 4. 容器高亮（容器selector）
 */

const UNIFIED_API = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7701';
const PROFILE = process.env.TEST_PROFILE || 'weibo_fresh';

const log = (msg) => console.log(`[highlight-complete] ${msg}`);

async function testHighlightSelector(selector = '#app', desc = '根元素') {
  const url = `${UNIFIED_API}/v1/browser/highlight`;
  const payload = {
    profile: PROFILE,
    selector,
    options: {
      style: '3px solid red',
      duration: 1500,
      sticky: false
    }
  };
  
  log(`测试 selector 高亮 (${desc}): ${selector}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const result = await resp.json();
  const ok = result.success === true && result.data?.details?.count > 0;
  log(`selector 高亮 (${desc}) ${ok ? '✅' : '❌'} count=${result.data?.details?.count || 0}`);
  return ok;
}

async function testHighlightDomPath(path = 'root/0', desc = '第一个子元素') {
  const url = `${UNIFIED_API}/v1/browser/highlight-dom-path`;
  const payload = {
    profile: PROFILE,
    path,
    options: {
      style: '3px solid blue',
      duration: 1500,
      sticky: false
    }
  };
  
  log(`测试 dom_path 高亮 (${desc}): ${path}`);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const result = await resp.json();
  const ok = result.success === true && result.data?.details?.count > 0;
  log(`dom_path 高亮 (${desc}) ${ok ? '✅' : '❌'} count=${result.data?.details?.count || 0}`);
  return ok;
}

async function testContainersMatch() {
  const url = `${UNIFIED_API}/v1/controller/action`;
  const payload = {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: 'https://weibo.com'
    }
  };
  
  log('测试容器匹配...');
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  
  const result = await resp.json();
  const matched = result.success && result.data?.matched;
  const containerName = result.data?.container?.name || 'unknown';
  log(`容器匹配 ${matched ? '���' : '❌'} container=${containerName}`);
  return { ok: matched, container: result.data?.container };
}

async function main() {
  try {
    log('开始高亮完整回环测试...');
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const results = [];
    
    // 1. selector 高亮
    results.push(await testHighlightSelector('#app', '根元素'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 2. dom_path 高亮
    results.push(await testHighlightDomPath('root/0', '第一个子元素'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. 容器匹配
    const matchResult = await testContainersMatch();
    results.push(matchResult.ok);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 4. 容器selector高亮
    if (matchResult.ok && matchResult.container?.matched_selector) {
      const containerSelector = matchResult.container.matched_selector;
      results.push(await testHighlightSelector(containerSelector, '容器匹配选择器'));
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    const allOk = results.every(r => r === true);
    log('='.repeat(50));
    log(`测试结果: ${results.filter(r => r).length}/${results.length} 通过`);
    log(allOk ? '✅ 高亮完整回���测试通过' : '❌ 高亮完整回环测试失败');
    process.exit(allOk ? 0 : 1);
  } catch (err) {
    log(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

main();
