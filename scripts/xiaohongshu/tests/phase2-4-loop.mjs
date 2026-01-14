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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import minimist from 'minimist';

import { execute as goToSearch } from '../../../dist/modules/workflow/blocks/GoToSearchBlock.js';
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

function resolveResumeFlag() {
  const argv = minimist(process.argv.slice(2));
  return Boolean(argv.resume);
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

async function scrollSearchPage(direction = 'down') {
  const dirLiteral = direction === 'up' ? 'up' : 'down';
  const script = `(() => {
    const beforeScroll = window.scrollY || document.documentElement.scrollTop || 0;
    const scrollAmount = Math.min(window.innerHeight * 0.8, 800);
    const dir = '${dirLiteral}';
    const delta = dir === 'up' ? -scrollAmount : scrollAmount;
    window.scrollBy({ top: delta, behavior: 'smooth' });

    return new Promise(resolve => {
      setTimeout(() => {
        const afterScroll = window.scrollY || document.documentElement.scrollTop || 0;
        resolve({
          ok: true,
          beforeScroll,
          afterScroll,
          scrolled: afterScroll - beforeScroll
        });
      }, 800);
    });
  })()`;

  try {
    const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'browser:execute',
        payload: { profile: PROFILE, script }
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
    });
    const data = await res.json().catch(() => ({}));
    const result = data?.data?.result || data?.result || {};
    if (!result.ok) {
      console.warn('[ScrollSearchPage] scroll failed:', result.reason);
      return false;
    }
    console.log(
      `[ScrollSearchPage] ${direction} scroll: ${result.beforeScroll} -> ${result.afterScroll} (+${result.scrolled}px)`,
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return (result.scrolled || 0) !== 0;
  } catch (err) {
    console.warn('[ScrollSearchPage] scroll error:', err.message || err);
    return false;
  }
}

