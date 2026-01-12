#!/usr/bin/env node
/**
 * 通用回主页脚本
 * 
 * 功能：
 * 1. 导航到小红书主页
 * 2. 等待容器匹配成功（xiaohongshu_home）
 * 3. 验证主页状态正常
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const HOME_URL = 'https://www.xiaohongshu.com';

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
  
  const { rootId } = await (async () => {
    const data = await controllerAction('containers:match', { profile: PROFILE });
    const rootId = data.container?.id || null;
    return { rootId };
  })();
  
  return { url: url.result, rootId };
}

async function main() {
  console.log('🏠 返回小红书主页\n');
  
  try {
    // 1. 检查当前状态
    console.log('1️⃣ 检查当前状态...');
    const beforeState = await detectPageState();
    console.log(`   当前 URL: ${beforeState.url}`);
    console.log(`   当前根容器: ${beforeState.rootId || '未匹配'}`);
    
    if (beforeState.rootId === 'xiaohongshu_home') {
      console.log('   ✅ 已经在主页，无需导航');
      return;
    }
    
    // 2. 尝试点击"发现"按钮回主页（优先方案）
    console.log('\n2️⃣ 尝试点击"发现"按钮...');
    const clickHomeResult = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `
        (() => {
          const homeLink = document.querySelector('a[href="/explore?channel_id=homefeed_recommend"]');
          if (homeLink) {
            homeLink.click();
            return { success: true, method: 'click_discover' };
          }
          
          // 降级：直接导航
          window.location.href = '${HOME_URL}';
          return { success: true, method: 'navigate' };
        })()
      `
    });
    console.log(`   ✅ 回主页方式: ${clickHomeResult.result.method}`);
    
    // 3. 等待主页加载
    console.log('\n3️⃣ 等待主页加载...');
    let homeReady = false;
    for (let i = 0; i < 30; i++) {
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
      console.error('   ❌ 主页加载超时（15秒）');
      process.exit(1);
    }
    
    // 4. 最终验证
    console.log('\n4️⃣ 最终验证...');
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
