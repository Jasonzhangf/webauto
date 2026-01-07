#!/usr/bin/env node
/**
 * 测试 user_action + scroll 能否在评论区滚动容器上工作
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

async function getScrollInfo() {
    const result = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');
      if (!root) return null;

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

      if (!scrollContainer) return null;

      const rect = scrollContainer.getBoundingClientRect();
      return {
        scrollTop: scrollContainer.scrollTop,
        scrollHeight: scrollContainer.scrollHeight,
        clientHeight: scrollContainer.clientHeight,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        centerX: rect.x + rect.width / 2,
        centerY: rect.y + rect.height / 2,
      };
    })()`,
    });

    return result.data?.result || result.result;
}

async function test() {
    console.log('🔬 测试 user_action + scroll 在评论区滚动容器上的效果\n');

    // 1. 获取初始滚动信息
    const before = await getScrollInfo();
    if (!before) {
        console.error('❌ 找不到滚动容器');
        return;
    }

    console.log('📍 初始状态:');
    console.log(`   scrollTop: ${before.scrollTop}`);
    console.log(`   scrollHeight: ${before.scrollHeight}`);
    console.log(`   滚动容器中心: (${before.centerX}, ${before.centerY})`);
    console.log('');

    // 2. 先移动鼠标到滚动容器中心
    console.log('🖱️  步骤1: 移动鼠标到滚动容器中心...');
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'move',
        target: { coordinates: { x: before.centerX, y: before.centerY } },
    });
    await new Promise(r => setTimeout(r, 500));
    console.log('   ✅ 鼠标已移动\n');

    // 3. 发送第一次滚轮事件
    console.log('🎡 步骤2: 发送第一次滚轮事件 (deltaY=600)...');
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'scroll',
        target: { coordinates: { x: before.centerX, y: before.centerY }, deltaY: 600 },
    });
    await new Promise(r => setTimeout(r, 1000));

    const after1 = await getScrollInfo();
    console.log(`   scrollTop: ${before.scrollTop} → ${after1.scrollTop} (变化: ${after1.scrollTop - before.scrollTop})`);
    console.log('');

    // 4. 发送第二次滚轮事件
    console.log('🎡 步骤3: 发送第二次滚轮事件 (deltaY=600)...');
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'scroll',
        target: { coordinates: { x: before.centerX, y: before.centerY }, deltaY: 600 },
    });
    await new Promise(r => setTimeout(r, 1000));

    const after2 = await getScrollInfo();
    console.log(`   scrollTop: ${after1.scrollTop} → ${after2.scrollTop} (变化: ${after2.scrollTop - after1.scrollTop})`);
    console.log('');

    // 5. 发送第三次滚轮事件
    console.log('🎡 步骤4: 发送第三次滚轮事件 (deltaY=600)...');
    await post('user_action', {
        profile: PROFILE,
        operation_type: 'scroll',
        target: { coordinates: { x: before.centerX, y: before.centerY }, deltaY: 600 },
    });
    await new Promise(r => setTimeout(r, 1000));

    const after3 = await getScrollInfo();
    console.log(`   scrollTop: ${after2.scrollTop} → ${after3.scrollTop} (变化: ${after3.scrollTop - after2.scrollTop})`);
    console.log('');

    // 6. 总结
    const totalChange = after3.scrollTop - before.scrollTop;
    console.log('📊 测试结果总结:');
    console.log(`   初始 scrollTop: ${before.scrollTop}`);
    console.log(`   最终 scrollTop: ${after3.scrollTop}`);
    console.log(`   总变化量: ${totalChange}px`);
    console.log(`   预期变化: 1800px (3次 × 600px)`);
    console.log('');

    if (totalChange > 0) {
        console.log('✅ user_action + scroll 方式可以工作!');
        console.log(`   但实际滚动量 (${totalChange}px) ${totalChange >= 1500 ? '≈' : '<'} 预期 (1800px)`);
    } else {
        console.log('❌ user_action + scroll 方式无法滚动评论区容器');
        console.log('   建议使用 JS scrollTo 方式');
    }
}

test().catch(console.error);
