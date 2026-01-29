#!/usr/bin/env node
/**
 * 点赞工作流（Like Comments）
 *
 * 前置：必须先有 Phase2 输出的 phase2-links.jsonl（安全链接，含 xsec_token）
 *
 * 流程：
 * 1. Phase 1: 启动浏览器会话（复用 xiaohongshu_fresh）
 * 2. Phase 3: 轮转 5 Tab，对评论区包含关键字的评论点赞
 *
 * 用法：
 *   node scripts/xiaohongshu/like-comments.mjs --keyword "手机膜" --like-keywords "好评,推荐" --env debug
 */

import minimist from 'minimist';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 执行: ${path.basename(scriptPath)} ${args.join(' ')}`);

    const child = spawn('node', [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      shell: false
    });

    child.on('error', (err) => reject(new Error(`脚本启动失败: ${err.message}`)));
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${path.basename(scriptPath)} 退出，代码 ${code}`));
    });
  });
}

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (argv.help || argv.h) {
    console.log(`
小红书评论点赞工作流

用法:
  node scripts/xiaohongshu/like-comments.mjs --keyword <关键字> --like-keywords <kw1,kw2> [--env <环境>]

参数:
  --keyword, -k       Phase2 采集用的关键字（必填）
  --like-keywords     评论筛选关键字，逗号分隔（必填）
  --env               环境标识（默认: debug）
  --skip-phase1       跳过 Phase 1 启动（假设浏览器已启动）

示例:
  node scripts/xiaohongshu/like-comments.mjs --keyword "手机膜" --like-keywords "好评,推荐" --env debug
    `);
    process.exit(0);
  }

  const keyword = argv.keyword || argv.k;
  const env = argv.env || 'debug';
  const likeKeywords = String(argv['like-keywords'] || '').trim();
  const skipPhase1 = argv['skip-phase1'] === true;

  if (!keyword) {
    console.error('❌ 错误：必须提供 --keyword 参数');
    process.exit(1);
  }
  if (!likeKeywords) {
    console.error('❌ 错误：必须提供 --like-keywords 参数，例如：--like-keywords "好评,推荐"');
    process.exit(1);
  }

  console.log(`\n❤️  评论点赞工作流`);
  console.log(`关键字: ${keyword}`);
  console.log(`点赞关键字: ${likeKeywords}`);
  console.log(`环境: ${env}`);

  if (!skipPhase1) {
    console.log('\n📍 Phase 1: 启动浏览器会话');
    await runScript(path.join(__dirname, 'phase1-boot.mjs'), []);
  } else {
    console.log('\n⏭️  跳过 Phase 1（假设浏览器已启动）');
  }

  console.log('\n📍 Phase 3: 点赞');
  await runScript(path.join(__dirname, 'phase3-interact.mjs'), [
    '--keyword', keyword,
    '--env', env,
    '--like-keywords', likeKeywords,
  ]);

  console.log('\n✅ 点赞工作流完成');
}

main().catch((err) => {
  console.error('❌ 点赞工作流失败:', err?.message || String(err));
  process.exit(1);
});

