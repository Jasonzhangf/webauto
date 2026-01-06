#!/usr/bin/env node
/**
 * 深度分析模态框DOM结构
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  console.log('Detecting modal structure...');
  
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        // 1. 查找所有可见容器
        const allDivs = Array.from(document.querySelectorAll('div, section, aside'));
        const visibleDivs = allDivs.filter(el => {
           const rect = el.getBoundingClientRect();
           return rect.width > 300 && rect.height > 300 && 
                  window.getComputedStyle(el).display !== 'none';
        });

        // 2. 查找滚动容器
        const scrollContainers = visibleDivs.filter(el => {
           const style = window.getComputedStyle(el);
           return (el.scrollHeight > el.clientHeight + 50) &&
                  (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay');
        }).map(el => ({
           className: el.className,
           id: el.id,
           scrollHeight: el.scrollHeight,
           clientHeight: el.clientHeight,
           childCount: el.childElementCount
        }));

        // 3. 查找评论区锚点
        const comments = document.querySelector('.comments-el, .comment-container, .comment-list');
        const commentAnchor = comments ? {
           className: comments.className,
           rect: comments.getBoundingClientRect()
        } : null;

        return {
           scrollContainers,
           commentAnchor,
           url: location.href
        };
      })()`
    }
  });
  
  console.log('Result:', JSON.stringify(result.data?.result, null, 2));
}

main().catch(console.error);
