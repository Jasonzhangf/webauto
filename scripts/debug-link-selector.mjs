#!/usr/bin/env node
/**
 * Debug link selector to find post links
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

async function testLinks() {
  log('TEST', 'Testing link selectors');
  
  try {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const links = Array.from(document.querySelectorAll('a[href*="weibo.com"]')).slice(0, 20).map(a => a.href);
            const statusLinks = links.filter(l => l.includes('/status/') || l.includes('/detail/'));
            const urlPatterns = links.map(l => {
              try {
                const url = new URL(l);
                return url.pathname;
              } catch {
                return l;
              }
            }).slice(0, 10);
            
            return { links, statusLinks, urlPatterns };
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

testLinks().catch(console.error);
