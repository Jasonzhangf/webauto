#!/usr/bin/env node
/**
 * Debug selector to see what elements are available
 */

const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'weibo_fresh';

function log(step, msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] [${step}] ${msg}`);
}

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function testSelector() {
  log('TEST', 'Testing selector');
  
  try {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const selectors = [
              'article',
              'article[class*="Feed_wrap_"]',
              '[class*="Feed_wrap_"]',
              'div[class*="detail_wbtext"]',
              'header a[href*="weibo.com"]',
              'a[href*="weibo.com"]',
              'a[href*="weibo.com"][href*="/status/"]',
              'time'
            ];
            
            const results = {};
            for (const selector of selectors) {
              results[selector] = document.querySelectorAll(selector).length;
            }
            
            return results;
          })()
        `
      }
    });
    
    log('RESULT', JSON.stringify(result, null, 2));
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

testSelector().catch(console.error);
