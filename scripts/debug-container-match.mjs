#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

import { spawn } from 'node:child_process';

const BROWSER_SERVICE = 'http://127.0.0.1:7704';
const UNIFIED_API = 'http://127.0.0.1:7701';
const PROFILE = 'xiaohongshu_fresh';

async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function main() {
  console.log('🔍 Debugging containers:match in Headless mode...');
  
  // 1. Ensure browser is running
  await post(`${BROWSER_SERVICE}/command`, { 
    action: 'start', 
    args: { profileId: PROFILE, headless: true } 
  });
  
  // 2. Navigate to search page
  console.log('🌐 Navigating to search page...');
  await post(`${BROWSER_SERVICE}/command`, {
    action: 'goto',
    args: { profileId: PROFILE, url: 'https://www.xiaohongshu.com/search_result?keyword=%E8%87%AA%E5%8A%A8%E9%A9%BE%E9%A9%B6' }
  });
  
  // 3. Wait for load
  console.log('⏳ Waiting for 5s...');
  await new Promise(r => setTimeout(r, 5000));
  
  // 4. Try match
  console.log('🧪 Testing containers:match...');
  const matchRes = await post(`${UNIFIED_API}/v1/controller/action`, {
    action: 'containers:match',
    payload: { profile: PROFILE }
  });
  
  console.log('📝 Match Result:', JSON.stringify(matchRes, null, 2));
  
  // 5. Screenshot for debug
  console.log('📸 Taking screenshot...');
  const screenRes = await post(`${BROWSER_SERVICE}/command`, {
    action: 'screenshot',
    args: { profileId: PROFILE }
  });
  
  if (screenRes.data) {
    console.log('✅ Screenshot captured (base64 length):', screenRes.data.length);
  } else {
    console.error('❌ Screenshot failed:', screenRes);
  }
}

main();
