#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Test raw extraction without filtering
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

async function testRaw() {
  log('TEST', 'Testing raw extraction');
  
  try {
    const result = await post('/v1/controller/action', {
      action: 'browser:execute',
      payload: {
        profile: PROFILE,
        script: `
          (function() {
            const articles = Array.from(document.querySelectorAll('article[class*="Feed_wrap_"]'));
            const results = [];
            
            for (let i = 0; i < Math.min(articles.length, 5); i++) {
              const article = articles[i];
              const data = {
                index: i,
                html: article.outerHTML.substring(0, 200),
                text: article.textContent.substring(0, 200),
                attributes: Array.from(article.attributes).map(attr => ({name: attr.name, value: attr.value})),
                innerHTML: article.innerHTML.substring(0, 200)
              };
              results.push(data);
            }
            
            return {
              count: articles.length,
              sample: results
            };
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

testRaw().catch(console.error);
