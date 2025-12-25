#!/usr/bin/env node
/**
 * 全局回环测试脚本（按模块整理）
 * 依赖：请先启动 Unified API(7701) 与 Browser Service(7704)
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const steps = [
  {
    name: 'browser:highlight-loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/browser/tests/highlight-loop.test.mjs')],
  },
  {
    name: 'browser:container-match-loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/browser/tests/container-match-loop.test.mjs')],
  },
  {
    name: 'dom-branch-fetcher:loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'modules/dom-branch-fetcher/tests/fetchBranch-loop.test.mjs')],
  },
  {
    name: 'floating-panel:preload-loop',
    cmd: 'node',
    args: [path.join(repoRoot, 'apps/floating-panel/scripts/test-preload.mjs')],
    env: { PRELOAD_PATH: path.join(repoRoot, 'apps/floating-panel/dist/main/preload.mjs') },
  },
  {
    name: 'floating-panel:ui-window-loop',
    cmd: 'npx',
    args: ['electron', 'scripts/test-ui-window-entry.mjs'],
    cwd: path.join(repoRoot, 'apps/floating-panel'),
  },
];

function runStep(step) {
  return new Promise((resolve, reject) => {
    const proc = spawn(step.cmd, step.args, {
      cwd: step.cwd || repoRoot,
      env: { ...process.env, ...(step.env || {}) },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`${step.name} failed (exit ${code})`));
      resolve();
    });
  });
}

async function run() {
  console.log('=== 全局回环测试开始 ===');
  for (const step of steps) {
    console.log(`\n[loop] ${step.name}`);
    await runStep(step);
  }
  console.log('\n✅ 全局回环测试完成');
}

run().catch((err) => {
  console.error(`\n❌ 全局回环测试失败: ${err.message}`);
  process.exit(1);
});
