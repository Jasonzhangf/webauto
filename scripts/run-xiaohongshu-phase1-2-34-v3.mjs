import minimist from 'minimist';
import { runWorkflowById } from '../dist/modules/workflow/src/runner.js';
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// 版本管理
const VERSION = '3.0.0';
const REQUIRED_NODE_VERSION = 22;

// 环境检查
function checkEnvironment() {
  const currentVersion = parseInt(process.version.slice(1));

  if (currentVersion < REQUIRED_NODE_VERSION) {
    console.error(`❌ Node.js 版本过低`);
    console.error(`   当前版本: ${process.version}`);
    console.error(`   需要版本: >=${REQUIRED_NODE_VERSION}.0.0`);
    console.error(`   请访问 https://nodejs.org/ 下载安装最新版本`);
    process.exit(1);
  }

  // 检查必要的构建产物
  const requiredPaths = [
    '../dist/modules/workflow/src/runner.js',
    '../dist/services',
    '../dist/sharedmodule'
  ];

  const missingPaths = [];
  for (const relPath of requiredPaths) {
    const absPath = new URL(relPath, import.meta.url).pathname;
    if (!existsSync(absPath)) {
      missingPaths.push(relPath);
    }
  }

  if (missingPaths.length > 0) {
    console.error(`❌ 缺少必要的构建产物，请先运行: npm run build:services`);
    console.error(`   缺失文件: ${missingPaths.join(', ')}`);
    process.exit(1);
  }
}

// 错误恢复机制
function setupErrorHandlers() {
  process.on('unhandledRejection', (err) => {
    console.error('\n[FATAL] 未捕获的异常:', err?.message || String(err));

    // 保存崩溃状态
    try {
      const crashDir = join(homedir(), '.webauto', 'logs');
      const crashFile = join(crashDir, 'crash-state.json');
      const crashData = {
        time: new Date().toISOString(),
        version: VERSION,
        error: err?.message || String(err),
        stack: err?.stack || 'N/A',
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      };

      writeFileSync(crashFile, JSON.stringify(crashData, null, 2));
      console.error(`[FATAL] 崩溃信息已保存到: ${crashFile}`);
    } catch (saveErr) {
      // 忽略保存失败
    }

    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n\n[XHS][v3] 用户中断，正在退出...');
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    console.log('\n[XHS][v3] 收到终止信号，正在退出...');
    process.exit(143);
  });
}

function normalizePhase(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  if (v === '1' || v === 'phase1') return 'phase1';
  if (v === '2' || v === 'phase2') return 'phase2';
  if (v === '34' || v === 'phase34') return 'phase34';
  return null;
}

function phaseOrder(phase) {
  if (phase === 'phase1') return 1;
  if (phase === 'phase2') return 2;
  if (phase === 'phase34') return 34;
  return 999;
}

