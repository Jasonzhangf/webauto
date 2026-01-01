#!/usr/bin/env node
/**
 * Weibo Feed Extraction Workflow Test
 * 
 * Tests complete workflow:
 * 1. Navigate to weibo.com with weibo_fresh profile
 * 2. Match containers (page → feed_list → feed_posts)
 * 3. Extract links from each post
 * 4. Scroll to load more posts
 * 5. Repeat extraction
 */

import assert from 'node:assert/strict';
import WebSocket from 'ws';

const UNIFIED_PORT = 7701;
const BROWSER_PORT = 7704;
const PROFILE_ID = 'weibo_fresh';
const TARGET_URL = 'https://weibo.com';

function log(msg) {
  console.log(`[weibo-workflow-test] ${msg}`);
}

async function waitForHealth(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1200) });
      if (res.ok) return true;
    } catch {}
    await new Promise(res => setTimeout(res, 500));
  }
  return false;
}

async function sendWsAction(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${UNIFIED_PORT}/ws`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket action timeout'));
    }, 30000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'action',
        action,
        payload,
        requestId: Date.now()
      }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'response') {
          clearTimeout(timeout);
          ws.close();
          resolve(msg);
        }
      } catch (err) {
        clearTimeout(timeout);
        ws.close();
        reject(err);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function main() {
  try {
    log('Step 1: Check services health');
    const unifiedHealthy = await waitForHealth(`http://127.0.0.1:${UNIFIED_PORT}/health`);
    const browserHealthy = await waitForHealth(`http://127.0.0.1:${BROWSER_PORT}/health`);
    
    if (!unifiedHealthy || !browserHealthy) {
      throw new Error('Services not healthy. Please start with: node scripts/start-headful.mjs');
    }

    log('Step 2: Match containers');
    const matchResult = await sendWsAction('containers:match', {
      profile: PROFILE_ID,
      url: TARGET_URL,
      maxDepth: 3,
      maxChildren: 20
    });

    assert.equal(matchResult.success, true, 'Container match should succeed');
    const snapshot = matchResult.data?.snapshot;
    assert.ok(snapshot, 'Should have snapshot');
    
    log(`  ✓ Matched containers: ${snapshot.container_tree?.containers?.length || 0}`);
    
    // Verify weibo_main_page
    const rootContainer = snapshot.container_tree?.containers?.[0];
    assert.ok(rootContainer?.id?.includes('weibo_main_page'), 'Should match weibo_main_page');
    log(`  ✓ Root container: ${rootContainer.id}`);

    // Verify feed_list
    const feedList = snapshot.container_tree?.containers?.find(c => c.id?.includes('feed_list'));
    assert.ok(feedList, 'Should find feed_list container');
    log(`  ✓ Feed list container: ${feedList.id}`);

    // Verify feed_post containers
    const feedPosts = snapshot.container_tree?.containers?.filter(c => c.id?.includes('feed_post'));
    assert.ok(feedPosts.length > 0, 'Should find at least one feed_post');
    log(`  ✓ Found ${feedPosts.length} feed post containers`);

    log('Step 3: Highlight first post');
    if (feedPosts[0]) {
      const highlightResult = await sendWsAction('browser:highlight', {
        profile: PROFILE_ID,
        selector: feedPosts[0].match?.nodes?.[0]?.selector,
        options: {
          style: '3px solid #00C853',
          duration: 2000,
          sticky: false
        }
      });
      assert.equal(highlightResult.success, true, 'Highlight should succeed');
      log(`  ✓ Highlighted first post`);
    }

    log('Step 4: Verify DOM structure');
    // Check that containers have required properties
    for (const container of [rootContainer, feedList, feedPosts[0]]) {
      assert.ok(container?.id, 'Container should have id');
      assert.ok(container?.match?.nodes, 'Container should have matched nodes');
      assert.ok(container?.match?.nodes?.length > 0, 'Container should have at least one matched node');
      log(`  ✓ Container ${container.id} has ${container.match.nodes.length} matched nodes`);
    }

    log('✅ Workflow test completed successfully');
    log('📝 Verified components:');
    log('   ✓ Unified API health');
    log('   ✓ Browser Service health');
    log('   ✓ Container matching');
    log('   ✓ weibo_main_page container');
    log('   ✓ weibo_main_page.feed_list container');
    log('   ✓ weibo_main_page.feed_post containers');
    log('   ✓ DOM node matching');
    log('   ✓ Element highlighting');
    
    log('\n📋 Next steps:');
    log('   1. Integrate operation execution with Unified API');
    log('   2. Add scroll-to-load operation binding');
    log('   3. Implement link extraction and storage');
    log('   4. Add event-driven operation triggers');
    process.exit(0);

  } catch (error) {
    console.error('❌ Workflow test failed:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
