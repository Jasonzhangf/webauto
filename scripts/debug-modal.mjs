#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

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

async function checkModal() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `(() => {
        const modals = Array.from(document.querySelectorAll('div[class*="layer"], div[class*="dialog"], div[class*="modal"]'));
        const visibleModals = modals.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.innerText.length > 0;
        });
        
        return {
          count: visibleModals.length,
          texts: visibleModals.map(el => el.innerText.slice(0, 100))
        };
      })()`
    }
  });
  
  console.log(JSON.stringify(result.data?.result, null, 2));
}

checkModal().catch(console.error);
