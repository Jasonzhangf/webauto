import minimist from 'minimist';
import { runWorkflowById } from '../dist/modules/workflow/src/runner.js';

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
  // 开发阶段默认开启结构化 debug 日志（写入 ~/.webauto/logs/debug.jsonl），便于事后回放。
  if (!process.env.DEBUG) process.env.DEBUG = '1';

  const args = minimist(process.argv.slice(2));
  if (args.help || args.h) {
    console.log(`Usage:
  node scripts/run-xiaohongshu-phase1-2-34-v3.mjs --keyword <kw> --count <n> --env <env>

Options:
  --sessionId <id>      default: xiaohongshu_fresh
  --startAt <phase>     phase1|phase2|phase34 (default: phase1)
  --stopAfter <phase>   phase1|phase2|phase34 (default: phase34)

Notes:
  - Phase2 will trigger an in-page search. Re-running Phase2 too often may cause risk-control (even if not CAPTCHA).
  - For iterative debugging, run Phase1 once, Phase2 once, then run Phase34 repeatedly (startAt=phase34) to avoid repeated searches.
`);
    return;
  }
  const keyword = typeof args.keyword === 'string' ? args.keyword.trim() : '';
  const targetCount = Number(args.count || 20);
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
    const r2 = await runWorkflowById('xiaohongshu-phase2-links-v3', { sessionId, keyword, env, targetCount });
    if (!r2.success) {
      console.error('[XHS][v3] Phase2 failed:', r2.errors);
      process.exit(1);
    }
    const phase2Out = r2.results?.[r2.results.length - 1] || {};
    console.log(
      `[XHS][v3] Phase2 OK links=${phase2Out.finalCount ?? 'N/A'}/${phase2Out.targetCount ?? targetCount} path=${phase2Out.linksPath ?? 'N/A'}`,
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
