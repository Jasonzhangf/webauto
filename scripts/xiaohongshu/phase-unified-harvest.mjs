#!/usr/bin/env node
import { ensureUtf8Console } from '../lib/cli-encoding.mjs';
import { ensureCoreServices } from '../lib/ensure-core-services.mjs';

ensureUtf8Console();

import { ensureServicesHealthy, restoreBrowserState } from './lib/recovery.mjs';
import { ensureRuntimeReady } from './lib/runtime-ready.mjs';
import minimist from 'minimist';
import { spawn, execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { promises as fs } from 'node:fs';

import { resolveKeyword, resolveEnv } from './lib/env.mjs';
import { initRunLogging, emitRunEvent, safeStringify } from './lib/logger.mjs';
import { createSessionLock } from './lib/session-lock.mjs';
import { requestProfile, releaseProfile, heartbeat } from '../../services/unified-gate/client.mjs';
import { assignShards, listProfilesForPool } from './lib/profilepool.mjs';
import { parseFlag, splitCsv, buildOperationPlan, matchHarvestedComments } from './lib/unified-pipeline.mjs';

import { execute as validateLinks } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ValidateLinksBlock.js';
import { execute as openDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34OpenDetailBlock.js';
import { execute as extractDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34ExtractDetailBlock.js';
import { execute as collectComments } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34CollectCommentsBlock.js';
import { execute as persistDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34PersistDetailBlock.js';
import { execute as closeDetail } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34CloseDetailBlock.js';
import { execute as openTabs } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase34OpenTabsBlock.js';
import { execute as interact } from '../../dist/modules/xiaohongshu/app/src/blocks/Phase3InteractBlock.js';
import { execute as matchComments } from '../../dist/modules/xiaohongshu/app/src/blocks/MatchCommentsBlock.js';
import { execute as replyInteract } from '../../dist/modules/xiaohongshu/app/src/blocks/ReplyInteractBlock.js';
import { controllerAction, delay } from '../../dist/modules/xiaohongshu/app/src/utils/controllerAction.js';
import { resolveDownloadRoot } from '../../dist/modules/state/src/paths.js';
import { updateXhsCollectState } from '../../dist/modules/state/src/xiaohongshu-collect-state.js';

import { UNIFIED_API_URL } from './lib/core-daemon.mjs';
const execFileAsync = promisify(execFile);
const OCR_START_MARKER = '<!-- WEBAUTO_OCR_START -->';
const OCR_END_MARKER = '<!-- WEBAUTO_OCR_END -->';
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

function parsePositiveOrUnlimited(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
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

async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function writeJsonl(filePath, rows) {
  const text = rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '');
  await fs.writeFile(filePath, text, 'utf8');
}


async function commandExists(command) {
  try {
    await execFileAsync('which', [String(command || '').trim()], { timeout: 3000, maxBuffer: 64 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function resolveOcrCommand(preferred = '') {
  const pref = String(preferred || '').trim();
  if (pref) {
    if (await commandExists(pref)) return pref;
    throw new Error(`ocr_command_not_found:${pref}`);
  }

  if (await commandExists('deepseek-ocr')) return 'deepseek-ocr';
  if (await commandExists('dsocr')) return 'dsocr';
  throw new Error('ocr_command_not_found:deepseek-ocr|dsocr');
}

function formatOcrSection(results) {
  const lines = [];
  lines.push('## 图片 OCR');
  lines.push('');
  for (const item of results) {
    lines.push(`### ${item.imageName}`);
    lines.push('');
    if (item.success) {
      lines.push(item.text || '（OCR 结果为空）');
    } else {
      lines.push(`（OCR 失败：${item.error || 'unknown_error'}）`);
    }
    lines.push('');
  }
  return [OCR_START_MARKER, ...lines, OCR_END_MARKER].join('\n');
}

async function upsertOcrSectionInReadme(readmePath, ocrResults) {
  let content = '';
  try {
    content = await fs.readFile(readmePath, 'utf8');
  } catch {
    content = '';
  }

  const section = formatOcrSection(ocrResults);
  const start = content.indexOf(OCR_START_MARKER);
  const end = content.indexOf(OCR_END_MARKER);
  if (start >= 0 && end > start) {
    const before = content.slice(0, start).replace(/\s+$/, '');
    const after = content.slice(end + OCR_END_MARKER.length).replace(/^\s+/, '');
    const merged = [before, section, after].filter(Boolean).join('\n\n');
    await fs.writeFile(readmePath, `${merged}\n`, 'utf8');
    return;
  }

  const merged = [content.replace(/\s+$/, ''), section].filter(Boolean).join('\n\n');
  await fs.writeFile(readmePath, `${merged}\n`, 'utf8');
}

async function runOcrForImage(ocrCommand, imagePath) {
  const attempts = [
    [imagePath, '--format', 'markdown'],
    [imagePath, '-f', 'markdown'],
    ['-f', 'markdown', imagePath],
    [imagePath],
  ];

  let lastErr = null;
  for (const args of attempts) {
    try {
      const { stdout, stderr } = await execFileAsync(ocrCommand, args, {
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
      });
      const text = String(stdout || '').trim();
      if (text) return { success: true, text, args };
      if (String(stderr || '').trim()) {
        lastErr = new Error(String(stderr || '').trim());
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(lastErr?.message || 'ocr_failed');
}

async function runNoteImagesOcr({ noteDir, ocrCommand }) {
  const imagesDir = path.join(noteDir, 'images');
  const readmePath = path.join(noteDir, 'README.md');

  const entries = await fs.readdir(imagesDir, { withFileTypes: true }).catch(() => []);
  const images = entries
    .filter((ent) => ent.isFile() && /\.(png|jpe?g|webp|bmp)$/i.test(ent.name))
    .map((ent) => ent.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (images.length === 0) {
    return { readmePath, imageCount: 0, successCount: 0, failedCount: 0, results: [] };
  }

  const resolvedCommand = await resolveOcrCommand(ocrCommand);
  const results = [];

  for (const imageName of images) {
    const imagePath = path.join(imagesDir, imageName);
    try {
      const res = await runOcrForImage(resolvedCommand, imagePath);
      results.push({ imageName, success: true, text: res.text, args: res.args });
    } catch (err) {
      results.push({ imageName, success: false, text: '', error: err?.message || String(err) });
    }
  }

  await upsertOcrSectionInReadme(readmePath, results);

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.length - successCount;
  return {
    readmePath,
    imageCount: images.length,
    successCount,
    failedCount,
    results,
    command: resolvedCommand,
  };
}

function getPhase2LinksPath(downloadRoot, env, keyword) {
  return path.join(downloadRoot, 'xiaohongshu', env, keyword, 'phase2-links.jsonl');
}

async function countValidPhase2Links(filePath) {
  const rows = await readJsonl(filePath);
  const valid = rows.filter((item) => typeof item?.safeUrl === 'string' && item.safeUrl.includes('xsec_token'));
  return { total: rows.length, valid: valid.length };
}

async function ensurePhase2LinksReady({ profile, keyword, env, target, headless, autoBackfill }) {
  const downloadRoot = resolveDownloadRoot();
  const linksPath = getPhase2LinksPath(downloadRoot, env, keyword);
  const before = await countValidPhase2Links(linksPath);
  const need = Math.max(1, Number(target) || 1);

  emitRunEvent('phase_unified_links_check', {
    linksPath,
    total: before.total,
    valid: before.valid,
    target: need,
    autoBackfill,
  });

  if (before.valid >= need || !autoBackfill) {
    return { linksPath, before, after: before, backfilled: false };
  }

  console.log(`[Links] 当前有效链接 ${before.valid}/${need}，自动触发 Phase2 补齐...`);
  emitRunEvent('phase_unified_links_backfill_start', { beforeValid: before.valid, target: need, profile });

  const phase2Script = path.join(__dirname, 'phase2-collect.mjs');
  const phase2Args = [
    '--profile', profile,
    '--keyword', keyword,
    '--target', String(need),
    '--env', env,
    '--foreground',
    ...(headless ? ['--headless'] : []),
  ];
  await runNode(phase2Script, phase2Args);

  const after = await countValidPhase2Links(linksPath);
  emitRunEvent('phase_unified_links_backfill_done', {
    beforeValid: before.valid,
    afterValid: after.valid,
    target: need,
    linksPath,
  });

  return { linksPath, before, after, backfilled: true };
}

async function mergeComments(noteDir, noteId, comments) {
  const filePath = path.join(noteDir, 'comments.jsonl');
  const existing = await readJsonl(filePath);
  const seen = new Set(existing.map((r) => `${String(r.userId || '')}:${String(r.content || '')}`));
  const incoming = Array.isArray(comments) ? comments : [];
  const now = new Date().toISOString();

  const addedRows = [];
  for (const row of incoming) {
    const normalized = {
      noteId,
      userName: String(row?.userName || row?.user_name || ''),
      userId: String(row?.userId || row?.user_id || ''),
      content: String(row?.content || row?.text || ''),
      time: String(row?.time || row?.timestamp || ''),
      likeCount: Number(row?.likeCount || row?.like_count || 0),
      ts: now,
    };
    const key = `${normalized.userId}:${normalized.content}`;
    if (!normalized.content || seen.has(key)) continue;
    seen.add(key);
    addedRows.push(normalized);
  }

  const merged = [...existing, ...addedRows];
  await fs.mkdir(noteDir, { recursive: true });
  await writeJsonl(filePath, merged);
  return {
    filePath,
    existing: existing.length,
    added: addedRows.length,
    total: merged.length,
    mergedRows: merged,
  };
}

function buildMatchRule(keywords, mode, minHits) {
  if (!keywords.length) return null;
  if (mode === 'all') {
    return { must: keywords };
  }
  if (mode === 'atLeast') {
    return { any: keywords, minAnyMatches: Math.max(1, Number(minHits) || 1) };
  }
  return { any: keywords };
}

async function switchToTab(profile, tabIndex, apiUrl) {
  await controllerAction('browser:page:switch', { profileId: profile, index: tabIndex }, apiUrl).catch(() => null);
  await delay(450);
  const listRes = await controllerAction('browser:page:list', { profileId: profile }, apiUrl).catch(() => null);
  const pages = listRes?.pages || listRes?.data?.pages || [];
  const activeIndex = listRes?.activeIndex ?? listRes?.data?.activeIndex ?? -1;
  const activeUrl = pages.find((p) => p.active)?.url || '';
  return { activeIndex, activeUrl };
}

async function ensureTabAssignments(profile, tabCount, apiUrl) {
  const openTabsResult = await openTabs({
    profile,
    tabCount,
    unifiedApiUrl: apiUrl,
  });
  const tabs = Array.isArray(openTabsResult?.tabs) ? openTabsResult.tabs.slice(0, tabCount) : [];
  if (tabs.length === 0) {
    throw new Error('tab_pool_empty');
  }
  return tabs.map((tab, idx) => ({
    slotIndex: idx + 1,
    tabRealIndex: Number(tab?.index),
  }));
}

async function processSingleNote({
  profile,
  keyword,
  env,
  downloadRoot,
  link,
  operationPlan,
  config,
  slotIndex = null,
  tabRealIndex = null,
}) {
  const noteId = String(link?.noteId || '');
  const safeUrl = String(link?.safeUrl || '');
  const noteDir = path.join(downloadRoot, 'xiaohongshu', env, keyword, noteId);
  const likeEvidenceDir = path.join(downloadRoot, 'xiaohongshu', env, keyword, 'virtual-like', noteId);
  const result = {
    noteId,
    success: true,
    homepageOk: false,
    commentsTotal: 0,
    matchCount: 0,
    likedCount: 0,
    repliedCount: 0,
    ocrImages: 0,
    ocrFailedImages: 0,
    errors: [],
  };

  let detailOpened = false;
  let harvestedComments = [];
  let matchedFromHarvest = [];

  for (const op of operationPlan) {
    emitRunEvent('phase_unified_op_start', { noteId, op, slotIndex, tabRealIndex });

    try {
      if (op === 'detail_harvest') {
        if (!config.doHomepage && !config.doImages) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'disabled', slotIndex, tabRealIndex });
          continue;
        }

        const openRes = await openDetail({ noteId, safeUrl, profile, unifiedApiUrl: UNIFIED_API_URL });
        if (!openRes?.success) {
          throw new Error(openRes?.error || 'open_detail_failed');
        }
        detailOpened = true;

        const detailRes = await extractDetail({ noteId, profile, unifiedApiUrl: UNIFIED_API_URL });
        if (!detailRes?.success) {
          throw new Error(detailRes?.error || 'extract_detail_failed');
        }

        const persistRes = await persistDetail({
          noteId,
          detail: detailRes.detail || {},
          keyword,
          env,
          unifiedApiUrl: UNIFIED_API_URL,
        });
        if (!persistRes?.success) {
          throw new Error(persistRes?.error || 'persist_detail_failed');
        }

        result.homepageOk = true;

        if (config.doOcr) {
          emitRunEvent('phase_unified_ocr_start', {
            noteId,
            noteDir,
            readmePath: path.join(noteDir, 'README.md'),
          });
          try {
            const ocrRes = await runNoteImagesOcr({
              noteDir,
              ocrCommand: config.ocrCommand,
            });
            result.ocrImages += Number(ocrRes?.successCount || 0);
            result.ocrFailedImages += Number(ocrRes?.failedCount || 0);
            emitRunEvent('phase_unified_ocr_done', {
              noteId,
              noteDir,
              readmePath: ocrRes?.readmePath || path.join(noteDir, 'README.md'),
              imageCount: Number(ocrRes?.imageCount || 0),
              successCount: Number(ocrRes?.successCount || 0),
              failedCount: Number(ocrRes?.failedCount || 0),
              command: ocrRes?.command || null,
            });
          } catch (ocrErr) {
            const message = ocrErr?.message || String(ocrErr);
            result.ocrFailedImages += 1;
            emitRunEvent('phase_unified_ocr_error', { noteId, noteDir, error: message });
          }
        }

        emitRunEvent('phase_unified_op_done', {
          noteId,
          op,
          imageCount: Number(persistRes?.imageCount || 0),
        });
        continue;
      }

      if (op === 'comments_harvest') {
        if (!config.doComments && !config.doReply) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'disabled', slotIndex, tabRealIndex });
          continue;
        }

        if (!detailOpened) {
          const openRes = await openDetail({ noteId, safeUrl, profile, unifiedApiUrl: UNIFIED_API_URL });
          if (!openRes?.success) throw new Error(openRes?.error || 'open_detail_failed');
          detailOpened = true;
        }

        const cRes = await collectComments({
          sessionId: profile,
          unifiedApiUrl: UNIFIED_API_URL,
          maxRounds: config.commentRounds,
          batchSize: config.maxComments,
        });
        if (!cRes?.success) throw new Error(cRes?.error || 'collect_comments_failed');

        const persistComments = await mergeComments(noteDir, noteId, cRes.comments || []);
        harvestedComments = persistComments.mergedRows;
        result.commentsTotal = persistComments.total;

        emitRunEvent('phase_unified_op_done', {
          noteId,
          op,
          commentsAdded: persistComments.added,
          commentsTotal: persistComments.total,
          commentsPath: persistComments.filePath,
        });
        continue;
      }

      if (op === 'comment_match_gate') {
        if (!config.doLikes && !config.doReply) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'interaction_disabled', slotIndex, tabRealIndex });
          continue;
        }

        matchedFromHarvest = matchHarvestedComments(
          harvestedComments,
          config.matchKeywords,
          config.matchMode,
          config.matchMinHits,
        );
        result.matchCount = matchedFromHarvest.length;

        emitRunEvent('phase_unified_op_done', {
          noteId,
          op,
          matchCount: matchedFromHarvest.length,
          keywords: config.matchKeywords,
          mode: config.matchMode,
          minHits: config.matchMinHits,
        });
        continue;
      }

      if (op === 'comment_like') {
        if (!config.doLikes) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'disabled', slotIndex, tabRealIndex });
          continue;
        }

        const likeKeywords = config.likeKeywords.length ? config.likeKeywords : config.matchKeywords;
        if (likeKeywords.length === 0) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'no_like_keywords', slotIndex, tabRealIndex });
          continue;
        }

        const commentsPath = path.join(noteDir, 'comments.jsonl');
        await fs.mkdir(likeEvidenceDir, { recursive: true });
        const likeRes = await interact({
          sessionId: profile,
          noteId,
          safeUrl,
          likeKeywords,
          maxLikesPerRound: config.maxLikes,
          dryRun: config.dryRun,
          keyword,
          env,
          unifiedApiUrl: UNIFIED_API_URL,
          // 点赞支持独立运行：仅在已打开详情页时复用上下文，否则由互动块自行打开。
          reuseCurrentDetail: detailOpened,
          commentsAlreadyOpened: detailOpened,
          // 评论+点赞同屏统一：每轮提取可见评论，按开关决定是否落盘。
          collectComments: Boolean(config.doComments),
          persistCollectedComments: Boolean(config.doComments),
          commentsFilePath: commentsPath,
          onRound: (round) => {
            emitRunEvent('phase_unified_like_round', {
              noteId,
              slotIndex,
              tabRealIndex,
              ...round,
            });
          },
        });
        if (!likeRes?.success) throw new Error(likeRes?.error || 'like_failed');

        result.likedCount += Number(likeRes?.likedCount || 0);
        if (config.doComments) {
          result.commentsTotal = Number(likeRes?.commentsTotal || result.commentsTotal || 0);
        }
        emitRunEvent('phase_unified_op_done', {
          noteId,
          op,
          likedCount: Number(likeRes?.likedCount || 0),
          commentsAdded: Number(likeRes?.commentsAdded || 0),
          commentsTotal: Number(likeRes?.commentsTotal || 0),
          commentsPath: likeRes?.commentsPath || (config.doComments ? commentsPath : null),
          noteDir,
          likeEvidenceDir,
          reachedBottom: Boolean(likeRes?.reachedBottom),
        });
        continue;
      }

      if (op === 'comment_reply') {
        if (!config.doReply) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'disabled', slotIndex, tabRealIndex });
          continue;
        }

        if (matchedFromHarvest.length === 0) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'no_match', slotIndex, tabRealIndex });
          continue;
        }

        const rule = buildMatchRule(config.matchKeywords, config.matchMode, config.matchMinHits);
        if (!rule) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'no_rule', slotIndex, tabRealIndex });
          continue;
        }

        const locateRes = await matchComments({
          sessionId: profile,
          rule,
          unifiedApiUrl: UNIFIED_API_URL,
          maxScrolls: 8,
          maxItems: 60,
          maxMatches: 1,
          openComments: true,
          highlightOnFirstMatch: true,
          screenshotOnFirstMatch: true,
          noteId,
          env,
          keyword,
        });

        const firstMatch = locateRes?.matches?.[0] || null;
        if (!firstMatch || Number(firstMatch.index) < 0) {
          emitRunEvent('phase_unified_op_skip', { noteId, op, reason: 'match_not_visible', slotIndex, tabRealIndex });
          continue;
        }

        const replyRes = await replyInteract({
          sessionId: profile,
          noteId,
          commentVisibleIndex: Number(firstMatch.index),
          replyText: config.replyText,
          dryRun: config.dryRun,
          unifiedApiUrl: UNIFIED_API_URL,
          env,
          keyword,
          dev: true,
        });

        if (!replyRes?.success) {
          throw new Error(replyRes?.error || 'reply_failed');
        }

        result.repliedCount += replyRes?.typed ? 1 : 0;
        emitRunEvent('phase_unified_op_done', {
          noteId,
          op,
          typed: Boolean(replyRes?.typed),
          screenshot: replyRes?.evidence?.screenshot || null,
        });
        continue;
      }

      if (op === 'next_note') {
        emitRunEvent('phase_unified_op_done', { noteId, op, slotIndex, tabRealIndex });
      }
    } catch (err) {
      const message = err?.message || String(err);
      result.success = false;
      result.errors.push(`${op}: ${message}`);
      emitRunEvent('phase_unified_op_error', { noteId, op, error: message, slotIndex, tabRealIndex });
      // 关键步骤失败后直接结束当前 note，进入下一个。
      break;
    }
  }

  if (detailOpened) {
    await closeDetail({ profile, unifiedApiUrl: UNIFIED_API_URL }).catch(() => null);
    await delay(500);
  }

  emitRunEvent('phase_unified_note_done', {
    noteId,
    success: result.success,
    commentsTotal: result.commentsTotal,
    matchCount: result.matchCount,
    likedCount: result.likedCount,
    repliedCount: result.repliedCount,
    ocrImages: result.ocrImages,
    ocrFailedImages: result.ocrFailedImages,
    noteDir,
    likeEvidenceDir,
    errors: result.errors,
    slotIndex,
    tabRealIndex,
  });

  return result;
}

