#!/usr/bin/env node
/**
 * Simple test to check container matching result structure
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

async function test() {
  console.log('Testing container match result structure...');
  
  const matchResult = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      url: 'https://weibo.com/'
    }
  });
  
  console.log('Match Result:', JSON.stringify(matchResult, null, 2));
  
  if (matchResult.data?.container) {
    console.log('\nContainer Structure:');
    console.log('  ID:', matchResult.data.container.id);
    console.log('  Children:', matchResult.data.container.children?.length || 0);
    if (matchResult.data.container.children) {
      matchResult.data.container.children.forEach((child, i) => {
        console.log(`    [${i}] ${child.id} (type: ${child.type})`);
      });
    }
  }
}

test().catch(console.error);
