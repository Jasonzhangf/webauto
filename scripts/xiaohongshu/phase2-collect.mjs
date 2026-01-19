#!/usr/bin/env node
/**
 * Phase 2 - 搜索与链接采集
 * 
 * 功能：
 * - 执行关键字搜索
 * - 滚动并采集指定数量的安全详情链接（包含 xsec_token）
 * - 保存到 ~/.webauto/download/xiaohongshu/{env}/{keyword}/links.json
 * 
 * 用法：
 *   node scripts/xiaohongshu/phase2-collect.mjs --keyword "手机膜" --target 50 --env debug
 */

import { resolveKeyword, resolveTarget, resolveEnv, PROFILE } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as waitSearchPermit } from '../../dist/modules/workflow/blocks/WaitSearchPermitBlock.js';
import { execute as phase2Search } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase2SearchBlock.js';
import { execute as phase2CollectLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase2CollectLinksBlock.js';

function nowMs() {
  return Date.now();
}

function formatDurationMs(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m${String(r).padStart(2, '0')}s`;
}

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return `${process.env.HOME}/${p.slice(2)}`;
  return p;
}

async function ensureDir(dir) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}

async function safeRm(targetPath) {
  const { rm } = await import('node:fs/promises');
  try {
    await rm(targetPath, { force: true, recursive: true });
  } catch {
    // ignore
  }
}

async function writeJsonl(filePath, rows) {
  const { writeFile } = await import('node:fs/promises');
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  await writeFile(filePath, body, 'utf8');
}

async function main() {
  const keyword = resolveKeyword();
  const target = resolveTarget();
  const env = resolveEnv();

  // 清理旧产物（同 env + keyword 下）
  const baseDir = expandHome(`~/.webauto/download/xiaohongshu/${env}/${keyword}`);
  await safeRm(`${baseDir}/phase2-links.jsonl`);
  await safeRm(`${baseDir}/run.log`);
  await safeRm(`${baseDir}/run-events.jsonl`);
  await safeRm(`${baseDir}/click-trace`);

  // 初始化日志
  const runContext = initRunLogging({ env, keyword, logMode: 'single' });

  console.log(`🔍 Phase 2: 搜索与链接采集 [runId: ${runContext.runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`目标数量: ${target}`);
  console.log(`环境: ${env}`);

  // 获取会话锁
  const lock = createSessionLock({ profileId: PROFILE, lockType: 'phase2' });
  const acquired = lock.acquire();
  
  if (!acquired) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    process.exit(1);
  }

  try {
    emitRunEvent('phase2_start', { keyword, target, env });

    const t0 = nowMs();
    emitRunEvent('phase2_timing', { stage: 'start', t0 });

    // 1. SearchGate 节流许可申请
    console.log(`⏳ 申请搜索许可...`);
    const tPermit0 = nowMs();
    const permitResult = await waitSearchPermit({ sessionId: PROFILE });
    const tPermit1 = nowMs();
    console.log(`⏱️  许可申请耗时: ${formatDurationMs(tPermit1 - tPermit0)}`);
    emitRunEvent('phase2_timing', { stage: 'permit_done', ms: tPermit1 - tPermit0 });
    if (!permitResult.granted) {
      throw new Error(`搜索许可申请失败: ${permitResult.error || '未知错误'}`);
    }

    // 2. 执行搜索（输入 + 触发）
    const tSearch0 = nowMs();
    const searchResult = await phase2Search({ keyword });
    const tSearch1 = nowMs();
    console.log(`⏱️  搜索耗时: ${formatDurationMs(tSearch1 - tSearch0)}`);
    emitRunEvent('phase2_timing', { stage: 'search_done', ms: tSearch1 - tSearch0 });
    if (!searchResult.success) {
      throw new Error(`搜索失败: ${searchResult.finalUrl}`);
    }

    const tCollect0 = nowMs();
    const collectResult = await phase2CollectLinks({ keyword, targetCount: target, env });
    const tCollect1 = nowMs();
    console.log(`⏱️  采集耗时: ${formatDurationMs(tCollect1 - tCollect0)}`);
    emitRunEvent('phase2_timing', { stage: 'collect_done', ms: tCollect1 - tCollect0 });
    const results = collectResult.links || [];

    const outPath = expandHome(`~/.webauto/download/xiaohongshu/${env}/${keyword}/phase2-links.jsonl`);
    const outDir = outPath.split('/').slice(0, -1).join('/');
    await ensureDir(outDir);
    await writeJsonl(outPath, results);

    const t1 = nowMs();
    const totalMs = t1 - t0;
    console.log(`⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    emitRunEvent('phase2_timing', { stage: 'done', ms: totalMs, count: results.length });

    console.log(`✅ 采集完成，共 ${results.length} 条链接`);
    console.log(`📁 保存路径: ${outPath}`);
    emitRunEvent('phase2_done', { outPath, count: results.length });

    console.log('\n📊 采集结果：');
    console.log(`   总链接数: ${results.length}`);
    console.log(`   输出路径: ${outPath}`);
    console.log(`\n✅ Phase 2 完成`);

  } catch (err) {
    emitRunEvent('phase2_error', { error: safeStringify(err) });
    console.error('\n❌ Phase 2 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    lock.release();
  }
}

main();
