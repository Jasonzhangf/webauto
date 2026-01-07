#!/usr/bin/env node
/**
 * Phase 2: 小红书搜索验证（容器驱动版 v2 - 使用简化的锚点验证）
 * 目标：验证搜索输入 + 列表容器是否可用
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';
const KEYWORDS = ['手机膜', '雷军', '小米', '华为', '鸿蒙'];

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
  console.log('🔍 Phase 2: 搜索验证（简化版）\n');
  
  try {
    // 1. 选择关键字
    const keyword = KEYWORDS[Math.floor(Math.random() * KEYWORDS.length)];
    console.log(`1️⃣ 选择关键字: ${keyword}`);

    // 2. 验证搜索框锚点
    const searchBarRect = await verifyAnchor('#search-input, input[type="search"]', '搜索框');
    if (!searchBarRect) {
      console.error('❌ 搜索框未找到，无法继续');
      process.exit(1);
    }

    // 3. 执行搜索（直接DOM操作）
    console.log('\n2️⃣ 执行搜索...');
    const searchScript = `
      (() => {
        const input = document.querySelector('#search-input, input[type="search"]');
        if (!input) return { success: false, error: 'Input not found' };
        
        input.focus();
        input.value = '${keyword.replace(/'/g, "\\'")}';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        
        // 触发回车
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        
        return { success: true };
      })()
    `;

    const searchResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: searchScript }
      })
    });

    const searchData = await searchResponse.json();
    console.log('   ✅ 搜索已触发');

    // 等待结果加载
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. 验证搜索结果列表锚点
    const listRect = await verifyAnchor('.feeds-container', '搜索结果列表');
    if (!listRect) {
      console.error('❌ 搜索结果列表未找到');
      process.exit(1);
    }

    // 5. 验证搜索结果项锚点
    console.log('\n3️⃣ 验证搜索结果项...');
    const itemScript = `
      (() => {
        const items = Array.from(document.querySelectorAll('.feeds-container .note-item'));
        if (items.length === 0) return { found: false, error: 'No items found' };
        
        const rects = items.slice(0, 3).map((el, idx) => {
          el.style.outline = '2px solid #4285f4';
          setTimeout(() => { el.style.outline = ''; }, 1500);
          
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        
        return { found: true, count: items.length, rects };
      })()
    `;

    const itemResponse = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: itemScript }
      })
    });

    const itemData = await itemResponse.json();
    const itemResult = itemData.data?.result || itemData.result;

    if (!itemResult || !itemResult.found) {
      console.log(`   ❌ 未找到搜索结果项: ${itemResult?.error || '未知错误'}`);
      process.exit(1);
    }

    console.log(`   ✅ 找到 ${itemResult.count} 个搜索结果项`);
    console.log(`   📋 前3项位置:`);
    itemResult.rects.forEach((rect, idx) => {
      console.log(`      ${idx + 1}. x=${rect.x.toFixed(1)}, y=${rect.y.toFixed(1)}, w=${rect.width.toFixed(1)}, h=${rect.height.toFixed(1)}`);
    });

    console.log('\n✅ Phase 2 完成 - 搜索功能正常');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
