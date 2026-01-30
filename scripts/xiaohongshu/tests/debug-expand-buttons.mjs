#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Debug: 查看评论区中的展开按钮
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
    console.log('🔍 检查评论区中的所有可能的展开按钮...\n');

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

      // 查找所有可能的按钮/链接
      const allElements = Array.from(root.querySelectorAll('*'));
      const candidates = [];

      for (const el of allElements) {
        const text = (el.textContent || '').trim();
        if (!text || text.length > 100) continue; // 跳过太长的文本

        const styles = window.getComputedStyle(el);
        const isVisible = styles.display !== 'none' && styles.visibility !== 'hidden' && el.offsetParent !== null;
        if (!isVisible) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;

        // 检查是否包含关键词
        const keywords = ['展开', '更多', '回复', '评论', '查看', '全部', '条'];
        const hasKeyword = keywords.some(kw => text.includes(kw));
        if (!hasKeyword) continue;

        candidates.push({
          tag: el.tagName,
          text: text.substring(0, 50),
          className: el.className,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight &&
                     rect.left >= 0 && rect.right <= window.innerWidth,
          hasClick: el.onclick !== null || el.getAttribute('onclick') !== null,
          role: el.getAttribute('role'),
        });
      }

      return {
        total: candidates.length,
        candidates: candidates.slice(0, 10), // 只返回前10个
      };
    })()`,
    });

    const data = result.data?.result || result.result || result;
    console.log(JSON.stringify(data, null, 2));
}

debug().catch(console.error);
