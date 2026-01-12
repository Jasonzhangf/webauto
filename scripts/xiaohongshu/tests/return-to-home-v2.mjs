#!/usr/bin/env node
/**
 * 通用回主页脚本 v2（基于容器）
 * 
 * 功能：
 * 1. 验证"发现"按钮容器存在
 * 2. 使用 container:operation click 点击
 * 3. 等待 xiaohongshu_home 容器出现
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function controllerAction(action, payload) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await res.json();
  return data.data || data;
}

async function detectPageState() {
  const url = await controllerAction('browser:execute', {
    profile: PROFILE,
    script: 'window.location.href'
  });
  
  const { rootId, matchIds } = await (async () => {
    const data = await controllerAction('containers:match', { profile: PROFILE });
    const rootId = data.container?.id || null;
    const matches = data.snapshot?.matches || {};
    const matchIds = Object.entries(matches)
      .filter(([, info]) => (info?.match_count ?? 0) > 0)
      .map(([id]) => id);
    return { rootId, matchIds };
  })();
  
  return { url: url.result, rootId, matchIds };
}

async function main() {
  console.log('🏠 返回小红书主页 v2（基于容器）\n');
  
  try {
    // 1. 检查当前状态
    console.log('1️⃣ 检查当前状态...');
    const beforeState = await detectPageState();
    console.log(`   URL: ${beforeState.url}`);
    console.log(`   根容器: ${beforeState.rootId || '未匹配'}`);
    
    if (beforeState.rootId === 'xiaohongshu_home') {
      console.log('   ✅ 已经在主页，无需返回');
      return;
    }
    
    // 2. 验证"发现"按钮容器
    console.log('\n2️⃣ 验证"发现"按钮容器...');
    const hasDiscoverButton = beforeState.matchIds.includes('xiaohongshu_home.discover_button');
    
    if (!hasDiscoverButton) {
      console.error('   ❌ 未匹配到"发现"按钮容器，无法安全返回主页');
      console.error('   建议：手动点击"发现"按钮或刷新页面');
      process.exit(1);
    }
    console.log('   ✅ "发现"按钮容器已找到');
    
    // 3. 使用容器 click 操作
    console.log('\n3️⃣ 使用容器操作点击"发现"按钮...');
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_home.discover_button',
      operationId: 'click',
      sessionId: PROFILE,
      config: {}
    });
    console.log('   ✅ 点击已执行');
    
    // 4. 等待主页加载
    console.log('\n4️⃣ 等待主页加载...');
    let homeReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const state = await detectPageState();
      
      if (state.rootId === 'xiaohongshu_home') {
        homeReady = true;
        console.log(`   ✅ 主页已加载（${i * 500}ms）`);
        break;
      }
      process.stdout.write('.');
    }
    console.log('');
    
    if (!homeReady) {
      console.error('   ❌ 主页加载超时（10秒）');
      process.exit(1);
    }
    
    // 5. 最终验证
    console.log('\n5️⃣ 最终验证...');
    const afterState = await detectPageState();
    console.log(`   URL: ${afterState.url}`);
    console.log(`   根容器: ${afterState.rootId}`);
    
    if (afterState.rootId === 'xiaohongshu_home') {
      console.log('\n✅ 成功回到主页');
    } else {
      console.error(`\n⚠️  根容器不是 xiaohongshu_home: ${afterState.rootId}`);
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
