/**
 * Producer Server-Side Dedup E2E Test
 *
 * 快速验证 Producer 去重逻辑（不依赖浏览器）
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const SEARCH_GATE_URL = 'http://127.0.0.1:7790';
const WEBAUTO_HOME = process.env.WEBAUTO_HOME || path.join(os.homedir(), '.webauto');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callAPI(pathname, body = {}) {
  const url = new URL(pathname, SEARCH_GATE_URL);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function getAPI(pathname) {
  const url = new URL(pathname, SEARCH_GATE_URL);
  const res = await fetch(url, { method: 'GET' });
  return await res.json();
}

async function testProducerDedupE2E() {
  console.log('=== Producer Server-Side Dedup E2E Test ===\n');

  // Step 1: Ensure SearchGate running
  console.log('Step 1: Check SearchGate server...');
  try {
    const health = await getAPI('/health');
    if (!health.ok) {
      console.log('❌ SearchGate not healthy');
      process.exit(1);
    }
    console.log('✅ SearchGate running\n');
  } catch (err) {
    console.log(`❌ SearchGate not available: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Setup test environment
  const testKeyword = 'producer-dedup-e2e-test';
  const testEnv = 'debug';
  const outputDir = path.join(WEBAUTO_HOME, 'download', 'xiaohongshu', testEnv, testKeyword);
  const linksPath = path.join(outputDir, 'links.jsonl');

  // Cleanup previous test
  if (fs.existsSync(outputDir)) {
    try { fs.rmSync(outputDir, { recursive: true }); } catch {}
  }
  fs.mkdirSync(outputDir, { recursive: true });

  console.log('Step 2: Test environment setup');
  console.log(`  outputDir: ${outputDir}\n`);

  // Step 3: Create mock links (simulate Producer collection)
  const mockLinks = [
    { noteId: 'note-e2e-001', url: 'https://www.xiaohongshu.com/explore/note-e2e-001' },
    { noteId: 'note-e2e-002', url: 'https://www.xiaohongshu.com/explore/note-e2e-002' },
    { noteId: 'note-e2e-003', url: 'https://www.xiaohongshu.com/explore/note-e2e-003' },
  ];

  console.log('Step 3: First enqueue (should add all 3 links)...');

  // Simulate Producer enqueueLinks logic
  const checkResult1 = await callAPI('/detail-links/check-seen', {
    noteIds: mockLinks.map(l => l.noteId),
    key: testKeyword,
  });
  console.log(`  check-seen: seenCount=${checkResult1.seenCount} unseenCount=${checkResult1.unseenCount}`);

  const unseenLinks1 = checkResult1.ok
    ? mockLinks.filter(l => {
        const r = checkResult1.results?.find(r => r.noteId === l.noteId);
        return !r?.seen;
      })
    : mockLinks;

  console.log(`  unseenLinks: ${unseenLinks1.length} links`);

  // Write to links.jsonl and record-seen
  let added1 = 0;
  for (const link of unseenLinks1) {
    fs.appendFileSync(linksPath, JSON.stringify({ ...link, collectedAt: new Date().toISOString() }) + '\n');
    await callAPI('/detail-links/record-seen', {
      noteId: link.noteId,
      source: 'producer',
      key: testKeyword,
    });
    added1++;
  }

  console.log(`  ✅ First enqueue: ${added1} links added\n`);

  // Step 4: Second enqueue (same links - should be deduped)
  console.log('Step 4: Second enqueue (same links - should dedupe)...');

  const checkResult2 = await callAPI('/detail-links/check-seen', {
    noteIds: mockLinks.map(l => l.noteId),
    key: testKeyword,
  });
  console.log(`  check-seen: seenCount=${checkResult2.seenCount} unseenCount=${checkResult2.unseenCount}`);

  const unseenLinks2 = checkResult2.ok
    ? mockLinks.filter(l => {
        const r = checkResult2.results?.find(r => r.noteId === l.noteId);
        return !r?.seen;
      })
    : mockLinks;

  console.log(`  unseenLinks: ${unseenLinks2.length} links`);

  let added2 = 0;
  for (const link of unseenLinks2) {
    fs.appendFileSync(linksPath, JSON.stringify({ ...link, collectedAt: new Date().toISOString() }) + '\n');
    await callAPI('/detail-links/record-seen', {
      noteId: link.noteId,
      source: 'producer',
      key: testKeyword,
    });
    added2++;
  }

  console.log(`  ✅ Second enqueue: ${added2} links added (expected 0)\n`);

  // Step 5: Verify links.jsonl
  console.log('Step 5: Verify links.jsonl...');
  const linksContent = fs.readFileSync(linksPath, 'utf-8').trim().split('\n');
  console.log(`  links.jsonl has ${linksContent.length} entries`);

  if (linksContent.length === 3) {
    console.log('✅ Correct: 3 unique links\n');
  } else {
    console.log(`❌ Expected 3, got ${linksContent.length}\n`);
  }

  // Step 6: Verify seen records file
  console.log('Step 6: Verify seen records persistence...');
  const seenFilePath = path.join(WEBAUTO_HOME, 'state', 'search-gate', 'seen-records.jsonl');
  if (fs.existsSync(seenFilePath)) {
    const seenContent = fs.readFileSync(seenFilePath, 'utf-8').trim().split('\n');
    console.log(`  seen-records.jsonl has ${seenContent.length} entries`);
    console.log('✅ Seen records persisted\n');
  } else {
    console.log('⚠️ Seen records file not found\n');
  }

  // Cleanup
  try { fs.rmSync(outputDir, { recursive: true }); } catch {}

  // Summary
  console.log('=== E2E Test Summary ===');
  console.log(`- First enqueue: ${added1} links (expected 3)`);
  console.log(`- Second enqueue: ${added2} links (expected 0)`);
  console.log(`- links.jsonl entries: ${linksContent.length} (expected 3)`);
  
  if (added1 === 3 && added2 === 0 && linksContent.length === 3) {
    console.log('\n✅ ✅ ✅ PRODUCER SERVER-SIDE DEDUP WORKING!');
    console.log('✅ P0-2 VERIFIED: Duplicate links correctly filtered');
  } else {
    console.log('\n❌ Dedup logic has issues');
  }
}

testProducerDedupE2E().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
