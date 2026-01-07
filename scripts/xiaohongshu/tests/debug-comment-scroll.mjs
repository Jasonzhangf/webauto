#!/usr/bin/env node
/**
 * Debug: 检查评论区的实际DOM结构和位置
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

async function debug() {
    console.log('🔍 检查评论区DOM结构和滚动容器...\n');

    const result = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');

      if (!root) {
        return { error: '找不到评论区根元素' };
      }

      const rootRect = root.getBoundingClientRect();
      const rootStyle = window.getComputedStyle(root);

      // 查找可滚动的父容器
      let scrollableParent = null;
      let current = root.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        if (style.overflow === 'auto' || style.overflow === 'scroll' ||
            style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollableParent = current;
          break;
        }
        current = current.parentElement;
      }

      const scrollableRect = scrollableParent ? scrollableParent.getBoundingClientRect() : null;
      const scrollableStyle = scrollableParent ? window.getComputedStyle(scrollableParent) : null;

      // 评论项
      const items = Array.from(root.querySelectorAll('.comment-item'));
      const visibleItems = items.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      });

      return {
        root: {
          className: root.className,
          rect: {
            x: rootRect.x,
            y: rootRect.y,
            width: rootRect.width,
            height: rootRect.height,
          },
          style: {
            position: rootStyle.position,
            overflow: rootStyle.overflow,
            overflowY: rootStyle.overflowY,
          },
        },
        scrollableParent: scrollableParent ? {
          tagName: scrollableParent.tagName,
          className: scrollableParent.className,
          rect: {
            x: scrollableRect.x,
            y: scrollableRect.y,
            width: scrollableRect.width,
            height: scrollableRect.height,
          },
          style: {
            position: scrollableStyle.position,
            overflow: scrollableStyle.overflow,
            overflowY: scrollableStyle.overflowY,
          },
          scrollTop: scrollableParent.scrollTop,
          scrollHeight: scrollableParent.scrollHeight,
          clientHeight: scrollableParent.clientHeight,
        } : null,
        items: {
          total: items.length,
          visible: visibleItems.length,
          sample: visibleItems.length > 0 ? {
            rect: visibleItems[0].getBoundingClientRect(),
          } : null,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      };
    })()`,
    });

    const data = result.data?.result || result.result || result;
    console.log(JSON.stringify(data, null, 2));
}

debug().catch(console.error);
