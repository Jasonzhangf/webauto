#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';

ensureUtf8Console();

/**
 * Phase 4 - 内容采集（Harvest）
 *
 * 功能：
 * - 读取 Phase2 采集的安全链接
 * - 校验链接有效性（xsec_token + 关键字匹配）
 * - 循环处理每条链接：
 *   - 打开详情页
 *   - 提取详情内容（标题、正文、作者、图片）
 *   - 采集评论（支持分批）
 *   - 持久化结果
 *   - 返回搜索页继续下一条
 *
 * 用法：
 *   node scripts/xiaohongshu/phase4-harvest.mjs --keyword "手机膜" --env debug
 */

import { resolveKeyword, resolveEnv, PROFILE } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as processSingleNote } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ProcessSingleNoteBlock.js';
import { mergeNotesMarkdown } from '../../dist/modules/workflow/blocks/helpers/mergeXhsMarkdown.js';
import minimist from 'minimist';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assignShards, listProfilesForPool } from './lib/profilepool.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (p === '~') {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return homeDir || p;
  }
  if (p.startsWith('~/')) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) return p;
    return path.join(homeDir, p.slice(2));
  }
  return p;
}

async function readJsonl(filePath) {
  const { readFile } = await import('node:fs/promises');
  try {
    const content = await readFile(filePath, 'utf8');
    return content.trim().split('\n').filter(Boolean).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

function stripArgs(argv, keys) {
  const drop = new Set(keys);
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (drop.has(a)) {
      if (i + 1 < argv.length && !String(argv[i + 1] || '').startsWith('--')) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

async function runNode(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      env: process.env,
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const keyword = resolveKeyword();
  const env = resolveEnv();
  const args = minimist(process.argv.slice(2));
  const linksPath = String(args.links || '').trim() || undefined;
  const shardIndex = args['shard-index'] != null ? Number(args['shard-index']) : undefined;
  const shardCount = args['shard-count'] != null ? Number(args['shard-count']) : undefined;
  const profilesArg = String(args.profiles || '').trim();
  const poolKeyword = String(args.profilepool || '').trim();
  const shardedChild = args['sharded-child'] === true || args['sharded-child'] === '1' || args['sharded-child'] === 1;
  const skipPhase1 = args['skip-phase1'] === true || args['skip-phase1'] === '1' || args['skip-phase1'] === 1;

  // Multi-profile orchestrator (auto-sharding)
  if (!shardedChild && (profilesArg || poolKeyword)) {
    const profiles = profilesArg
      ? profilesArg.split(',').map((s) => s.trim()).filter(Boolean)
      : listProfilesForPool(poolKeyword);
    if (profiles.length === 0) {
      console.error('❌ 未找到可用 profiles');
      console.error(`   profilesRoot: ~/.webauto/profiles`);
      console.error(`   hint: node scripts/profilepool.mjs add "${poolKeyword || keyword}"`);
      process.exit(2);
    }

    const assignments = assignShards(profiles);
    console.log(`🧩 Phase4 multi-profile: ${assignments.length} shards`);
    assignments.forEach((a) => console.log(`- ${a.profileId} => shard ${a.shardIndex}/${a.shardCount}`));

    const scriptPath = fileURLToPath(import.meta.url);
    const baseArgs = stripArgs(process.argv.slice(2), [
      '--profiles',
      '--profilepool',
      '--profile',
      '--shard-index',
      '--shard-count',
      '--sharded-child',
      '--skip-phase1',
    ]);

    for (const a of assignments) {
      console.log(`\n➡️  shard ${a.shardIndex}/${a.shardCount} profile=${a.profileId}`);
      if (!skipPhase1) {
        await runNode(path.join(__dirname, 'phase1-boot.mjs'), ['--profile', a.profileId]);
      }
      await runNode(scriptPath, [
        ...baseArgs,
        '--profile',
        a.profileId,
        '--shard-index',
        String(a.shardIndex),
        '--shard-count',
        String(a.shardCount),
        '--sharded-child',
        '1',
      ]);
    }
    return;
  }

  // 初始化日志
  const runContext = initRunLogging({ env, keyword, logMode: 'single' });

  console.log(`📝 Phase 4: 内容采集（Harvest） [runId: ${runContext.runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`环境: ${env}`);
  console.log(`Profile: ${PROFILE}`);
  if (linksPath) console.log(`links: ${linksPath}`);
  if (shardIndex != null && shardCount != null) console.log(`shard: ${shardIndex}/${shardCount}`);

  // 获取会话锁
  const lock = createSessionLock({ profileId: PROFILE, lockType: 'phase4' });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch (e) {
    console.log('⚠️  会话锁已被其他进程持有，退出');
    console.log(String(e?.message || e));
    process.exit(1);
  }

  try {
    emitRunEvent('phase4_start', { keyword, env });

    const t0 = nowMs();
    emitRunEvent('phase4_timing', { stage: 'start', t0 });

    // 1. 校验链接
    console.log(`\n🔍 步骤 1: 校验链接...`);
    const tValidate0 = nowMs();
    const validateResult = await validateLinks({
      keyword,
      env,
      profile: PROFILE,
      ...(linksPath ? { linksPath } : {}),
      ...(shardIndex != null ? { shardIndex } : {}),
      ...(shardCount != null ? { shardCount } : {}),
    });
    const tValidate1 = nowMs();
    console.log(`⏱️  校验耗时: ${formatDurationMs(tValidate1 - tValidate0)}`);
    emitRunEvent('phase4_timing', { stage: 'validate_done', ms: tValidate1 - tValidate0 });

    if (!validateResult.success) {
      throw new Error(`链接校验失败: ${validateResult.error}`);
    }

    const validLinks = validateResult.links || [];
    console.log(`✅ 有效链接: ${validLinks.length} 条`);

    if (validLinks.length === 0) {
      console.log('⚠️  没有有效链接，请先运行 Phase2 采集链接');
      process.exit(0);
    }

    // 2. 循环处理每条链接
    console.log(`\n📝 步骤 2: 采集详情与评论...`);
    const results = [];
    const errors = [];

    for (let i = 0; i < validLinks.length; i++) {
      const link = validLinks[i];
      const progress = `[${i + 1}/${validLinks.length}]`;

      console.log(`\n${progress} 处理: ${link.noteId}`);

      const tNote0 = nowMs();
      const result = await processSingleNote({
        noteId: link.noteId,
        safeUrl: link.safeUrl,
        searchUrl: link.searchUrl,
        keyword,
        env,
        profile: PROFILE,
        maxCommentRounds: 50,
        commentBatchSize: 50,
      });
      const tNote1 = nowMs();

      console.log(`⏱️  耗时: ${formatDurationMs(tNote1 - tNote0)}`);

      if (result.success) {
        results.push(result);
        console.log(`✅ ${progress} 成功`);
      } else {
        errors.push({ noteId: link.noteId, error: result.error });
        console.log(`❌ ${progress} 失败: ${result.error}`);
      }

      emitRunEvent('phase4_note_done', {
        index: i,
        total: validLinks.length,
        noteId: link.noteId,
        success: result.success,
        ms: tNote1 - tNote0,
      });
    }

    // 3. 汇总
    const t1 = nowMs();
    const totalMs = t1 - t0;
    console.log(`\n⏱️  总耗时: ${formatDurationMs(totalMs)}`);
    emitRunEvent('phase4_timing', { stage: 'done', ms: totalMs, count: results.length });

    console.log(`\n📊 采集结果：`);
    console.log(`   成功: ${results.length} 条`);
    console.log(`   失败: ${errors.length} 条`);

    if (errors.length > 0) {
      console.log(`\n❌ 失败列表：`);
      errors.forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.noteId}: ${e.error}`);
      });
    }

    const mergeResult = await mergeNotesMarkdown({
      platform: 'xiaohongshu',
      env,
      keyword,
    });
    if (mergeResult.success) {
      console.log(`\n📄 合并 Markdown 完成: ${mergeResult.outputPath} (notes=${mergeResult.mergedNotes})`);
    } else {
      console.warn(`\n⚠️ 合并 Markdown 跳过: ${mergeResult.error}`);
    }

    console.log(`\n✅ Phase 4 完成`);
    emitRunEvent('phase4_done', { success: results.length, failed: errors.length });

  } catch (err) {
    emitRunEvent('phase4_error', { error: safeStringify(err) });
    console.error('\n❌ Phase 4 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    lockHandle?.release?.();
  }
}

main();
