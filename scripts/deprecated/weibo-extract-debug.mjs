#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Debug extraction with detailed link analysis
 */

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

async function debugExtraction() {
  const result = await post('/v1/controller/action', {
    action: 'browser:execute',
    payload: {
      profile: PROFILE,
      script: `
        (function() {
          const articles = Array.from(document.querySelectorAll('article[class*="Feed_wrap_"]'));
          const debug = [];
          
          for (let i = 0; i < Math.min(articles.length, 3); i++) {
            const article = articles[i];
            const links = Array.from(article.querySelectorAll('a[href]'));
            const linkInfo = links.map(a => ({
              href: a.href,
              text: (a.textContent || '').trim().substring(0, 30),
              isStatus: a.href.includes('/status/') || a.href.includes('/detail/') || /\/\d+\/[A-Z][A-Za-z0-9]+$/.test(a.href)
            }));
            
            debug.push({
              index: i,
              linkCount: links.length,
              links: linkInfo.slice(0, 10)
            });
          }
          
          return debug;
        })()
      `
    }
  });
  
  console.log(JSON.stringify(result, null, 2));
}

debugExtraction().catch(console.error);
