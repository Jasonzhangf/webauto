#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 详细调试手动点击.show-more按钮
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
    console.log('🔍 详细调试手动点击.show-more按钮\n');

    // 1. 滚动到顶部
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

    // 2. 获取第一个.show-more按钮的详细信息
    const btnInfo = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      if (!root) return { error: 'no root' };
      
      const showMoreButtons = Array.from(root.querySelectorAll('.show-more'));
      if (showMoreButtons.length === 0) return { error: 'no buttons' };
      
      const firstBtn = showMoreButtons[0];
      const rect = firstBtn.getBoundingClientRect();
      
      // 检查父元素
      const parent = firstBtn.parentElement;
      const parentRect = parent ? parent.getBoundingClientRect() : null;
      
      return {
        total: showMoreButtons.length,
        firstButton: {
          text: firstBtn.textContent.trim(),
          className: firstBtn.className,
          tag: firstBtn.tagName,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
          hasOnClick: firstBtn.onclick !== null,
          parentTag: parent ? parent.tagName : null,
          parentClassName: parent ? parent.className : null,
          parentRect: parentRect ? {
            x: parentRect.x,
            y: parentRect.y,
            width: parentRect.width,
            height: parentRect.height,
          } : null,
        },
      };
    })()`,
    });

    const info = btnInfo.data?.result || btnInfo.result;
    console.log('\n📊 第一个.show-more按钮信息:');
    console.log(JSON.stringify(info, null, 2));

    if (info.error) {
        console.log('\n❌', info.error);
        return;
    }

    const btn = info.firstButton;
    console.log(`\n目标坐标: (${btn.centerX}, ${btn.centerY})`);
    console.log(`在视口内: ${btn.inViewport ? '✅' : '❌'}`);

    // 3. 执行点击序列
    console.log('\n🖱️  执行点击序列...');

    // 移动鼠标
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'move',
        target: { coordinates: { x: btn.centerX, y: btn.centerY } },
    });
    console.log('  ✅ 移动鼠标');
    await new Promise(r => setTimeout(r, 200));

    // 鼠标按下
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'down',
        target: { coordinates: { x: btn.centerX, y: btn.centerY } },
    });
    console.log('  ✅ 鼠标按下');
    await new Promise(r => setTimeout(r, 100));

    // 鼠标抬起
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'up',
        target: { coordinates: { x: btn.centerX, y: btn.centerY } },
    });
    console.log('  ✅ 鼠标抬起');

    // 4. 等待并检查结果
    console.log('\n⏳ 等待2秒检查结果...');
    await new Promise(r => setTimeout(r, 2000));

    const afterClick = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      if (!root) return { error: 'no root' };
      
      return {
        showMoreCount: root.querySelectorAll('.show-more').length,
        commentCount: root.querySelectorAll('.comment-item').length,
      };
    })()`,
    });

    const after = afterClick.data?.result || afterClick.result;
    console.log('\n📊 点击后状态:');
    console.log(`  .show-more 数量: ${info.total} → ${after.showMoreCount}`);
    console.log(`  .comment-item 数量: ${after.commentCount}`);

    if (after.showMoreCount < info.total) {
        console.log('\n✅ 点击成功！按钮减少了');
    } else {
        console.log('\n❌ 点击无效，按钮数量没变');
        console.log('\n可能的原因:');
        console.log('  1. 坐标被其他元素遮挡');
        console.log('  2. 需要使用JS click而不是模拟鼠标');
        console.log('  3. 事件被拦截或preventDefault');
    }
}

test().catch(console.error);