async function main() {
  // 设置错误处理
  setupErrorHandlers();

  // 检查环境
  checkEnvironment();

  // 开发阶段默认开启结构化 debug 日志（写入 ~/.webauto/logs/debug.jsonl），便于事后回放。
  if (!process.env.DEBUG) process.env.DEBUG = '1';

  const args = minimist(process.argv.slice(2));

  // 版本信息
  if (args.version || args.v) {
    console.log(`小红书采集工具 v${VERSION}`);
    console.log(`Node.js: ${process.version}`);
    console.log(`平台: ${process.platform}-${process.arch}`);
    return;
  }

  if (args.help || args.h) {
    console.log(`小红书采集工具 v${VERSION}

Usage:
  node scripts/run-xiaohongshu-phase1-2-34-v3.mjs --keyword <kw> --count <n> --env <env>

Options:
  --keyword <kw>        搜索关键词（必填）
  --count <n>           目标采集数量（默认: 20）
  --sessionId <id>      会话ID（默认: xiaohongshu_fresh）
  --startAt <phase>     起始阶段: phase1|phase2|phase34（默认: phase1）
  --stopAfter <phase>   结束阶段: phase1|phase2|phase34（默认: phase34）
  --linksCount <n>      Phase2 链接目标数（默认: max(count*2, count+30)）
  --env <env>           运行环境（默认: debug）
  --version, -v         显示版本信息
  --help, -h            显示此帮助信息

Examples:
  # 完整运行（Phase1 + Phase2 + Phase34）
  node scripts/run-xiaohongshu-phase1-2-34-v3.mjs --keyword "手机壳" --count 50 --env prod

  # 仅运行 Phase1（登录）
  node scripts/run-xiaohongshu-phase1-2-34-v3.mjs --keyword "测试" --stopAfter phase1

  # 从 Phase34 开始（假设已运行过 Phase2）
  node scripts/run-xiaohongshu-phase1-2-34-v3.mjs --keyword "测试" --startAt phase34 --count 20

Notes:
  - Phase2 会触发站内搜索，频繁运行可能触发风控（即使未出现验证码）
  - 迭代调试建议：Phase1 运行一次 → Phase2 运行一次 → Phase34 反复运行
  - 数据保存在: ~/.webauto/download/xiaohongshu/{env}/{keyword}/
`);
    return;
  }
  const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
  const targetCount = Number(args.count || 20);
  const linksCountArg = Number(args.linksCount || 0);
  const env = typeof args.env === 'string' && args.env.trim() ? String(args.env).trim() : 'debug';
  const sessionId = typeof args.sessionId === 'string' && args.sessionId.trim() ? String(args.sessionId).trim() : 'xiaohongshu_fresh';

  const startAt = normalizePhase(args.startAt) || 'phase1';
  const stopAfter = normalizePhase(args.stopAfter) || 'phase34';
  if (phaseOrder(startAt) > phaseOrder(stopAfter)) {
    console.error(`Invalid phase range: startAt=${startAt} > stopAfter=${stopAfter}`);
    process.exit(1);
  }

  if (!keyword) {
    console.error('Missing --keyword');
    process.exit(1);
  }
  if (!Number.isFinite(targetCount) || targetCount <= 0) {
    console.error(`Invalid --count: ${String(args.count)}`);
    process.exit(1);
  }
  const phase2TargetCount =
    Number.isFinite(linksCountArg) && linksCountArg > 0
      ? Math.floor(linksCountArg)
      : Math.max(targetCount + 30, targetCount * 2);

  console.log(`[XHS][v3] Phase1 -> Phase2 -> Phase34`);
  console.log(`[XHS][v3] keyword="${keyword}" count=${targetCount} env="${env}" sessionId="${sessionId}"`);
  console.log(`[XHS][v3] startAt=${startAt} stopAfter=${stopAfter}`);

  // Phase1：仅会话 + 登录（视口固定高）
  if (phaseOrder(startAt) <= 1 && phaseOrder(stopAfter) >= 1) {
    console.log(`\n[XHS][v3] Phase1 (session+login) ...`);
    const r1 = await runWorkflowById('xiaohongshu-phase1-v3', { sessionId, keyword, env, targetCount });
    if (!r1.success) {
      console.error('[XHS][v3] Phase1 failed:', r1.errors);
      process.exit(1);
    }
    console.log(`[XHS][v3] Phase1 OK`);
  }
  if (stopAfter === 'phase1') {
    console.log(`\n[XHS][v3] Done (stopAfter=phase1)`);
    return;
  }

  // Phase2：搜索 + 链接采集（写盘 phase2-links.jsonl）
  if (phaseOrder(startAt) <= 2 && phaseOrder(stopAfter) >= 2) {
    console.log(`\n[XHS][v3] Phase2 (collect links) ...`);
    console.log(`[XHS][v3] Phase2 target links=${phase2TargetCount} (final notes target=${targetCount})`);
    const r2 = await runWorkflowById('xiaohongshu-phase2-links-v3', { sessionId, keyword, env, targetCount: phase2TargetCount });
    if (!r2.success) {
      console.error('[XHS][v3] Phase2 failed:', r2.errors);
      process.exit(1);
    }
    const phase2Out = r2.results?.[r2.results.length - 1] || {};
    console.log(
      `[XHS][v3] Phase2 OK links=${phase2Out.finalCount ?? 'N/A'}/${phase2Out.targetCount ?? phase2TargetCount} path=${phase2Out.linksPath ?? 'N/A'}`,
    );
  }
  if (stopAfter === 'phase2') {
    console.log(`\n[XHS][v3] Done (stopAfter=phase2)`);
    return;
  }

  // Phase34：从 Phase2 links 采集详情+评论（评论 rotate4 多 tab）
  if (phaseOrder(startAt) <= 34 && phaseOrder(stopAfter) >= 34) {
    console.log(`\n[XHS][v3] Phase34 (detail+comments from links, multi-note tabs) ...`);
    const r34 = await runWorkflowById('xiaohongshu-phase34-from-links-v3', { sessionId, keyword, env, targetCount });
    if (!r34.success) {
      console.error('[XHS][v3] Phase34 failed:', r34.errors);
      process.exit(1);
    }
    const phase34Out = r34.results?.[r34.results.length - 1] || {};
    console.log(
      `[XHS][v3] Phase34 OK notes=${phase34Out.finalPersistedCount ?? 'N/A'}/${phase34Out.targetCount ?? targetCount} dir=${phase34Out.keywordDir ?? 'N/A'}`,
    );
  }

  console.log(`\n[XHS][v3] Done`);
}

main().catch((err) => {
  console.error('[XHS][v3] Unexpected error:', err?.message || String(err));
  process.exit(1);
});
