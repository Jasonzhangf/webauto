#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Debug content extraction with broader selectors
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

async function debugContent() {
  log('TEST', 'Debugging content extraction');
  
  try {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            // Try different selectors for content
            const contentSelectors = [
              'div[class*="detail_wbtext"]',
              'div[class*="WB_text"]',
              '[class*="text"]',
              'div[aria-label*="微博"]',
              'article div',
              'div[class*="Feed_body"] div'
            ];
            
            const results = {};
            for (const selector of contentSelectors) {
              const elements = document.querySelectorAll(selector);
              results[selector] = {
                count: elements.length,
                sample: Array.from(elements).slice(0, 3).map(el => 
                  el.textContent?.trim()?.substring(0, 100) || ''
                )
              };
            }
            
            // Also check for post links
            const linkSelectors = [
              'a[href*="/status/"]',
              'a[href*="/detail/"]',
              'a[href*="/u/"]',
              'a[href*="weibo.com/"][href*="/"]'
            ];
            
            for (const selector of linkSelectors) {
              const links = document.querySelectorAll(selector);
              results[selector] = {
                count: links.length,
                sample: Array.from(links).slice(0, 3).map(a => a.href)
              };
            }
            
            return results;
          })()
        `
      }
    });
    
    log('RESULT', JSON.stringify(result.data?.result, null, 2));
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

debugContent().catch(console.error);
