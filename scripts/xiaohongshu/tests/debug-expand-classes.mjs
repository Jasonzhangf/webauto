#!/usr/bin/env node
import { ensureUtf8Console } from '../../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 查看展开按钮的实际CSS类名
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
    console.log('🔍 查找展开按钮的CSS类名\n');

    const result = await post('browser:execute', {
        profile: PROFILE,
        script: `(() => {
      const root =
        document.querySelector('.comments-el') ||
        document.querySelector('.comment-list') ||
        document.querySelector('.comments-container') ||
        document.querySelector('[class*="comment-section"]');

      if (!root) return { error: '找不到评论区' };

      // 查找所有包含"展开"文本的元素，看看它们的class
      const allElements = Array.from(root.querySelectorAll('*'));
      const expandElements = [];
      
      for (const el of allElements) {
        if (!(el instanceof HTMLElement)) continue;
        const text = (el.textContent || '').trim();
        
        // 只关注包含"展开 N 条"的元素
        if (/展开\\s*\\d+\\s*条/.test(text)) {
          const rect = el.getBoundingClientRect();
          expandElements.push({
            tag: el.tagName,
            className: el.className,
            id: el.id || null,
            text: text.substring(0, 50),
            rect: {
              x: Math.round(rect.x),
              y: Math.round(rect.y),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            // 查看父元素的class
            parentClassName: el.parentElement ? el.parentElement.className : null,
            // 查看第一个子元素的class
            firstChildClassName: el.firstElementChild ? el.firstElementChild.className : null,
          });
        }
      }

      return {
        total: expandElements.length,
        elements: expandElements.slice(0, 10),
      };
    })()`,
    });

    const data = result.data?.result || result.result || result;

    console.log('找到的展开元素:');
    console.log(JSON.stringify(data, null, 2));

    if (data.elements && data.elements.length > 0) {
        console.log('\n\n📋 CSS类名汇总:');
        const classNames = new Set();
        data.elements.forEach(el => {
            if (el.className) {
                el.className.split(' ').forEach(c => c && classNames.add(c));
            }
        });
        console.log(Array.from(classNames).map(c => `  .${c}`).join('\n'));
    }
}

debug().catch(console.error);
