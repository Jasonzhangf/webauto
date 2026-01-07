#!/usr/bin/env node
/**
 * Test extract operation directly
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
  log('TEST', 'Testing extract operation on feed_post container');
  
  try {
    const result = await post('/v1/controller/action', {
      action: 'container:operation',
      payload: {
        containerId: 'weibo_main_page.feed_post',
        operationId: 'extract',
        config: {
          fields: {
            author: "header a[href*='weibo.com']",
            content: "div[class*='detail_wbtext']",
            timestamp: "time",
            url: "a[href*='weibo.com'][href*='/status/']",
            authorUrl: "a[href*='weibo.com/u/']"
          },
          include_text: true
        },
        sessionId: PROFILE
      }
    });
    
    log('RESULT', JSON.stringify(result, null, 2));
  } catch (err) {
    log('ERROR', err.message);
    console.error(err);
  }
}

testExtract().catch(console.error);
