#!/usr/bin/env node

/**
 * 深度验证高亮渲染结果
 * - 不仅检查 API 返回，还深入浏览器 DOM 检查 overlay 元素
 * - 验证 overlay 是否真实存在
 * - 验证 overlay 的坐标是否与目标元素重合
 * - 验证 overlay 的颜色是否正确
 */

import fs from 'node:fs';

const API_BASE = 'http://127.0.0.1:7701';

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function getActiveProfile() {
  const res = await fetch(`${API_BASE}/v1/session/list`);
  const json = await res.json();
  return json?.data?.sessions?.[0]?.profileId || json?.sessions?.[0]?.profileId;
}

async function runVerification() {
  console.log('=== 开始高亮渲染深度验证 ===');
  
  const profile = await getActiveProfile();
  if (!profile) {
    console.error('❌ 未找到活跃会话');
    process.exit(1);
  }
  console.log(`✅ 活跃会话: ${profile}`);

  // 1. 清除现有高亮
  await postJson(`${API_BASE}/v1/browser/clear-highlight`, { profile, channel: null });

  // 2. 验证 DOM 路径高亮
  console.log('\n--- 验证 DOM Path 高亮 ---');
  
  // 注入脚本：选取一个可见元素，返回其路径和 Rect
  const targetInfo = await postJson(`${API_BASE}/v1/browser/execute`, {
    profile,
    script: `(() => {
      const runtime = window.__webautoRuntime;
      // 选取页面中心元素
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      if (!el) return { error: 'No element at center' };
      
      const path = runtime.dom.buildPathForElement(el, null);
      const rect = el.getBoundingClientRect();
      
      return { 
        path, 
        tagName: el.tagName,
        className: el.className,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      };
    })()`
  });

  const target = targetInfo.data?.result;
  if (!target || target.error) {
    console.error('❌ 无法获取测试目标元素:', target?.error);
    process.exit(1);
  }
  
  console.log(`🎯 目标元素: <${target.tagName} class="${target.className}">`);
  console.log(`📍 目标坐标: x=${target.rect.x}, y=${target.rect.y}, w=${target.rect.width}, h=${target.rect.height}`);
  console.log(`🔗 DOM 路径: ${target.path}`);

  // 执行高亮
  const highlightRes = await postJson(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile,
    path: target.path,
    options: { channel: 'test-verify', sticky: true },
    color: 'blue' 
  });

  console.log(`📡 API 响应: success=${highlightRes.success}, count=${highlightRes.data?.details?.count}`);

  // 验证 Overlay
  const overlayCheck = await postJson(`${API_BASE}/v1/browser/execute`, {
    profile,
    script: `(() => {
      const overlays = Array.from(document.querySelectorAll('.__webauto_highlight_box'));
      // 找到我们要验证的那个 overlay (可能有多个，找跟目标位置重合的)
      const targetRect = ${JSON.stringify(target.rect)};
      
      const match = overlays.find(el => {
        const r = el.getBoundingClientRect();
        // 允许 2px 误差
        return Math.abs(r.x - targetRect.x) <= 2 &&
               Math.abs(r.y - targetRect.y) <= 2 &&
               Math.abs(r.width - targetRect.width) <= 2 &&
               Math.abs(r.height - targetRect.height) <= 2;
      });

      if (!match) return { found: false, totalOverlays: overlays.length };

      return {
        found: true,
        style: {
          border: match.style.border,
          borderColor: match.style.borderColor
        },
        rect: match.getBoundingClientRect()
      };
    })()`
  });

  const checkResult = overlayCheck.data?.result;
  
  if (checkResult?.found) {
    console.log(`✅ 验证成功: 找到匹配的 Overlay 元素`);
    console.log(`   Overlay 坐标: x=${checkResult.rect.x}, y=${checkResult.rect.y}, w=${checkResult.rect.width}, h=${checkResult.rect.height}`);
    console.log(`   Overlay 样式: ${JSON.stringify(checkResult.style)}`);
    
    // 检查颜色 (blue)
    const border = checkResult.style.border || '';
    if (border.includes('blue') || border.includes('33, 150, 243')) { // rgba(33, 150, 243, 0.95) is our blue
       console.log(`✅ 颜色验证通过: 检测到蓝色边框`);
    } else {
       console.warn(`⚠️ 颜色验证警告: 期望蓝色，实际为 "${border}"`);
    }

  } else {
    console.error(`❌ 验证失败: 未找到位置匹配的 Overlay`);
    console.log(`   页面上总共有 ${checkResult?.totalOverlays} 个 Overlay`);
  }

  // 3. 验证 Selector 高亮
  console.log('\n--- 验证 Selector 高亮 ---');
  const selector = target.tagName.toLowerCase() + (target.className ? '.' + target.className.split(' ')[0] : '');
  console.log(`🔍 测试选择器: ${selector}`);
  
  await postJson(`${API_BASE}/v1/browser/highlight`, {
    profile,
    selector,
    options: { channel: 'test-verify-sel', sticky: true },
    color: 'green'
  });
  
  // 再次检查
  const selCheck = await postJson(`${API_BASE}/v1/browser/execute`, {
    profile,
    script: `(() => {
      const overlays = document.querySelectorAll('.__webauto_highlight_box');
      // 只要有一个 overlay 是绿色的就算成功
      const greenOverlay = Array.from(overlays).find(el => 
        (el.style.border && (el.style.border.includes('green') || el.style.border.includes('76, 175, 80')))
      );
      return { found: !!greenOverlay, count: overlays.length };
    })()`
  });
  
  if (selCheck.data?.result?.found) {
    console.log(`✅ 验证成功: 找到绿色高亮框`);
  } else {
    console.error(`❌ 验证失败: 未找到绿色高亮框`);
  }
}

runVerification().catch(console.error);
