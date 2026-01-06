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

async function checkNavLinks() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        // Find left sidebar links or top nav links
        const links = Array.from(document.querySelectorAll('a'));
        const candidates = links.filter(el => {
          const text = el.textContent?.trim();
          const href = el.href;
          return text && href && (
            text.includes('热门') || 
            text.includes('榜单') || 
            text.includes('同城') ||
            text.includes('热搜') ||
            href.includes('hot')
          );
        }).map(el => ({
          text: el.textContent.trim(),
          href: el.href,
          selector: \`a[href="\${el.getAttribute('href')}"]\`
        }));
        
        return candidates.slice(0, 10);
      })()`
    }
  });
  
  console.log(JSON.stringify(result.data?.result, null, 2));
}

checkNavLinks().catch(console.error);
