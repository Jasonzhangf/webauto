#!/usr/bin/env node
/**
 * webauto weibo video — 解析微博/小红书视频真实链接
 *
 * 用法：
 *   webauto weibo video http://t.cn/AXIt31Y5
 *   webauto weibo video https://weibo.com/tv/show/1034:xxx
 *   webauto weibo video -p xhs-qa-1 https://xhslink.com/xxx
 */

import { extractVideoUrl } from '../../../modules/camo-runtime/src/autoscript/action-providers/weibo/video-ops.mjs';

const rawArgv = process.argv.slice(2);
const args = {};
const positional = [];

for (let i = 0; i < rawArgv.length; i++) {
  const a = rawArgv[i];
  if (a === '--help' || a === '-h') { args.help = true; continue; }
  if (a === '-p' || a === '--profile') { args.profile = rawArgv[++i]; continue; }
  if (a === '--json' || a === '-j') { args.json = true; continue; }
  if (a === '--copy' || a === '-c') { args.copy = true; continue; }
  if (a.startsWith('--')) {
    const key = a.slice(2);
    if (i + 1 < rawArgv.length && !rawArgv[i + 1].startsWith('-')) {
      args[key] = rawArgv[++i];
    } else {
      args[key] = true;
    }
    continue;
  }
  positional.push(a);
}

if (args.help) {
  console.log(`webauto weibo video — 解析视频真实链接

Usage:
  webauto weibo video <url> [options]

Arguments:
  <url>                 微博短链 (t.cn) / 微博链接 / 小红书链接

Options:
  -p, --profile <id>    camo profile ID（默认 weibo）
  -c, --copy            复制视频链接到剪贴板
  -j, --json            输出完整 JSON
  -h, --help            显示帮助

Examples:
  webauto weibo video http://t.cn/AXIt31Y5
  webauto weibo video https://weibo.com/tv/show/1034:xxx
  webauto weibo video -p xhs-qa-1 https://xhslink.com/xxx
`);
  process.exit(0);
}

const targetUrl = positional[0];
if (!targetUrl) {
  console.error('❌ 缺少 URL 参数。用法: webauto weibo video <url>');
  process.exit(1);
}

const profileId = String(args.profile || 'weibo').trim();

const t0 = Date.now();
const result = await extractVideoUrl(profileId, targetUrl);
const elapsed = Date.now() - t0;

if (!result.ok) {
  console.error(`❌ 解析失败: ${result.error} — ${result.message || ''}`);
  process.exit(1);
}

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`✅ 视频解析成功 (${elapsed}ms)`);
  console.log(`   平台: ${result.platform}`);
  console.log(`   来源: ${result.resolvedUrl}`);
  if (result.author) console.log(`   作者: ${result.author}`);
  if (result.title) console.log(`   标题: ${result.title}`);
  console.log(`   视频: ${result.videoUrl}`);
}

if (args.copy && result.videoUrl) {
  const { clipboard } = await import('node:clipboardy');
  try {
    await clipboard.write(result.videoUrl);
    console.log(`   📋 已复制到剪贴板`);
  } catch {
    // fallback: use pbcopy on macOS
    const { execSync } = await import('node:child_process');
    execSync(`printf '%s' ${JSON.stringify(result.videoUrl)} | pbcopy`);
    console.log(`   📋 已复制到剪贴板`);
  }
}
