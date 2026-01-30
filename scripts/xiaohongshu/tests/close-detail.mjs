#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 关闭详情页脚本
 * 
 * 策略：
 * 1. 优先：按 ESC（如果有模态框）
 * 2. 降级：点击"发现"按钮回主页
 * 3. 最后：直接导航到主页
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
  console.log('❌ 关闭详情页\n');
  
  try {
    // 1. 检查当前状态
    console.log('1️⃣ 检查当前状态...');
    const beforeState = await detectPageState();
    console.log(`   URL: ${beforeState.url}`);
    console.log(`   根容器: ${beforeState.rootId}`);
    
    const hasModal = beforeState.matchIds.includes('xiaohongshu_detail.modal_shell');
    console.log(`   有模态框: ${hasModal}`);
    
    // 2. 尝试关闭
    console.log('\n2️⃣ 尝试关闭详情页...');
    
    const closeResult = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `
        (() => {
          // 方案1：按 ESC（如果有模态框）
          const modal = document.querySelector('.note-detail-mask, .note-container');
          if (modal) {
            document.dispatchEvent(new KeyboardEvent('keydown', { 
              key: 'Escape', 
              code: 'Escape', 
              keyCode: 27, 
              bubbles: true 
            }));
            return { success: true, method: 'esc' };
          }
          
          // 方案2：点击"发现"按钮
          const homeLink = document.querySelector('a[href="/explore?channel_id=homefeed_recommend"]');
          if (homeLink) {
            homeLink.click();
            return { success: true, method: 'click_discover' };
          }
          
          // 方案3：直接导航
          window.location.href = 'https://www.xiaohongshu.com';
          return { success: true, method: 'navigate' };
        })()
      `
    });
    
    console.log(`   ✅ 关闭方式: ${closeResult.result.method}`);
    
    // 3. 等待返回主页
    console.log('\n3️⃣ 等待返回主页...');
    let homeReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const state = await detectPageState();
      
      if (state.rootId === 'xiaohongshu_home' && !state.matchIds.includes('xiaohongshu_detail.modal_shell')) {
        homeReady = true;
        console.log(`   ✅ 已返回主页（${i * 500}ms）`);
        break;
      }
      process.stdout.write('.');
    }
    console.log('');
    
    if (!homeReady) {
      console.error('   ⚠️  未完全返回主页（可能仍在详情页）');
    }
    
    // 4. 最终验证
    console.log('\n4️⃣ 最终验证...');
    const afterState = await detectPageState();
    console.log(`   URL: ${afterState.url}`);
    console.log(`   根容器: ${afterState.rootId}`);
    console.log(`   详情容器: ${afterState.matchIds.includes('xiaohongshu_detail.modal_shell') ? '仍存在' : '已关闭'}`);
    
    if (afterState.rootId === 'xiaohongshu_home') {
      console.log('\n✅ 成功关闭详情页');
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
