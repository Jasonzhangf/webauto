#!/usr/bin/env node
/**
 * Phase 2-4: 循环搜索 + 打开详情 + 评论采集（容器 + 系统点击/输入）
 *
 * 用途：
 * - 在完成 Phase1 基础会话/登录后，按目标数量重复执行 Phase2/3/4 的核心能力
 * - 验证：容器发现、系统点击、系统输入、详情打开、评论采集、ESC 退出 的整条链路
 *
 * 约束：
 * - 不负责启动服务/浏览器，会话需由 Phase1 + core-daemon 准备好
 * - 搜索必须通过 GoToSearchBlock（内部已使用 SearchGate + 对话框搜索）
 * - 每条 note 在评论采集完成后通过 ErrorRecoveryBlock(ESC) 返回搜索列表
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

import { execute as collectSearchList } from '../../../dist/modules/workflow/blocks/CollectSearchListBlock.js';
import { execute as openDetail } from '../../../dist/modules/workflow/blocks/OpenDetailBlock.js';
import { execute as collectComments } from '../../../dist/modules/workflow/blocks/CollectCommentsBlock.js';
import { execute as errorRecovery } from '../../../dist/modules/workflow/blocks/ErrorRecoveryBlock.js';
import { execute as persistXhsNote } from '../../../dist/modules/workflow/blocks/PersistXhsNoteBlock.js';

const PROFILE = 'xiaohongshu_fresh';
const PLATFORM = 'xiaohongshu';
const KEYWORDS = ['小米', '雷军', 'iphone', '手机膜', '华为', '中国制造', '美国贸易'];
const UNIFIED_API = 'http://127.0.0.1:7701';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const DEFAULT_SEARCH_GATE_PORT = process.env.WEBAUTO_SEARCH_GATE_PORT || '7790';
const DEFAULT_SEARCH_GATE_BASE = `http://127.0.0.1:${DEFAULT_SEARCH_GATE_PORT}`;
const DEFAULT_SEARCH_GATE_URL = `${DEFAULT_SEARCH_GATE_BASE}/permit`;

function resolveKeyword() {
  const argv = minimist(process.argv.slice(2));
  const fromFlag = argv.keyword || argv.k;
  const fromPositional =
    Array.isArray(argv._) && argv._.length > 0 ? argv._[argv._.length - 1] : undefined;
  const candidate = fromFlag || fromPositional;
  if (candidate && typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return KEYWORDS[0];
}

function resolveTargetCount() {
  const argv = minimist(process.argv.slice(2));
  const raw = argv.target ?? argv.t;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 3;
}

function resolveEnv() {
  const argv = minimist(process.argv.slice(2));
  const fromFlag = argv.env || argv.e;
  if (fromFlag && typeof fromFlag === 'string' && fromFlag.trim()) {
    return fromFlag.trim();
  }
  return 'debug';
}

async function printBrowserStatus(tag) {
  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: 'location.href' }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    const data = await res.json().catch(() => ({}));
    const url = data?.data?.result || data?.result || '';
    console.log(`\n[BrowserStatus:${tag}] current URL: ${url || '未知'}`);
  } catch (err) {
    console.log(`\n[BrowserStatus:${tag}] 获取失败: ${err.message}`);
  }
}

async function ensureSearchGate() {
  const gateUrl = process.env.WEBAUTO_SEARCH_GATE_URL || DEFAULT_SEARCH_GATE_URL;
  const healthUrl = gateUrl.replace(/\/permit$/, '/health');

  async function checkHealth() {
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
      });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return !!data?.ok;
    } catch {
      return false;
    }
  }

  // 如果已经在跑，直接返回
  if (await checkHealth()) {
    console.log(`[SearchGate] 已在线: ${healthUrl}`);
    return;
  }

  // 仅在使用默认本地地址时尝试自动启动；如果用户自定义了远程 URL，则由用户自行管理
  if (
    process.env.WEBAUTO_SEARCH_GATE_URL &&
    process.env.WEBAUTO_SEARCH_GATE_URL !== DEFAULT_SEARCH_GATE_URL
  ) {
    console.warn(
      `[SearchGate] 检测到自定义 WEBAUTO_SEARCH_GATE_URL，但健康检查失败: ${healthUrl}`,
    );
    console.warn('[SearchGate] 请手动启动或修复自定义 SearchGate 服务');
    return;
  }

  const scriptPath = path.join(repoRoot, 'scripts', 'search-gate-server.mjs');
  console.log(`[SearchGate] 未检测到服务，准备启动: node ${scriptPath}`);

  try {
    const child = spawn('node', [scriptPath], {
      cwd: repoRoot,
      stdio: 'ignore',
      detached: true
    });
    child.unref();
    console.log(`[SearchGate] 已后台启动，pid=${child.pid}`);
  } catch (err) {
    console.error('[SearchGate] 启动失败:', err?.message || err);
    return;
  }

  // 简单等待一小段时间再做一次健康检查
  await new Promise((r) => setTimeout(r, 1500));
  if (await checkHealth()) {
    console.log(`[SearchGate] 启动成功: ${healthUrl}`);
  } else {
    console.warn(
      '[SearchGate] 启动后健康检查仍然失败，请在另一个终端手动检查 node scripts/search-gate-server.mjs',
    );
  }
}

function printAnchor(tag, anchor) {
  if (!anchor) return;
  console.log(`\n[Anchor:${tag}]`);
  Object.entries(anchor).forEach(([key, value]) => {
    console.log(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  });
}

function extractNoteIdFromUrl(url) {
  if (typeof url !== 'string') return '';
  const m = url.match(/\/explore\/([^/?#]+)/);
  return m ? m[1] : '';
}

async function getCurrentUrl() {
  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script: 'location.href' }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return data?.data?.result || data?.result || '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('🚀 Phase 2-4 Loop: 搜索 + 详情 + 评论（容器 + 系统点击/输入）\n');

  const keyword = resolveKeyword();
  const targetCount = resolveTargetCount();
  const env = resolveEnv();

  console.log(`配置: keyword="${keyword}" targetCount=${targetCount} env=${env}\n`);

  const seenNoteIds = new Set();

  try {
    // 0. 确保 SearchGate 已启动（用于控制搜索频率）
    await ensureSearchGate();

    // 0.1 如当前在详情页，先通过 ESC 回到搜索列表，避免在异常阶段直接执行搜索
    const beforeUrl = await getCurrentUrl();
    if (beforeUrl && beforeUrl.includes('/explore/')) {
      console.log('0️⃣ 当前在详情页，先通过 ESC 恢复到搜索列表...');
      const recovery = await errorRecovery({
        sessionId: PROFILE,
        fromStage: 'detail',
        targetStage: 'search',
        recoveryMode: 'esc',
        maxRetries: 2
      });

      if (!recovery.success) {
        console.error('❌ ESC 恢复失败，无法安全回到搜索列表');
        if (recovery.currentUrl) {
          console.error('   当前 URL:', recovery.currentUrl);
        }
        await printBrowserStatus('phase2-4-loop:pre-search-esc-failed');
        return;
      }

      console.log(
        `   ✅ 预恢复成功，finalStage=${recovery.finalStage}, method=${
          recovery.method || 'unknown'
        }`,
      );
      await printBrowserStatus('phase2-4-loop:pre-search-esc-ok');
    }

    // 1. Phase2: 基于当前搜索结果页收集列表（假设搜索已通过 Phase2 单独完成）
    console.log('1️⃣ Phase2: 收集搜索结果列表...');
    const listResult = await collectSearchList({
      sessionId: PROFILE,
      targetCount: targetCount
    });

    if (!listResult.success || !Array.isArray(listResult.items) || listResult.items.length === 0) {
      console.error(
        `❌ CollectSearchList 失败: success=${listResult.success}, error=${listResult.error}`,
      );
      await printBrowserStatus('phase2-4-loop:collectList');
      return;
    }

    console.log(
      `   ✅ 当前搜索命中条目: ${listResult.count}（去重前），准备采集前 ${
        Math.min(targetCount, listResult.items.length)
      } 条`,
    );

    // 3. Phase3 + Phase4: 逐条打开详情 + 评论采集 + ESC 退出
    const maxItems = Math.min(targetCount, listResult.items.length);
    for (let idx = 0; idx < maxItems; idx++) {
      const item = listResult.items[idx];

      // 基于 noteId 的去重：同一批次内不重复采集同一个帖子
      const listNoteId = item.noteId;
      if (listNoteId && seenNoteIds.has(listNoteId)) {
        console.log(
          `\n📝 Note #${idx + 1}/${maxItems}: 跳过重复 noteId=${listNoteId} (${
            item.title || '无标题'
          })`,
        );
        continue;
      }

      console.log(
        `\n📝 Note #${idx + 1}/${maxItems}: ${item.title || '无标题'} (${
          item.noteId || '无ID'
        })`,
      );

      // 3.1 打开详情（系统点击）
      console.log('3️⃣ Phase3: 打开详情页...');
      const openResult = await openDetail({
        sessionId: PROFILE,
        containerId: item.containerId,
        domIndex: item.raw?.index ?? item.domIndex
      });

      if (!openResult.success || !openResult.detailReady) {
        console.error(`❌ 打开详情页失败: ${openResult.error || 'detail not ready'}`);
        printAnchor('OpenDetail', openResult.anchor);
        await printBrowserStatus('phase2-4-loop:openDetail');
        // 尝试通过 ESC 恢复到搜索列表后继续下一条
        await errorRecovery({
          sessionId: PROFILE,
          fromStage: 'detail',
          targetStage: 'search',
          recoveryMode: 'esc',
          maxRetries: 2
        }).catch(() => ({}));
        continue;
      }

      printAnchor('OpenDetail', openResult.anchor);
      console.log('   ✅ 详情页已打开');

      const currentUrl = await getCurrentUrl();
      const noteIdFromUrl = extractNoteIdFromUrl(currentUrl);

      // 3.2 评论采集（Phase4 能力）
      console.log('4️⃣ Phase4: 预热并采集评论...');
      const commentsResult = await collectComments({
        sessionId: PROFILE
      }).catch((e) => ({
        success: false,
        comments: [],
        reachedEnd: false,
        emptyState: false,
        warmupCount: 0,
        totalFromHeader: null,
        error: e.message || String(e),
        anchor: null
      }));

      if (!commentsResult.success) {
        console.error(`❌ 评论采集失败: ${commentsResult.error}`);
        printAnchor('CollectComments', commentsResult.anchor);
        await printBrowserStatus('phase2-4-loop:collectComments');
      } else {
        printAnchor('CollectComments', commentsResult.anchor);
        console.log(
          `   ✅ 评论数: ${commentsResult.comments.length} reachedEnd=${
            commentsResult.reachedEnd
          } emptyState=${commentsResult.emptyState}`,
        );
        if (commentsResult.comments.length > 0) {
          const preview = commentsResult.comments[0]?.text || '';
          console.log(`   ✅ 示例评论: ${preview.substring(0, 50)}`);
        }
      }

      // 3.2.1 本地持久化：~/.webauto/download/xiaohongshu/{env}/{keyword}/{noteId}/
      const finalNoteId = noteIdFromUrl || item.noteId || '';
      if (!finalNoteId) {
        console.warn('   ⚠️ 无法确定 noteId，跳过本地持久化');
      } else {
        if (seenNoteIds.has(finalNoteId)) {
          console.log(`   ⚠️ noteId=${finalNoteId} 已处理过，本轮仅复用评论结果，不再写盘`);
        } else {
          seenNoteIds.add(finalNoteId);
          const persistRes = await persistXhsNote({
            sessionId: PROFILE,
            env,
            platform: PLATFORM,
            keyword,
            noteId: finalNoteId,
            detailUrl: currentUrl,
            detail: {}, // Phase2-4 loop 主要验证评论能力，详情正文可后续通过 ExtractDetailBlock 补齐
            commentsResult
          });
          if (!persistRes.success) {
            console.warn(
              `   ⚠️ PersistXhsNote 失败 noteId=${finalNoteId}: ${persistRes.error}`,
            );
          } else {
            console.log(
              `   💾 已落盘 noteId=${finalNoteId} 到目录: ${
                persistRes.outputDir || persistRes.contentPath || '未知路径'
              }`,
            );
          }
        }
      }

      // 3.3 使用 ESC 恢复到搜索列表，准备下一条
      console.log('5️⃣ Phase4: ESC 退出详情页，返回搜索列表...');
      const recovery = await errorRecovery({
        sessionId: PROFILE,
        fromStage: 'detail',
        targetStage: 'search',
        recoveryMode: 'esc',
        maxRetries: 2
      });

      if (!recovery.success) {
        console.error('❌ ESC 恢复失败，本轮循环中止');
        if (recovery.currentUrl) {
          console.error('   当前 URL:', recovery.currentUrl);
        }
        await printBrowserStatus('phase2-4-loop:esc-exit-failed');
        break;
      }

      console.log(
        `   ✅ ESC 恢复成功，finalStage=${recovery.finalStage}, method=${
          recovery.method || 'unknown'
        }, noteId=${noteIdFromUrl || item.noteId || '未知'}`,
      );
      await printBrowserStatus('phase2-4-loop:after-esc-exit');
    }

    console.log('\n✅ Phase 2-4 Loop 完成');
  } catch (error) {
    console.error('❌ 未捕获错误:', error.message || error);
    await printBrowserStatus('phase2-4-loop:exception');
  }
}

main();
