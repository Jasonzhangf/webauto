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
  console.log('=== 小红书文本诊断 ===');

  try {
    const res = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: { 
        profile: PROFILE, 
        script: `(() => {
            return {
                url: location.href,
                title: document.title,
                text: document.body.innerText.substring(0, 1000),
                htmlLength: document.body.innerHTML.length
            };
        })()` 
      }
    });
    
    const data = res.data?.result;
    console.log('URL:', data?.url);
    console.log('Title:', data?.title);
    console.log('Text Preview:', data?.text?.replace(/\n/g, ' '));
    console.log('HTML Length:', data?.htmlLength);
    
  } catch (e) {
    console.error('Check Failed:', e.message);
  }
}

main().catch(console.error);
