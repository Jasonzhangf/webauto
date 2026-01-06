#!/usr/bin/env node

const UNIFIED_API = 'http://127.0.0.1:7701';

async function main() {
  try {
    const response = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'containers:match',
        payload: {
          profileId: 'weibo_fresh',
          url: 'https://weibo.com',
          maxDepth: 2,
          maxChildren: 5
        }
      })
    });

    const result = await response.json();
    console.log('[containers:match] result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);
