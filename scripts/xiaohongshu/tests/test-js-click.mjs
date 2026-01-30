#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 测试使用JS click()点击.show-more按钮
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

async function clickShowMore() {
    console.log('📍 使用JS click()点击.show-more按钮...\n');

    const result = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      if (!root) return { clicked: 0, error: 'no root' };
      
      const showMoreButtons = Array.from(root.querySelectorAll('.show-more'));
      let clicked = 0;
      const maxClicks = 5;  // 最多点5个
      
      for (const btn of showMoreButtons) {
        if (clicked >= maxClicks) break;
        
        // 检查是否已点击过
        if (btn.dataset && btn.dataset.webautoClicked === '1') continue;
        
        // 标记
        btn.dataset = btn.dataset || {};
        btn.dataset.webautoClicked = '1';
        btn.style.outline = '3px solid orange';
        
        // 直接调用click()
        try {
          btn.click();
          clicked++;
          console.log('Clicked:', btn.textContent.trim());
        } catch (e) {
          console.error('Click error:', e);
        }
      }
      
      return {
        clicked,
        total: showMoreButtons.length,
        commentItems: root.querySelectorAll('.comment-item').length,
      };
    })()`,
    });

    const data = result.data?.result || result.result;
    console.log('结果:', data);

    // 等待展开
    console.log('\n⏳ 等待2秒让展开完成...');
    await new Promise(r => setTimeout(r, 2000));

    // 再次检查
    const after = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root = document.querySelector('.comments-el');
      return {
        showMoreCount: root ? root.querySelectorAll('.show-more').length : 0,
        commentCount: root ? root.querySelectorAll('.comment-item').length : 0,
      };
    })()`,
    });

    const afterData = after.data?.result || after.result;
    console.log('\n点击后状态:');
    console.log(`  .show-more: ${data.total} → ${afterData.showMoreCount}`);
    console.log(`  .comment-item: ${data.commentItems} → ${afterData.commentCount}`);

    if (afterData.showMoreCount < data.total || afterData.commentCount > data.commentItems) {
        console.log('\n✅ 点击成功！');
    } else {
        console.log('\n❌ 点击似乎没有效果');
    }
}

clickShowMore().catch(console.error);
