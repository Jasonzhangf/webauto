#!/usr/bin/env node
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function checkBottom() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        // Scroll to bottom first
        window.scrollTo(0, document.body.scrollHeight);
        
        // Look for typical "load more" elements
        const buttons = Array.from(document.querySelectorAll('div, span, a, button'));
        const candidates = buttons.filter(el => {
          const text = el.textContent?.trim();
          return text && (text.includes('加载更多') || text.includes('查看更多') || text.includes('下一页'));
        });
        
        return {
          height: document.body.scrollHeight,
          bottomText: document.body.innerText.slice(-500),
          candidates: candidates.map(el => ({
            tag: el.tagName,
            text: el.textContent.trim().slice(0, 50),
            class: el.className
          })).slice(0, 10)
        };
      })()`
    }
  });
  
  console.log(JSON.stringify(result.data?.result, null, 2));
}

checkBottom().catch(console.error);
