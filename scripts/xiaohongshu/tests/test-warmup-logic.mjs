#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 直接测试WarmupCommentsBlock中的展开按钮查找逻辑
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
    console.log('🔍 测试当前WarmupCommentsBlock的展开按钮查找逻辑\n');

    const result = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');
      if (!root) return { buttons: [], total: 0, error: 'no root' };

      // 找到滚动容器
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

      // 在评论区内查找所有展开按钮
      const allElements = Array.from(root.querySelectorAll('*'));
      console.log('[DEBUG] Total elements in root:', allElements.length);
      
      const expandButtons = [];
      
      // 正则匹配"展开 N 条回复"或"展开 N 条"
      const expandPattern = /展开\\s*\\d+\\s*条/;
      
      for (const el of allElements) {
        // 必须是可见元素
        if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
        
        const text = (el.textContent || '').trim();
        if (!text) continue;
        
        // 优先匹配精确格式
        const isExpandButton = expandPattern.test(text);
        if (!isExpandButton) continue;
        
        // 检查是否已经点击过
        if (el.dataset && el.dataset.webautoExpandClicked === '1') continue;
        
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        
        console.log('[DEBUG] Found expand button:', {
          text: text.substring(0, 50),
          tag: el.tagName,
          className: el.className,
        });
        
        expandButtons.push({
          text: text.substring(0, 30),
          tag: el.tagName,
          className: el.className,
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      }

      console.log('[DEBUG] Total expand buttons found:', expandButtons.length);

      return {
        buttons: expandButtons.slice(0, 5),
        total: expandButtons.length,
        scrollContainerExists: !!scrollContainer,
        debugInfo: {
          totalElements: allElements.length,
          rootExists: !!root,
          rootClassName: root ? root.className : null,
        },
      };
    })()`,
    });

    const data = result.data?.result || result.result;
    console.log('\n结果:');
    console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
