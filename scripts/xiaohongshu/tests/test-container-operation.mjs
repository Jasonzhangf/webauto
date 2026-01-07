#!/usr/bin/env node
/**
 * 测试 container:operation find-child 是否触发自动点击
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
    console.log('🔍 测试 container:operation find-child 自动点击\n');

    // 1. 先滚动到顶部
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

    console.log('✅ 已滚动到顶部');
    await new Promise(r => setTimeout(r, 1000));

    // 2. 检查初始状态
    let beforeResult = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      return {
        showMoreCount: root ? root.querySelectorAll('.show-more').length : 0,
      };
    })()`,
    });
    console.log('\n📊 点击前状态:', beforeResult.data?.result || beforeResult.result);

    // 3. 调用 container:operation find-child
    console.log('\n📍 调用 container:operation find-child...');
    const opResult = await post('container:operation', {
        containerId: 'xiaohongshu_detail.comment_section',
        operationId: 'find-child',
        config: { container_id: 'xiaohongshu_detail.comment_section.show_more_button' },
        sessionId: PROFILE,
    });

    console.log('结果:');
    console.log(JSON.stringify(opResult, null, 2));

    // 4. 等待自动点击完成
    console.log('\n⏳ 等待3秒...');
    await new Promise(r => setTimeout(r, 3000));

    // 5. 检查点击后状态
    let afterResult = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      return {
        showMoreCount: root ? root.querySelectorAll('.show-more').length : 0,
      };
    })()`,
    });
    console.log('\n📊 点击后状态:', afterResult.data?.result || afterResult.result);

    const before = beforeResult.data?.result?.showMoreCount || beforeResult.result?.showMoreCount || 0;
    const after = afterResult.data?.result?.showMoreCount || afterResult.result?.showMoreCount || 0;

    if (after < before) {
        console.log(`\n✅ 自动点击成功! 按钮数量从 ${before} 减少到 ${after}`);
    } else {
        console.log(`\n❌ 自动点击未触发，按钮数量保持 ${before}`);
    }
}

test().catch(console.error);
