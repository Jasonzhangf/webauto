#!/usr/bin/env node
const UNIFIED_API = 'http://127.0.0.1:7701';

const args = process.argv.slice(2);
const PROFILE = args[0] || process.env.WEBAUTO_PROFILE || null;
const TARGET_URL = args[1] || process.env.WEBAUTO_URL || null;

async function post(endpoint, data) {
  const res = await fetch(`${UNIFIED_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function summarizeTree(tree) {
  if (!tree) return { keys: [], rootId: null, childCount: 0 };
  const keys = Object.keys(tree);
  const rootId = tree.container?.id || null;
  const childCount = Array.isArray(tree.children) ? tree.children.length : 0;
  return { keys, rootId, childCount };
}

async function main() {
  if (!PROFILE) {
    console.error('Usage: debug-container-tree-summary.mjs <profile> [url]');
    console.error('  - profile 必须显式传入或通过 WEBAUTO_PROFILE 提供');
    process.exit(1);
  }

  const matchResult = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      ...(TARGET_URL ? { url: TARGET_URL } : {})
    }
  });
  const snapshot = matchResult.data?.snapshot;
  const containerTree = snapshot?.container_tree;
  const rootMatch = snapshot?.root_match;

  console.log('snapshot keys:', snapshot ? Object.keys(snapshot) : []);
  console.log('container_tree summary:', summarizeTree(containerTree));
  console.log('root_match keys:', rootMatch ? Object.keys(rootMatch) : []);

  if (containerTree?.children?.length) {
    console.log('first child ids:', containerTree.children.slice(0, 5).map((c) => c?.container?.id || null));
  }
  if (Array.isArray(containerTree?.containers)) {
    console.log('containers count:', containerTree.containers.length);
    console.log('first container ids:', containerTree.containers.slice(0, 5).map((c) => c?.id || null));
  }
}

main().catch(console.error);