async function controllerAction(action, payload = {}) {
  const res = await fetch(`${UNIFIED_API}/v1/controller/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
  });
  const data = await res.json().catch(() => ({}));
  return data.data || data;
}

function findContainer(node, pattern) {
  if (!node) return null;
  if (pattern.test(node.id || node.defId || '')) return node;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findContainer(child, pattern);
      if (found) return found;
    }
  }
  return null;
}

async function detectRiskControl() {
  try {
    const match = await controllerAction('containers:match', { profile: PROFILE });
    const tree = match?.snapshot?.container_tree || match?.container_tree;
    if (!tree) return false;
    const riskNode = findContainer(tree, /qrcode_guard/);
    if (riskNode) {
      console.log(
        '[Risk] 🚨 检测到风控容器:',
        riskNode.id || riskNode.defId || 'unknown',
      );
      return true;
    }
    return false;
  } catch (err) {
    console.warn('[Risk] 风控检测失败:', err.message || err);
    return false;
  }
}

async function returnToDiscoverViaSidebar() {
  console.log('[Risk] 尝试通过侧边栏返回发现页...');
  try {
    await controllerAction('container:operation', {
      containerId: 'xiaohongshu_home.discover_button',
      operationId: 'click',
      sessionId: PROFILE
    });
  } catch (err) {
    console.warn('[Risk] 点击 discover_button 失败:', err.message || err);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

async function handleRiskRecovery(keyword) {
  console.log('[Risk] 风控恢复流程: 回发现页 + 上下滚动 + 重新搜索');
  try {
    await returnToDiscoverViaSidebar();

    // 在发现页上下滚动一轮，模拟真实用户行为
    await scrollSearchPage('down');
    await scrollSearchPage('up');

    console.log('[Risk] 通过 GoToSearchBlock 重新执行搜索...');
    const searchRes = await goToSearch({
      sessionId: PROFILE,
      keyword
    });

    if (!searchRes.success) {
      console.error('[Risk] GoToSearchBlock 失败:', searchRes.error);
      return false;
    }

    console.log(
      `[Risk] 搜索恢复成功，url=${searchRes.url || searchRes.data?.url || ''}`,
    );
    return true;
  } catch (err) {
    console.error('[Risk] 风控恢复流程异常:', err.message || err);
    return false;
  }
}

async function main() {
  console.log('🚀 Phase 2-4 Loop: 搜索 + 详情 + 评论（容器 + 系统点击/输入）\n');

  const keyword = resolveKeyword();
  const targetCount = resolveTargetCount();
  const env = resolveEnv();
  const resume = resolveResumeFlag();

  console.log(
    `配置: keyword="${keyword}" targetCount=${targetCount} env=${env} resume=${resume}\n`,
  );

  const seenNoteIds = new Set();
  const safeUrlIndex = new Map();

  // 预加载：已完成的 noteId（用于断点续传）+ 历史 safe-detail-urls 索引
  const home = process.env.HOME || os.homedir();
  const baseDir = path.join(home, '.webauto', 'download', 'xiaohongshu', env, keyword);
  const indexPath = path.join(baseDir, 'safe-detail-urls.jsonl');

  if (resume) {
    try {
      const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
      for (const dirent of entries) {
        if (!dirent.isDirectory()) continue;
        const noteId = dirent.name;
        const contentPath = path.join(baseDir, noteId, 'content.md');
        try {
          const stat = await fs.promises.stat(contentPath).catch(() => null);
          if (stat && stat.isFile()) {
            seenNoteIds.add(noteId);
          }
        } catch {
          // 单个目录检查失败不影响整体
        }
      }
      if (seenNoteIds.size > 0) {
        console.log(
          `[Resume] 检测到已落盘的 note 数量: ${seenNoteIds.size}（将跳过这些 note 的详情/评论采集）`,
        );
      }
    } catch {
      // 目录不存在或读取失败时，视为首次采集
    }

    // 预加载历史 safe-detail-urls 索引，避免断点续传时丢失旧记录
    try {
      const content = await fs.promises.readFile(indexPath, 'utf8');
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const noteId = obj.noteId || '';
          const safeDetailUrl = obj.safeDetailUrl || obj.detailUrl || '';
          const hasToken =
            Boolean(obj.hasToken) ||
            (typeof safeDetailUrl === 'string' && safeDetailUrl.includes('xsec_token='));
          if (!noteId || !safeDetailUrl || !hasToken) continue;
          if (safeUrlIndex.has(noteId)) continue;
          safeUrlIndex.set(noteId, {
            noteId,
            title: obj.title || '',
            safeDetailUrl,
            hasToken: true,
          });
        } catch {
          // 单行解析失败忽略
        }
      }
      if (safeUrlIndex.size > 0) {
        console.log(
          `[Resume] 预加载 safe-detail-urls 索引条目: ${safeUrlIndex.size}（来自历史 JSONL）`,
        );
      }
    } catch {
      // 首次采集时 safe-detail-urls.jsonl 可能不存在
    }
  }

  // 以已完成条目数为起点，保证 processedCount 代表“累计完成”的数量
  let processedCount = resume ? seenNoteIds.size : 0;
  let riskDetectionCount = 0;

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

    // 1-3. 视口驱动：当前视口采集 → 详情+评论 → ESC → 再滚动一屏
    let loopRound = 0;
    const maxLoopRounds = Math.max(targetCount * 3, 50);

    while (processedCount < targetCount && loopRound < maxLoopRounds) {
      loopRound += 1;
      console.log(
        `\n[Loop] Round ${loopRound}, processed=${processedCount}/${targetCount}`,
      );

      console.log('1️⃣ Phase2: 收集当前视口搜索结果列表...');
      const listResult = await collectSearchList({
        sessionId: PROFILE,
        targetCount,
        maxScrollRounds: 1, // 仅采集当前视口，不在 Block 内滚动
      });

      if (!listResult.success || !Array.isArray(listResult.items) || listResult.items.length === 0) {
        console.error(
          `❌ CollectSearchList 失败: success=${listResult.success}, error=${listResult.error}`,
        );
        await printBrowserStatus('phase2-4-loop:collectList-empty');
        break;
      }

      console.log(
        `   ✅ 当前视口命中条目: ${listResult.items.length}（累计处理 ${processedCount}/${targetCount}）`,
      );

      // 1.1 累积 safedetailUrl 索引（仅做记录，不用于导航）
      for (const item of listResult.items) {
        const noteId = item.noteId;
        const rawUrl = item.safeDetailUrl || item.detailUrl || '';
        const hasToken =
          Boolean(item.hasToken) || (typeof rawUrl === 'string' && rawUrl.includes('xsec_token='));
        if (!noteId || !rawUrl || !hasToken) continue;
        if (safeUrlIndex.has(noteId)) continue;
        safeUrlIndex.set(noteId, {
          noteId,
          title: item.title || '',
          safeDetailUrl: rawUrl,
          hasToken: true,
        });
      }

      let hasNewInViewport = false;

      // Phase3 + Phase4: 针对当前视口内尚未处理的条目依次执行详情+评论+ESC
      for (const item of listResult.items) {
        if (processedCount >= targetCount) break;

        const listNoteId = item.noteId;
        if (listNoteId && seenNoteIds.has(listNoteId)) {
          console.log(
            `\n📝 Note (跳过重复): noteId=${listNoteId} (${item.title || '无标题'})`,
          );
          continue;
        }

        hasNewInViewport = true;
        const displayIndex = processedCount + 1;
        console.log(
          `\n📝 Note #${displayIndex}/${targetCount}: ${item.title || '无标题'} (${
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
          // 失败的 note 也视为已尝试，避免无限重试
          if (listNoteId) {
            seenNoteIds.add(listNoteId);
          }
          continue;
        }

        printAnchor('OpenDetail', openResult.anchor);
        console.log('   ✅ 详情页已打开');

        const currentUrl = await getCurrentUrl();
        const noteIdFromUrl = extractNoteIdFromUrl(currentUrl);

        // 3.2 风控检测：详情页是否被风控页替代
        const riskDetected = await detectRiskControl();
        if (riskDetected) {
          console.warn('   🚨 当前详情打开命中了风控页面，启动恢复流程');
          if (listNoteId) {
            // 标记当前 note 已尝试，避免后续重复点击同一条
            seenNoteIds.add(listNoteId);
          }

          riskDetectionCount += 1;
          let canContinue = false;

          if (riskDetectionCount === 1) {
            // 第一次风控：尝试通过发现页恢复 + 重新搜索
            canContinue = await handleRiskRecovery(keyword);
          } else {
            // 第二次及以上风控：视为整体会话进入高风险，直接停止
            console.error('   ❌ 多次命中风控，停止本轮采集以避免加重风控');
            canContinue = false;
          }

          if (!canContinue) {
            processedCount = targetCount; // 强制结束外层循环
          }

          // 无论是否继续，本条 note 不再进入评论采集/写盘；
          // 若可以继续，交给外层 while 在恢复后重新收集列表并打开“下一条链接”进行验证
          break;
        }

        // 3.3 评论采集（Phase4 能力）
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

        // 如果本条成功完成评论采集，则计入 processedCount
        if (commentsResult.success) {
          processedCount += 1;
          console.log(
            `   [Progress] 已完成 ${processedCount}/${targetCount} 条 note（keyword="${keyword}"）`,
          );
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
          processedCount = targetCount; // 强制结束外层循环
          break;
        }

        console.log(
          `   ✅ ESC 恢复成功，finalStage=${recovery.finalStage}, method=${
            recovery.method || 'unknown'
          }, noteId=${noteIdFromUrl || item.noteId || '未知'}`,
        );
        await printBrowserStatus('phase2-4-loop:after-esc-exit');
      }

      if (processedCount >= targetCount) {
        break;
      }

      // 当前视口没有新帖子可处理，或处理完当前视口后，进行一次系统滚动加载下一屏
      if (!hasNewInViewport) {
        console.log('   ⚠️ 当前视口没有新帖子，尝试系统滚动加载更多...');
      } else {
        console.log('   ℹ️ 当前视口处理完毕，系统滚动加载下一屏...');
      }

      const scrolled = await scrollSearchPage('down');
      if (!scrolled) {
        console.warn('   ⚠️ 系统滚动失败或已到底，停止循环');
        await printBrowserStatus('phase2-4-loop:scroll-end');
        break;
      }
    }

    // 将 safedetailUrl 索引落盘：~/.webauto/download/xiaohongshu/{env}/{keyword}/safe-detail-urls.jsonl
    try {
      const home = process.env.HOME || os.homedir();
      const baseDir = path.join(home, '.webauto', 'download', 'xiaohongshu', env, keyword);
      await fs.promises.mkdir(baseDir, { recursive: true });
      const indexPath = path.join(baseDir, 'safe-detail-urls.jsonl');

      const lines = [];
      for (const entry of safeUrlIndex.values()) {
        lines.push(
          JSON.stringify({
            platform: PLATFORM,
            env,
            keyword,
            noteId: entry.noteId,
            title: entry.title,
            safeDetailUrl: entry.safeDetailUrl,
            hasToken: entry.hasToken,
          }),
        );
      }

      await fs.promises.writeFile(indexPath, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8');
      console.log(
        `\n[SafeDetailIndex] 已写入 ${safeUrlIndex.size} 条带 xsec_token 的详情链接到: ${indexPath}`,
      );
    } catch (err) {
      console.warn(
        '[SafeDetailIndex] 写入 safe-detail-urls 失败:',
        err?.message || String(err),
      );
    }

    console.log('\n✅ Phase 2-4 Loop 完成');
  } catch (error) {
    console.error('❌ 未捕获错误:', error.message || error);
    await printBrowserStatus('phase2-4-loop:exception');
  }
}

main();
