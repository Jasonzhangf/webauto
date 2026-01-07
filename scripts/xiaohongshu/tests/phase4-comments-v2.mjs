#!/usr/bin/env node
/**
 * Phase 4: 评论展开验证（容器驱动版 v2 - 使用简化的锚点验证）
 * 目标：验证评论区 + 展开更多 + 评论项
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function verifyAnchor(selector, name) {
  console.log(`\n🔍 验证锚点: ${name} (${selector})`);
  
  const script = `
    (() => {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return { found: false, error: 'Element not found' };
      
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.style.outline = '3px solid #ff4444';
      setTimeout(() => { el.style.outline = ''; }, 2000);
      
      const rect = el.getBoundingClientRect();
      return { 
        found: true, 
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()
  `;

  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'browser:execute',
      payload: { profile: PROFILE, script }
    })
  });

  const data = await response.json();
  const result = data.data?.result || data.result;

  if (!result || !result.found) {
    console.log(`   ❌ 未找到: ${result?.error || '未知错误'}`);
    return null;
  }

  console.log(`   ✅ 找到元素`);
  console.log(`      Rect: x=${result.rect.x.toFixed(1)}, y=${result.rect.y.toFixed(1)}, w=${result.rect.width.toFixed(1)}, h=${result.rect.height.toFixed(1)}`);
  return result.rect;
}

async function main() {
  console.log('💬 Phase 4: 评论展开验证（简化版）\n');

  try {
    // 1. 验证评论区
    console.log('1️⃣ 验证评论区...');
    const commentsRect = await verifyAnchor('.comments-container, .comment-list', '评论列表容器');
    if (!commentsRect) {
      console.error('❌ 评论区未找到，请确认是否已打开详情页');
      process.exit(1);
    }

    // 2. 验证评论项
    console.log('\n2️⃣ 验证初始评论项...');
    const itemRect = await verifyAnchor('.comment-item', '第一条评论');
    if (!itemRect) {
      console.log('   ⚠️ 未找到评论项（可能是空评论或未加载）');
    }

    // 3. 尝试展开更多（如果有）
    console.log('\n3️⃣ 检查展开按钮...');
    const showMoreScript = `
      (() => {
        const btn = document.querySelector('.show-more, .reply-expand, [class*="expand"]');
        if (!btn) return { found: false };
        
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.style.outline = '3px solid #fbbc05';
        setTimeout(() => { btn.style.outline = ''; }, 1000);
        
        btn.click();
        return { found: true };
      })()
    `;

    const showMoreResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: showMoreScript }
      })
    });
    
    const showMoreData = await showMoreResponse.json();
    const showMoreResult = showMoreData.data?.result || showMoreData.result;
    
    if (showMoreResult?.found) {
      console.log('   ✅ 点击了展开按钮，等待加载...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('   ℹ️ 未找到展开按钮（可能已全部加载或无评论）');
    }

    // 4. 关闭详情页
    console.log('\n4️⃣ 关闭详情页...');
    const closeScript = `
      (() => {
        const mask = document.querySelector('.note-detail-mask');
        const closeBtn = document.querySelector('.close, .close-circle, [class*="close"]');
        
        if (closeBtn) {
          closeBtn.click();
          return { method: 'close_btn' };
        } else if (mask) {
          mask.click();
          return { method: 'mask_click' };
        } else {
          history.back();
          return { method: 'history_back' };
        }
      })()
    `;
    
    const closeResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: closeScript }
      })
    });

    const closeData = await closeResponse.json();
    const closeResult = closeData.data?.result || closeData.result;
    console.log(`   ✅ 关闭操作执行: ${closeResult?.method || 'unknown'}`);

    console.log('\n✅ Phase 4 完成');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
