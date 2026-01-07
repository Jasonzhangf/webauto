#!/usr/bin/env node

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function testContainersMatch() {
  console.log('[Test] Testing containers:match...\n');
  
  try {
    console.log('[Step 1] Sending containers:match request...');
    const controller = AbortSignal.timeout(10000); // 10s timeout
    
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profile: PROFILE,
          maxDepth: 3,
          maxChildren: 10
        }
      }),
      signal: controller
    });
    
    console.log(`[Step 2] Response status: ${response.status}`);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`[Error] HTTP ${response.status}: ${text}`);
      console.log('[Next] containers:match 失败，读取浏览器状态以便诊断...\n');
      await printBrowserStatus();
      return;
    }
    
    const data = await response.json();
    console.log('[Step 3] Response received');
    console.log(JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error(`[Error] ${error.message}`);
    if (error.name === 'TimeoutError') {
      console.error('[Error] Request timed out after 10s');
    }
    console.log('[Next] containers:match 调用异常，读取浏览器状态以便诊断...\n');
    await printBrowserStatus();
  }
}

async function printBrowserStatus() {
  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: 'location.href' }
      }),
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json().catch(() => ({}));
    const url = data?.data?.result || data?.result || '';
    console.log(`[Browser] current URL: ${url || '未知'}`);
  } catch (err) {
    console.error('[Browser] 无法获取浏览器状态:', err.message);
  }
}

testContainersMatch();
