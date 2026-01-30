#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();


/**
 * 系统鼠标点击测试脚本（简化版）
 *
 * 前置条件：
 * - Unified API 已启动（7701）
 * - Browser Service 已启动（7704）
 * - 浏览器会话已存在（xiaohongshu_fresh）
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function controllerAction(action, payload = {}) {
  const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });
  const data = await response.json();
  return data.data || data;
}

async function testSystemMouseClick() {
  console.log('🖱️  系统鼠标点击测试');
  console.log('='.repeat(40));
  console.log('');

  const targetContainerId = 'xiaohongshu_home.logo';
  console.log(`目标容器: ${targetContainerId}`);
  console.log('');

  try {
    // 1. 获取容器坐标（简化版）
    console.log('1️⃣  获取容器坐标（简化版）...');
    const rectResult = await controllerAction('browser:execute', {
      profile: PROFILE,
      script: `(() => {
        // 尝试多个可能的元素
        const selectors = ['a[href="/"]', '#search-input', 'input', 'button', '.channel'];
        let el = null;
        for (const s of selectors) {
          el = document.querySelector(s);
          if (el) {
            break;
          }
        }
        
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x1: rect.left,
          y1: rect.top,
          x2: rect.right,
          y2: rect.bottom,
          width: rect.width,
          height: rect.height,
          selector: el.tagName
        };
      })()`
    });

    console.log('rectResult:', JSON.stringify(rectResult, null, 2));

    // 处理 browser:execute 可能的多层嵌套返回
    let bbox = rectResult;
    if (bbox && bbox.data) bbox = bbox.data;
    if (bbox && bbox.result) bbox = bbox.result;
    
    console.log('parsed bbox:', JSON.stringify(bbox, null, 2));

    if (!bbox) {
      throw new Error('无法获取元素坐标');
    }
    
    console.log('找到元素:', bbox.selector);

    const x1 = Number(bbox.x1 || bbox.left || bbox.x);
    const y1 = Number(bbox.y1 || bbox.top || bbox.y);
    const w = Number(bbox.width);
    const h = Number(bbox.height);
    
    const centerX = Math.round(x1 + w / 2);
    const centerY = Math.round(y1 + h / 2);
    
    let clickX = centerX;
    let clickY = centerY;

    if (isNaN(clickX) || isNaN(clickY)) {
      console.log('⚠️ 坐标计算失败，尝试使用默认坐标 (100, 100) 进行连通性测试');
      clickX = 100;
      clickY = 100;
    }
    
    console.log('点击坐标:', `(${clickX}, ${clickY})`);

    // 2. 高亮容器
    await controllerAction('container:operation', {
      containerId: targetContainerId,
      operationId: 'highlight',
      profile: PROFILE,
      config: { duration: 3000 }
    });

    console.log('⏸️  请确认高亮容器（3秒后执行系统点击）...');
    await new Promise(r => setTimeout(r, 3000));

    // 3. 执行系统鼠标点击
    console.log('3️⃣  执行系统鼠标点击...');
    const clickResult = await controllerAction('container:operation', {
      containerId: targetContainerId,
      operationId: 'click',
      profile: PROFILE,
      config: {
        useSystemMouse: true,
        x: clickX,
        y: clickY
      }
    });

    console.log('点击结果:', JSON.stringify(clickResult, null, 2));

    if (!clickResult.success) {
      throw new Error(clickResult.error || '点击失败');
    }

    console.log('✅ 系统鼠标点击测试成功');
  } catch (err) {
    console.error('❌ 测试失败:', err.message);
    process.exit(1);
  }
}

testSystemMouseClick();
