#!/usr/bin/env node
/**
 * 全局回环测试 - 按模块组织
 * 确保所有基础能力都正常工作
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const log = (msg) => console.log(`[loop-all] ${msg}`);

const tests = [
  {
    name: 'preload:esm',
    desc: 'ESM Preload 回环',
    cmd: 'npx',
    args: ['electron', 'scripts/test-preload.mjs'],
    cwd: path.join(repoRoot, 'apps/floating-panel')
  },
  {
    name: 'browser:profile',
    desc: '浏览器 Profile 恢复',
    cmd: 'node',
    args: ['scripts/test-weibo-profile.mjs'],
    cwd: repoRoot
  },
  {
    name: 'highlight:complete',
    desc: '高亮完整回环（selector + dom_path + 容器）',
    cmd: 'node',
    args: ['scripts/test-highlight-complete.mjs'],
    cwd: repoRoot
  }
];

function runTest(test) {
  return new Promise((resolve, reject) => {
    log(`开始测试: ${test.name} - ${test.desc}`);
    const start = Date.now();
    const proc = spawn(test.cmd, test.args, {
      cwd: test.cwd,
      stdio: 'inherit',
      shell: false
    });

    proc.on('exit', (code) => {
      const duration = Date.now() - start;
      if (code === 0) {
        log(`✅ ${test.name} 通过 (${duration}ms)`);
        resolve({ name: test.name, ok: true, duration });
      } else {
        log(`❌ ${test.name} 失败 code=${code} (${duration}ms)`);
        resolve({ name: test.name, ok: false, duration, code });
      }
    });

    proc.on('error', (err) => {
      log(`❌ ${test.name} 错误: ${err.message}`);
      resolve({ name: test.name, ok: false, error: err.message });
    });
  });
}

async function main() {
  log('='.repeat(60));
  log('全局回环测试开始');
  log('='.repeat(60));

  const results = [];
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log('='.repeat(60));
  log('测试汇总:');
  for (const r of results) {
    const status = r.ok ? '✅ PASS' : '❌ FAIL';
    log(`  ${status} ${r.name} ${r.duration ? `(${r.duration}ms)` : ''}`);
  }
  
  const passCount = results.filter(r => r.ok).length;
  log(`总计: ${passCount}/${results.length} 通过`);
  log('='.repeat(60));

  process.exit(passCount === results.length ? 0 : 1);
}

main();
