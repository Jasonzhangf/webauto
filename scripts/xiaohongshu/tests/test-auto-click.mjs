#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试容器自动点击机制
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(action, payload) {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return res.json();
}

async function test() {
    console.log('🔍 测试容器自动点击机制\n');

    // 1. 先滚动评论区到顶部，确保show-more按钮可见
    await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      if (!root) return;
      
      let scrollContainer = null;
      let current = root.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
          scrollContainer = current;
          break;
        }
        current = current.parentElement;
      }
      
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    })()`,
    });

    console.log('✅ 已滚动到顶部\n');
    await new Promise(r => setTimeout(r, 1000));

    // 2. 调用 containers:match 触发自动点击
    console.log('📍 调用 containers:match...');
    const matchResult = await post('containers:match', {
        profile: PROFILE,
    });

    console.log('结果:');
    console.log(JSON.stringify(matchResult, null, 2));

    // 3. 等待一段时间让自动点击完成
    console.log('\n⏳ 等待3秒让自动点击完成...');
    await new Promise(r => setTimeout(r, 3000));

    // 4. 检查是否有show-more按钮被点击（应该消失或减少）
    const checkResult = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      if (!root) return { error: 'no root' };
      
      const showMoreButtons = Array.from(root.querySelectorAll('.show-more'));
      return {
        total: showMoreButtons.length,
        buttons: showMoreButtons.map(btn => ({
          text: btn.textContent.trim(),
          visible: btn.offsetParent !== null,
        })),
      };
    })()`,
    });

    const checkData = checkResult.data?.result || checkResult.result;
    console.log('\n📊 当前 .show-more 按钮状态:');
    console.log(JSON.stringify(checkData, null, 2));
}

test().catch(console.error);
