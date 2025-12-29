#!/usr/bin/env node
/**
 * 回环测试：基础高亮能力
 * 
 * 测试内容：
 * 1. 创建或获取 profile 会话
 * 2. 基础 selector 高亮（容器使用的方式）
 * 3. 基础 dom-path 高亮（DOM使用的方式）
 * 4. 测试清除高亮
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, '../logs/diagnose-highlight-basic.log');
const API_BASE = 'http://127.0.0.1:7701';

function log(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(LOG_FILE, line);
}

function post(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const postData = JSON.stringify(body);
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  log('='.repeat(60));
  log('开始基础高亮能力回环测试');
  log('='.repeat(60));

  const profile = 'weibo_fresh'; // 假设已存在

  // 测试1：基础 selector 高亮（容器使用的方式）
  log('\n[测试1] selector 高亮测试');
  try {
    const selector = 'article[class*="Feed_wrap_"]';
    const result = await post('/v1/browser/highlight', {
      profile,
      selector,
      color: 'green',
      options: { channel: 'test-container', sticky: true }
    });
    log(`  ✓ selector: ${selector}`);
    log(`  ✓ 结果: ${JSON.stringify(result)}`);
    log(`  ⏱️  等待2秒查看效果...`);
    await sleep(2000);
  } catch (e) {
    log(`  ✗ 失败: ${e.message}`);
  }

  // 清除
  await post('/v1/browser/clear-highlight', { profile, channel: 'test-container' });
  await sleep(500);

  // 测试2：基础 dom-path 高亮（DOM使用的方式）
  log('\n[测试2] dom-path 高亮测试');
  try {
    const domPath = 'root/1/1/0/0/0/0/1/2/0/0/0/0/0/1/0/0'; // 假设的路径
    const result = await post('/v1/browser/highlight-dom-path', {
      profile,
      path: domPath,
      color: 'blue',
      options: { channel: 'test-dom', sticky: true }
    });
    log(`  ✓ domPath: ${domPath}`);
    log(`  ✓ 结果: ${JSON.stringify(result)}`);
    log(`  ⏱️  等待2秒查看效果...`);
    await sleep(2000);
  } catch (e) {
    log(`  ✗ 失败: ${e.message}`);
  }

  // 清除
  await post('/v1/browser/clear-highlight', { profile, channel: 'test-dom' });
  await sleep(500);

  log('\n' + '='.repeat(60));
  log('基础高亮能力回环测试完成');
  log('='.repeat(60));
}

main().catch(e => {
  log(`\n❌ 测试失败: ${e.message}`);
  process.exit(1);
});
