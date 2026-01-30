#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * 搜索采集工作流（Search & Harvest）
 *
 * 完整流程：
 * 1. Phase 1: 启动浏览器会话（复用 xiaohongshu_fresh）
 * 2. Phase 2: 搜索 + 链接采集
 * 3. Phase 4: 详情 + 评论内容采集
 *
 * 用法：
 *   node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50 --env debug
 *
 * 输出：
 *   ~/.webauto/download/xiaohongshu/{env}/{keyword}/
 *   ├── phase2-links.jsonl          # 采集的链接列表
 *   ├── {noteId}/
 *   │   ├── README.md               # 详情内容
 *   │   ├── images/                 # 图片
 *   │   └── comments.md             # 评论
 *   └── run.log                     # 运行日志
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

    child.on('error', (err) => {
      reject(new Error(`脚本启动失败: ${err.message}`));
    });

    child.on('exit', (code) => {
      if (code === 0) {
        console.log(`✅ ${path.basename(scriptPath)} 完成`);
        resolve();
      } else {
        reject(new Error(`${path.basename(scriptPath)} 退出，代码 ${code}`));
      }
    });
  });
}

async function main() {
  const argv = minimist(process.argv.slice(2));

  if (argv.help || argv.h) {
    console.log(`
小红书搜索采集工作流

用法:
  node scripts/xiaohongshu/collect-content.mjs --keyword <关键字> --target <数量> [--env <环境>]

参数:
  --keyword, -k    搜索关键字（必填）
  --target, -t     目标采集数量（必填）
  --env            环境标识（默认: debug）
  --skip-phase1    跳过 Phase 1 启动（假设浏览器已启动）
  --skip-phase2    跳过 Phase 2 搜索采集（假设链接已存在）

示例:
  node scripts/xiaohongshu/collect-content.mjs --keyword "手机膜" --target 50
  node scripts/xiaohongshu/collect-content.mjs -k "手机壳" -t 100 --env prod
    `);
    process.exit(0);
  }

  const keyword = argv.keyword || argv.k;
  const target = argv.target || argv.t;
  const env = argv.env || 'debug';
  const skipPhase1 = argv['skip-phase1'] === true;
  const skipPhase2 = argv['skip-phase2'] === true;

  if (!keyword) {
    console.error('❌ 错误：必须提供 --keyword 参数');
    process.exit(1);
  }

  if (!target) {
    console.error('❌ 错误：必须提供 --target 参数');
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════╗
║   小红书搜索采集工作流               ║
╚════════════════════════════════════════╝

关键字: ${keyword}
目标数量: ${target}
环境: ${env}
  `);

  const t0 = Date.now();

  try {
    // Phase 1: 启动浏览器会话
    if (!skipPhase1) {
      console.log('\n📍 Phase 1: 启动浏览器会话');
      await runScript(
        path.join(__dirname, 'phase1-boot.mjs'),
        []
      );
    } else {
      console.log('\n⏭️  跳过 Phase 1（假设浏览器已启动）');
    }

    // Phase 2: 搜索 + 链接采集
    if (!skipPhase2) {
      console.log('\n📍 Phase 2: 搜索与链接采集');
      await runScript(
        path.join(__dirname, 'phase2-collect.mjs'),
        ['--keyword', keyword, '--target', String(target), '--env', env]
      );
    } else {
      console.log('\n⏭️  跳过 Phase 2（假设链接已存在）');
    }

    // Phase 4: 详情 + 评论采集
    console.log('\n📍 Phase 4: 详情与评论采集');
    await runScript(
      path.join(__dirname, 'phase4-harvest.mjs'),
      ['--keyword', keyword, '--env', env]
    );

    const elapsed = Math.floor((Date.now() - t0) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    console.log(`
╔════════════════════════════════════════╗
║   ✅ 采集工作流完成                   ║
╚════════════════════════════════════════╝

总耗时: ${minutes}分${seconds}秒
输出路径: ~/.webauto/download/xiaohongshu/${env}/${keyword}/
    `);

  } catch (err) {
    console.error(`
╔════════════════════════════════════════╗
║   ❌ 采集工作流失败                   ║
╚════════════════════════════════════════╝

错误: ${err.message}
    `);
    process.exit(1);
  }
}

main();

