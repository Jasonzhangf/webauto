#!/usr/bin/env node
/**
 * Simple extract operation test
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

async function testExtract() {
  log('TEST', 'Testing browser:execute (direct page evaluation)');
  
  try {
    // Try to extract using direct browser execution
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const posts = [];
            const postElements = document.querySelectorAll('article[class*="Feed_wrap_"]');
            
            for (const post of Array.from(postElements).slice(0, 3)) {
              const authorEl = post.querySelector('header a[href*="weibo.com"]');
              const contentEl = post.querySelector('div[class*="detail_wbtext"]');
              const linkEl = post.querySelector('a[href*="weibo.com"][href*="/status/"]');
              
              posts.push({
                author: authorEl?.textContent || '',
                content: contentEl?.textContent || '',
                url: linkEl?.href || ''
              });
            }
            
            return posts;
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

testExtract().catch(console.error);