async function main() {
  await ensureServicesHealthy();
  await ensureCoreServices();

  const args = minimist(process.argv.slice(2));

  const keyword = resolveKeyword();
  const env = resolveEnv();
  const downloadRoot = resolveDownloadRoot();
  const profilesArg = String(args.profiles || '').trim();
  const poolKeyword = String(args.profilepool || '').trim();
  const shardedChild = parseFlag(args['sharded-child'], false);
  const skipPhase1 = parseFlag(args['skip-phase1'], false);
  const headless = parseFlag(args.headless, true);
  const inputMode = String(args['input-mode'] || 'protocol').trim().toLowerCase() === 'system' ? 'system' : 'protocol';
  const autoBackfillLinks = !parseFlag(args['no-auto-backfill-links'], false);

  const doHomepage = parseFlag(args['do-homepage'], true);
  const doImages = parseFlag(args['do-images'], false);
  const doComments = parseFlag(args['do-comments'], true);
  const doLikes = parseFlag(args['do-likes'], false);
  const doReply = parseFlag(args['do-reply'], false);
  const doOcr = parseFlag(args['do-ocr'], false);
  const ocrCommand = String(args['ocr-command'] || process.env.WEBAUTO_OCR_COMMAND || '').trim();

  const maxNotes = Math.max(1, Number(args['max-notes'] || 100));
  const tabCount = Math.max(1, Number(args['tab-count'] || 4));
  const maxComments = parsePositiveOrUnlimited(args['max-comments'], 0);
  const commentRounds = parsePositiveOrUnlimited(args['comment-rounds'], 0);
  const maxLikes = Math.max(1, Number(args['max-likes'] || 2));

  const likeKeywords = splitCsv(args['like-keywords'] || '');
  const matchKeywords = splitCsv(args['match-keywords'] || args['like-keywords'] || '');
  const matchMode = String(args['match-mode'] || 'any').trim();
  const matchMinHits = Math.max(1, Number(args['match-min-hits'] || 2));

  const replyText = String(args['reply-text'] || '感谢分享，已关注').trim();

  const dryRun = !parseFlag(args['no-dry-run'], false) && parseFlag(args['dry-run'], true);

  let operationPlan = buildOperationPlan({ doHomepage, doImages, doComments, doLikes, doReply });
  const opOrderRaw = splitCsv(args['op-order'] || '');
  if (opOrderRaw.length > 0) {
    const allowed = new Set(['detail_harvest', 'comments_harvest', 'comment_match_gate', 'comment_like', 'comment_reply', 'next_note']);
    const normalized = opOrderRaw.filter((op) => allowed.has(op));
    if (!normalized.includes('next_note')) normalized.push('next_note');
    if (normalized.length > 0) operationPlan = normalized;
  }

  if (doOcr && !operationPlan.includes('detail_harvest')) {
    operationPlan = ['detail_harvest', ...operationPlan.filter((op) => op !== 'detail_harvest')];
  }

  const foreground = parseFlag(args.foreground, false);
  const shouldDaemonize = !foreground && process.env.WEBAUTO_DAEMON !== '1';

  if (shouldDaemonize) {
    const wrapperPath = path.join(__dirname, 'shared', 'daemon-wrapper.mjs');
    const scriptPath = fileURLToPath(import.meta.url);
    const scriptArgs = process.argv.slice(2).filter((arg) => arg !== '--foreground');
    await runNode(wrapperPath, [scriptPath, ...scriptArgs]);
    console.log('✅ Phase Unified Harvest started in daemon mode');
    return;
  }

  await controllerAction('system:input-mode:set', { mode: inputMode }, UNIFIED_API_URL).catch(() => null);
  console.log(`[InputMode] ${inputMode}`);

  if (!shardedChild && (profilesArg || poolKeyword)) {
    const profiles = profilesArg
      ? profilesArg.split(',').map((s) => s.trim()).filter(Boolean)
      : listProfilesForPool(poolKeyword);
    if (profiles.length === 0) {
      console.error('❌ 未找到可用 profiles');
      process.exit(2);
    }

    const assignments = assignShards(profiles);
    console.log(`🧩 Unified Harvest multi-profile: ${assignments.length} shards`);

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

    const runShard = async (a) => {
      console.log(`\n➡️ shard ${a.shardIndex}/${a.shardCount} profile=${a.profileId}`);
      // Child process runs runtime-ready + phase1 with ownerPid=self.
      // This avoids parent-booted sessions being reaped when parent phase1 exits.
      await runNode(scriptPath, [
        ...baseArgs,
        '--profile', a.profileId,
        '--shard-index', String(a.shardIndex),
        '--shard-count', String(a.shardCount),
        '--sharded-child', '1',
        '--skip-phase1', '1',
      ]);
    };

    const shardResults = await Promise.allSettled(assignments.map((a) => runShard(a)));
    const failed = shardResults
      .map((r, idx) => ({ r, idx }))
      .filter((x) => x.r.status === 'rejected')
      .map((x) => ({
        profile: assignments[x.idx]?.profileId,
        shardIndex: assignments[x.idx]?.shardIndex,
        error: x.r.reason?.message || String(x.r.reason || 'unknown_error'),
      }));

    if (failed.length > 0) {
      failed.forEach((f) => {
        console.error(`❌ shard ${f.shardIndex}/${assignments.length} profile=${f.profile} failed: ${f.error}`);
      });
      throw new Error(`multi-profile failed: ${failed.length}/${assignments.length} shard(s)`);
    }

    console.log('\n✅ Unified Harvest multi-profile done');
    return;
  }

  // Request profile from Unified Gate if not provided
let profileAllocation = null;
const profile = await (async () => {
  if (args.profile) return String(args.profile).trim();
  console.log('[UnifiedGate] Requesting profile...');
  try {
    profileAllocation = await requestProfile(`unified-harvest-${Date.now()}`);
    console.log('[UnifiedGate] Allocated:', profileAllocation.profile);
    const hbInterval = setInterval(() => {
      heartbeat(profileAllocation.profile, profileAllocation.token).catch(() => {});
    }, 30000);
    process.on('exit', () => clearInterval(hbInterval));
    return profileAllocation.profile;
  } catch (e) {
    console.error('[UnifiedGate] Failed:', e.message);
    process.exit(1);
  }
})();

  await ensureRuntimeReady({
    phase: 'phase_unified',
    profile,
    keyword,
    env,
    unifiedApiUrl: UNIFIED_API_URL,
    headless,
    requireCheckpoint: true,
  });

  const runCtx = initRunLogging({ keyword, env, noWrite: dryRun });
  const runId = runCtx?.runId || runCtx;

  const config = {
    doHomepage,
    doImages,
    doComments,
    doLikes,
    doReply,
    doOcr,
    ocrCommand,
    maxNotes,
    tabCount,
    maxComments,
    commentRounds,
    maxLikes,
    matchKeywords,
    likeKeywords,
    matchMode,
    matchMinHits,
    replyText,
    dryRun,
  };

  console.log(`\n📝 Phase Unified Harvest: 顺序流水线 [runId: ${runId}]`);
  console.log(`关键字: ${keyword}`);
  console.log(`环境: ${env}`);
  console.log(`Profile: ${profile}`);
  console.log(`Operation plan: ${operationPlan.join(' -> ')}`);
  console.log(`Tab rotation: ${tabCount} tabs (Cmd+T pool)`);
  console.log(`Input mode: ${inputMode}`);
  console.log(`Comments cap: ${maxComments > 0 ? maxComments : 'unlimited'} | Comment rounds: ${commentRounds > 0 ? commentRounds : 'unlimited'}`);
  if (doOcr) {
    console.log(`OCR: enabled (command=${ocrCommand || 'auto: deepseek-ocr|dsocr'})`);
  }

  const lock = createSessionLock({ profileId: profile, lockType: 'phase-unified' });
  let lockHandle = null;
  try {
    lockHandle = lock.acquire();
  } catch {
    console.log('⚠️ 会话锁已被持有，退出');
    process.exit(1);
  }

  try {
    const t0 = nowMs();
    emitRunEvent('phase_unified_start', { keyword, env, config, operationPlan, tabCount, inputMode });

    const linksReady = await ensurePhase2LinksReady({
      profile,
      keyword,
      env,
      target: maxNotes,
      headless,
      autoBackfill: autoBackfillLinks,
    });

    const validateResult = await validateLinks({
      keyword,
      env,
      profile,
      linksPath: linksReady.linksPath,
      shardIndex: args['shard-index'] !== undefined ? Number(args['shard-index']) : undefined,
      shardCount: args['shard-count'] !== undefined ? Number(args['shard-count']) : undefined,
      shardBy: 'index-mod',
      maxNotes,
    });

    if (!validateResult.success) {
      throw new Error(`链接校验失败: ${validateResult.error}`);
    }

    const links = Array.isArray(validateResult.links) ? validateResult.links : [];
    console.log(`✅ 有效链接: ${links.length}，本轮处理: ${links.length}`);
    if (linksReady.after.valid < maxNotes) {
      console.log(`⚠️ 链接池不足目标：valid=${linksReady.after.valid}, target=${maxNotes}（将处理可用链接）`);
      emitRunEvent('phase_unified_links_insufficient', {
        valid: linksReady.after.valid,
        target: maxNotes,
        linksPath: linksReady.linksPath,
      });
    }

    if (links.length === 0) {
      console.log('⚠️ 没有可处理链接');
      return;
    }

    const tabAssignments = await ensureTabAssignments(profile, tabCount, UNIFIED_API_URL);
    console.log(`[TabPool] 固定帖子页 slots:`);
    tabAssignments.forEach((slot) => {
      console.log(`  slot-${slot.slotIndex} -> tab-${slot.tabRealIndex}`);
    });
    emitRunEvent('phase_unified_tab_pool', { tabAssignments, tabCount });

    const stats = {
      processed: 0,
      failedNotes: 0,
      totalComments: 0,
      totalLiked: 0,
      totalReplied: 0,
      totalOcrImages: 0,
      totalOcrFailedImages: 0,
      homepageOk: 0,
      errors: [],
    };

    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      const noteId = String(link?.noteId || '');
      const slot = tabAssignments[i % tabAssignments.length];
      const slotIndex = Number(slot?.slotIndex || 1);
      const tabRealIndex = Number.isFinite(Number(slot?.tabRealIndex)) ? Number(slot?.tabRealIndex) : 0;

      console.log(`\n[${i + 1}/${links.length}] slot-${slotIndex}(tab-${tabRealIndex}) note=${noteId}`);
      const switched = await switchToTab(profile, tabRealIndex, UNIFIED_API_URL);
      console.log(`  [Verify] activeIndex=${switched.activeIndex} url=${String(switched.activeUrl || '').slice(0, 90)}`);
      emitRunEvent('phase_unified_tab_switch', {
        noteId,
        slotIndex,
        tabRealIndex,
        activeIndex: switched.activeIndex,
        activeUrl: switched.activeUrl,
      });

      const noteResult = await processSingleNote({
        profile,
        keyword,
        env,
        downloadRoot,
        link,
        operationPlan,
        config,
        slotIndex,
        tabRealIndex,
      });

      stats.processed += 1;
      stats.totalComments += Number(noteResult.commentsTotal || 0);
      stats.totalLiked += Number(noteResult.likedCount || 0);
      stats.totalReplied += Number(noteResult.repliedCount || 0);
      stats.totalOcrImages += Number(noteResult.ocrImages || 0);
      stats.totalOcrFailedImages += Number(noteResult.ocrFailedImages || 0);
      if (noteResult.homepageOk) stats.homepageOk += 1;
      if (!noteResult.success) {
        stats.failedNotes += 1;
        stats.errors.push({ noteId, errors: noteResult.errors, slotIndex, tabRealIndex });
      }

      if (!dryRun) {
        await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
          draft.resume.lastNoteId = noteId;
          draft.resume.lastStep = 'phase_unified_note_done';
        }).catch(() => {});
      }

      await delay(500);
    }


    const totalMs = nowMs() - t0;
    console.log(`\n⏱️ 总耗时: ${formatDurationMs(totalMs)}`);
    console.log(`📊 结果汇总:`);
    console.log(`  - 处理帖子: ${stats.processed}`);
    console.log(`  - 主页采集成功: ${stats.homepageOk}`);
    console.log(`  - 评论总量: ${stats.totalComments}`);
    console.log(`  - 点赞总量: ${stats.totalLiked}`);
    console.log(`  - 回复总量: ${stats.totalReplied}`);
    console.log(`  - OCR 成功图片: ${stats.totalOcrImages}`);
    console.log(`  - OCR 失败图片: ${stats.totalOcrFailedImages}`);
    console.log(`  - 失败帖子: ${stats.failedNotes}`);

    emitRunEvent('phase_unified_done', {
      ...stats,
      ms: totalMs,
      operationPlan,
      dryRun,
    });

    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.stats.phaseUnifiedDurationMs = totalMs;
        draft.resume.lastStep = 'phase_unified_done';
      }).catch(() => {});
    }

    console.log('\n✅ Phase Unified Harvest 完成');
  } catch (err) {
    emitRunEvent('phase_unified_error', { error: safeStringify(err), dryRun });
    if (!dryRun) {
      await updateXhsCollectState({ keyword, env, downloadRoot }, (draft) => {
        draft.resume.lastStep = 'phase_unified_error';
      }).catch(() => {});
    }
    console.error('\n❌ Phase Unified Harvest 失败:', err?.message || String(err));
    process.exit(1);
  } finally {
    await restoreBrowserState(profile, UNIFIED_API_URL).catch(() => {});
    lockHandle?.release?.();
  }
}

main();
