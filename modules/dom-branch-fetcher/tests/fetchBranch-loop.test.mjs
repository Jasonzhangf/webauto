#!/usr/bin/env node
/**
 * dom-branch-fetcher 回环测试
 * 1. 确保 weibo_fresh 会话存在
 * 2. 调用 CLI: dom-branch:fetch --profile weibo_fresh --url https://weibo.com --path root
 * 3. 断言返回节点 path 为 root
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const PROFILE = 'weibo_fresh';
const URL = 'https://weibo.com';
const PATH = 'root';

function runCli() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['tsx', path.join(repoRoot, 'modules/dom-branch-fetcher/src/cli.ts'), '--profile', PROFILE, '--url', URL, '--path', PATH], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`CLI exit ${code}\n${stderr}`));
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

async function run() {
  console.log('=== dom-branch-fetcher 回环测试 ===');
  const res = await runCli();
  assert.equal(res.node?.path, 'root');
  console.log('✅ dom-branch-fetcher 回环测试通过');
}

run().catch(err => {
  console.error('❌ dom-branch-fetcher 回环测试失败:', err.message);
  process.exit(1);
});
