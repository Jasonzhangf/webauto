#!/usr/bin/env node

// 1688 简单交互式 Cookie 捕获器
// 打开 https://www.1688.com/（有界面），给定倒计时等待你手动登录，随后一次性保存全部 Cookie。

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

async function writeJSON(file, data) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

function parseArgs() {
  const out = { timeoutMs: 60000, cookiePath: '~/.webauto/cookies/1688-domestic.json' };
  for (const a of process.argv.slice(2)) {
    const m1 = a.match(/^--timeoutSec=(\d+)$/);
    if (m1) out.timeoutMs = parseInt(m1[1], 10) * 1000;
    const m2 = a.match(/^--cookiePath=(.+)$/);
    if (m2) out.cookiePath = m2[1];
  }
  return out;
}

async function countdown(ms) {
  const total = Math.ceil(ms / 1000);
  process.stdout.write(`\n⏳ 请在 ${total} 秒内完成 1688 登录...\n`);
  for (let left = total; left > 0; left--) {
    process.stdout.write(`  剩余: ${left}s    \r`);
    await new Promise(r => setTimeout(r, 1000));
  }
  process.stdout.write('\n');
}

async function main() {
  const homepage = 'https://www.1688.com/';
  const { timeoutMs, cookiePath } = parseArgs();
  const outPath = expandHome(cookiePath);
  const rawPath = outPath.replace(/\.json$/, '.raw.json');

  console.log('🚀 启动浏览器以登录 1688 ...');
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox','--disable-gpu','--lang=zh-CN'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  await page.goto(homepage, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('📍 已打开 1688 主页:', await page.title());
  console.log(`👉 倒计时 ${Math.ceil(timeoutMs/1000)} 秒，请完成登录。`);
  await countdown(timeoutMs);

  const cookies = await context.cookies();
  await writeJSON(rawPath, cookies); // 也保存一份原始备份
  await writeJSON(outPath, cookies);
  console.log(`✅ Cookie 已保存: ${outPath} （${cookies.length} 条）`);
  console.log(`📦 原始备份: ${rawPath}`);

  await browser.close();
}

main().catch(e => { console.error('💥 运行失败:', e?.message || e); process.exit(1); });

