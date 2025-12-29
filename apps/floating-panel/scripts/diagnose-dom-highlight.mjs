#!/usr/bin/env node

/**
 * DOM 高亮诊断脚本
 */

import fs from 'node:fs';

const LOG_FILE = '/tmp/webauto-dom-highlight-diagnose.log';
const API_BASE = 'http://127.0.0.1:7701';

function log(msg) {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
  const line = `[${timestamp}] ${msg}\n`;
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {}
}

async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, data: json };
}

async function get(url) {
  const res = await fetch(url);
  return res.json();
}

async function diagnose() {
  log('=== DOM Highlight Diagnostics ===\n');

  // Step 1: Get session list
  log('[Step 1] Getting active sessions...');
  const sessions = await get(`${API_BASE}/v1/session/list`);
  log(`Sessions response: ${JSON.stringify(sessions, null, 2)}`);

  // Extract profileId correctly
  const profileId = sessions?.sessions?.[0]?.profileId || 
                    sessions?.data?.sessions?.[0]?.profileId ||
                    sessions?.data?.[0]?.profileId;
  
  if (!profileId) {
    log('\n❌ PROBLEM: No active session!');
    log('Available data:', JSON.stringify(sessions));
    return;
  }

  log(`\n✅ Found active session: ${profileId}\n`);

  // Step 2: Test WITHOUT profile (current UI behavior)
  log('[Step 2] Testing DOM highlight WITHOUT profile...');
  const noProfileResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    path: 'root/0/0',
    options: { style: '2px solid blue', channel: 'dom', sticky: true }
  });
  
  log(`Status: ${noProfileResult.status}`);
  log(`Response: ${JSON.stringify(noProfileResult.data, null, 2)}`);
  
  if (!noProfileResult.ok || !noProfileResult.data.success) {
    log('\n❌ CONFIRMED: Highlight fails without profile!');
    log(`Error: ${noProfileResult.data.error || 'Unknown'}\n`);
  }

  // Step 3: Test WITH profile (correct)
  log('[Step 3] Testing DOM highlight WITH profile...');
  const withProfileResult = await post(`${API_BASE}/v1/browser/highlight-dom-path`, {
    profile: profileId,
    path: 'root/0/0',
    options: { style: '2px solid blue', channel: 'dom', sticky: true }
  });
  
  log(`Status: ${withProfileResult.status}`);
  log(`Response: ${JSON.stringify(withProfileResult.data, null, 2)}`);
  
  if (withProfileResult.ok && withProfileResult.data.success) {
    log('\n✅ CONFIRMED: Highlight WORKS with profile!\n');
  }

  // Summary
  log('\n=== ROOT CAUSE IDENTIFIED ===');
  log('UI does NOT pass profile parameter when highlighting DOM nodes');
  log(`Current profile in session: ${profileId}`);
  log('\nFIX REQUIRED:');
  log('1. graph.mjs: Pass currentProfile to highlightElement()');
  log('2. preload.mjs: Accept profile parameter');
  log('3. index.mts: Pass profile to API endpoint\n');
}

diagnose().catch(err => {
  log(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
