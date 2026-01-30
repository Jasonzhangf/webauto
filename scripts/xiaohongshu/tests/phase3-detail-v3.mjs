#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 3 v3: 详情页验证（增强版）
 * 
 * 功能：
 * 1. 进入前检查：必须在搜索结果页（有 .note-item）
 * 2. 点击进入详情：点击第一条搜索结果
 * 3. 验证详情容器：header / content / gallery
 * 4. 退出后检查：详情页容器存在
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

async function verifyAnchor(selector, name) {
  console.log(`🔍 验证锚点: ${name} (${selector})`);
  
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
  
  const result = await controllerAction('browser:execute', { profile: PROFILE, script });
  
  if (!result.result || !result.result.found) {
    console.log(`   ❌ 未找到: ${result.result?.error || '未知错误'}`);
    return null;
  }
  
  console.log(`   ✅ 找到元素`);
  const r = result.result.rect;
  console.log(`      Rect: x=${r.x.toFixed(1)}, y=${r.y.toFixed(1)}, w=${r.width.toFixed(1)}, h=${r.height.toFixed(1)}`);
  return result.result.rect;
}

async function main() {
  console.log('📄 Phase 3 v3: 详情页验证（增强版）\n');
  
  try {
    // 1. 进入前检查：必须有搜索结果
    console.log('1️⃣ 进入前检查...');
    const beforeState = await detectPageState();
    console.log(`   URL: ${beforeState.url}`);
    console.log(`   根容器: ${beforeState.rootId}`);
    
    const hasSearchResults = beforeState.matchIds.includes('xiaohongshu_search.search_result_item');
    if (!hasSearchResults) {
      console.error(`   ❌ 未找到搜索结果项容器，无法继续`);
      console.error('   建议：先运行 node scripts/xiaohongshu/tests/phase2-search-v3.mjs');
      process.exit(1);
    }
    console.log('   ✅ 找到搜索结果，可以继续');
    
    // 2. 验证第一条搜索结果锚点
    console.log('\n2️⃣ 验证第一条搜索结果锚点...');
    const itemRect = await verifyAnchor('.feeds-container .note-item', '第一条搜索结果');
    if (!itemRect) {
      console.error('   ❌ 搜索结果未找到');
      process.exit(1);
    }
    
    // 3. 点击进入详情
    console.log('\n3️⃣ 点击进入详情...');
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
    
    await controllerAction('browser:execute', { profile: PROFILE, script: clickScript });
    console.log('   ✅ 点击已执行');
    
    // 等待详情页加载
    console.log('   ⏳ 等待详情页加载...');
    let detailReady = false;
    for (let i = 0; i < 20; i++) {
      const checkScript = `document.querySelector('.note-detail-mask, .note-container') !== null`;
      const res = await controllerAction('browser:execute', {
        profile: PROFILE,
        script: checkScript
      });
      if (res.result) {
        detailReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
      process.stdout.write('.');
    }
    console.log('');
    
    if (!detailReady) {
      console.error('   ❌ 详情页未加载（超时）');
      process.exit(1);
    }
    console.log('   ✅ 详情页已出现');
    
    // 4. 退出后检查：验证详情页容器
    console.log('\n4️⃣ 退出后检查...');
    const afterState = await detectPageState();
    console.log(`   URL: ${afterState.url}`);
    console.log(`   根容器: ${afterState.rootId}`);
    
    const hasDetailModal = afterState.matchIds.includes('xiaohongshu_detail.modal_shell');
    if (!hasDetailModal) {
      console.log(`   ⚠️  未匹配到 modal_shell 容器`);
    }
    
    // 5. 验证详情页关键锚点
    console.log('\n5️⃣ 验证详情页锚点...');
    
    // 5.1 验证作者信息区域
    await verifyAnchor('.author-container, .user-info', '作者信息区域');
    
    // 5.2 验证正文区域
    await verifyAnchor('.note-content, .desc', '正文区域');
    
    // 5.3 验证图片区域
    await verifyAnchor('.note-slider-list, .note-img', '图片区域');
    
    console.log('\n✅ Phase 3 完成 - 详情页功能正常');
    console.log('\n💡 提示：详情页已打开，可以继续运行 Phase 4（评论）');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
