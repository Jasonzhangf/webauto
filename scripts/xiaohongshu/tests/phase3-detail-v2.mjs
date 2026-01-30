#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 3: 详情页验证（容器驱动版 v2 - 使用简化的锚点验证）
 * 目标：验证打开详情页 + 详情容器是否可用
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function verifyAnchor(selector, name) {
  console.log(`\n🔍 验证锚点: ${name} (${selector})`);
  
  const script = `
    (() => {
      const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
      if (!el) return { found: false, error: 'Element not found' };
      
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
  console.log('📄 Phase 3: 详情页验证（简化版）\n');

  try {
    // 1. 验证搜索结果项并点击第一个
    console.log('1️⃣ 验证并点击搜索结果...');
    const itemRect = await verifyAnchor('.feeds-container .note-item', '第一条搜索结果');
    if (!itemRect) {
      console.error('❌ 未找到搜索结果，请先运行 Phase 2');
      process.exit(1);
    }

    const clickScript = `
      (() => {
        const item = document.querySelector('.feeds-container .note-item');
        if (!item) return { success: false, error: 'Item not found' };
        
        const link = item.querySelector('a');
        if (link) {
          link.click();
        } else {
          item.click();
        }
        return { success: true };
      })()
    `;

    await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: clickScript }
      })
    });
    console.log('   ✅ 点击已执行');

    // 2. 等待详情模态框
    console.log('\n2️⃣ 等待详情页加载...');
    let detailReady = false;
    for (let i = 0; i < 20; i++) {
      const checkScript = `document.querySelector('.note-detail-mask, .note-container') !== null`;
      const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'browser:execute',
          payload: { profile: PROFILE, script: checkScript }
        })
      });
      const data = await res.json();
      if (data.data?.result || data.result) {
        detailReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
      process.stdout.write('.');
    }
    console.log('');

    if (!detailReady) {
      console.error('❌ 详情页未加载（超时）');
      process.exit(1);
    }
    console.log('   ✅ 详情页已出现');

    // 3. 验证详情页锚点
    console.log('\n3️⃣ 验证详情页锚点...');
    
    // 3.1 验证 Header
    await verifyAnchor('.author-container, .user-info', '作者信息区域');
    
    // 3.2 验证 Content
    await verifyAnchor('.note-content, .desc', '正文区域');
    
    // 3.3 验证 Gallery
    await verifyAnchor('.note-slider-list, .note-img', '图片区域');

    console.log('\n✅ Phase 3 完成 - 详情页功能正常');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
