import fs from 'fs/promises';

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log('=== 小红书链接诊断 ===');

  try {
    const res = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: { 
        profile: PROFILE, 
        script: `(() => {
            const items = document.querySelectorAll('.note-item');
            const result = [];
            for (let i = 0; i < Math.min(items.length, 3); i++) {
                const el = items[i];
                const anchors = Array.from(el.querySelectorAll('a'));
                result.push({
                    index: i,
                    html: el.outerHTML.substring(0, 500),
                    links: anchors.map(a => a.href)
                });
            }
            return result;
        })()` 
      }
    });
    
    const data = res.data?.result;
    console.log(JSON.stringify(data, null, 2));
    
  } catch (e) {
    console.error('Check Failed:', e.message);
  }
}

main().catch(console.error);
