#!/usr/bin/env node
import { ensureUtf8Console } from './lib/cli-encoding.mjs';

ensureUtf8Console();

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

async function main() {
  if (!PROFILE) {
    console.error('Usage: debug-container-tree-full.mjs <profile> [url]');
    console.error('  - profile 必须显式传入或通过 WEBAUTO_PROFILE 提供');
    process.exit(1);
  }

  const matchResult = await post('/v1/controller/action', {
    action: 'containers:match',
    payload: {
      profile: PROFILE,
      ...(TARGET_URL ? { url: TARGET_URL } : {}),
      maxDepth: 3,
      maxChildren: 10
    }
  });
  
  const snapshot = matchResult.data?.snapshot;
  const containerTree = snapshot?.container_tree;
  
  console.log('Container Tree Structure:');
  console.log('Root container ID:', containerTree?.id);
  console.log('Root container type:', containerTree?.type);
  console.log('Root container children count:', Array.isArray(containerTree?.children) ? containerTree.children.length : 0);
  
  if (containerTree?.children) {
    console.log('\nChildren:');
    containerTree.children.forEach((child, i) => {
      console.log(`  [${i}] ID: ${child?.id}, Type: ${child?.type}`);
      console.log(`      Children count: ${Array.isArray(child?.children) ? child.children.length : 0}`);
      if (child?.children) {
        child.children.forEach((grandchild, j) => {
          console.log(`        [${i}.${j}] ID: ${grandchild?.id}, Type: ${grandchild?.type}`);
        });
      }
    });
  }
}

main().catch(console.error);
