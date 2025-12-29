#!/usr/bin/env node

const UNIFIED_API = process.env.UNIFIED_API_URL || 'http://127.0.0.1:7701';
const PROFILE = process.env.TEST_PROFILE || 'weibo_fresh';
const URL = process.env.TEST_URL || 'https://weibo.com';
const DOM_PATH = process.env.TEST_DOM_PATH || 'root/1/1/0/0/0/0/1/2';

const log = (m) => console.log('[dom-branch-test]', m);

async function testDomBranch(path, maxDepth = 5) {
  const payload = {
    action: 'dom:branch:2',
    payload: {
      profile: PROFILE,
      url: URL,
      path: path,
      maxDepth: maxDepth,
      maxChildren: 6,
    },
  };

  try {
    const resp = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      log(`✗ HTTP Error: ${resp.status} ${resp.statusText}`);
      const text = await resp.text();
      log(`  Response: ${text.substring(0, 200)}`);
      return false;
    }

    const json = await resp.json();

    if (json.success && json.data?.node) {
      log(`✓ Success for path: ${path}`);
      log(`  - Node path: ${json.data.node.path}`);
      log(`  - Node tag: ${json.data.node.tag || 'N/A'}`);
      log(`  - Children: ${json.data.node.children?.length || 0}`);
      return true;
    } else {
      log(`✗ Unexpected response for path: ${path}`);
      log(`  Response: ${JSON.stringify(json).substring(0, 200)}`);
      return false;
    }
  } catch (err) {
    log(`✗ Error for path ${path}: ${err.message}`);
    return false;
  }
}

async function main() {
  log('=== DOM Branch API Test ===');
  log(`API: ${UNIFIED_API}`);
  log(`Profile: ${PROFILE}`);
  log(`URL: ${URL}`);
  log('');

  let passed = 0;
  let failed = 0;

  // Test 1: Shallow path
  log('Test 1: Shallow path (root/1)');
  if (await testDomBranch('root/1', 3)) {
    passed++;
  } else {
    failed++;
  }
  log('');

  // Test 2: Medium path
  log('Test 2: Medium path (root/1/1)');
  if (await testDomBranch('root/1/1', 4)) {
    passed++;
  } else {
    failed++;
  }
  log('');

  // Test 3: Deep path (from container match)
  log(`Test 3: Deep path (${DOM_PATH})`);
  if (await testDomBranch(DOM_PATH, 5)) {
    passed++;
  } else {
    failed++;
  }
  log('');

  log('=== Test Summary ===');
  log(`Passed: ${passed}/3`);
  log(`Failed: ${failed}/3`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  log(`FATAL ERROR: ${e.message}`);
  process.exit(1);
});
