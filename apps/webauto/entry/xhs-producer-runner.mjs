/**
 * XHS Producer Runner — Always-On 模式的链接采集端
 *
 * 职责：
 * 1. 定时扫描搜索结果（每 30 分钟）
 * 2. 低水位触发补货（队列<10 条时立即扫描）
 * 3. 去重后入队（基于 posts.jsonl）
 * 4. 健康检查 + 自动恢复（core feature）
 */

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  initXhsDetailLinkQueue,
  claimXhsDetailLink,
  completeXhsDetailLink,
} from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/search-gate-ops.mjs';
import { readJsonlRows } from '../../../modules/camo-runtime/src/autoscript/action-providers/xhs/persistence.mjs';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 运行配置
const PRODUCER_SCAN_INTERVAL_MS = 30 * 60_000;  // 每 30 分钟扫描一次
const PRODUCER_MIN_QUEUE_DEPTH = 10;            // 低水位阈值
const PRODUCER_MAX_LINKS_PER_SCAN = 20;         // 单次扫描上限
const PRODUCER_MAX_SCANS = 1;                   // 单次连续扫描次数

// 自动恢复配置（Always-On 核心能力）
const PRODUCER_MAX_CONSECUTIVE_ERRORS = 3;
const HEALTH_CHECK_URL = 'http://127.0.0.1:7704/health';
const HEALTH_CHECK_INTERVAL_MS = 300_000;       // 每 5 分钟健康检查

/**
 * 健康检查 + 自动恢复
 */
async function healthCheckAndRecover(profileId) {
  console.log(`[producer] running health check...`);
  
  try {
    const res = await fetch(HEALTH_CHECK_URL, { method: 'GET' });
    const health = await res.json();
    if (health.ok) {
      console.log(`[producer] health check passed`);
      return { ok: true };
    }
  } catch (e) {
    console.log(`[producer] health check fetch failed: ${e.message}`);
  }

  console.log(`[producer] health check failed, attempting auto-recovery...`);

  const { execSync } = await import('node:child_process');
  const cmd = `camo start ${profileId} --url https://www.xiaohongshu.com --visible`;
  
  try {
    console.log(`[producer] running: ${cmd}`);
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: 60000 });
    console.log(`[producer] camo started, waiting 10s for ready...`);
    await sleep(10000);

    const res2 = await fetch(HEALTH_CHECK_URL);
    const health2 = await res2.json();
    if (health2.ok) {
      console.log(`[producer] ✅ auto-recovery successful!`);
      return { ok: true, recovered: true };
    }
  } catch (err) {
    console.error(`[producer] recovery command failed: ${err.message}`);
  }

  console.log(`[producer] ❌ auto-recovery failed`);
  return { ok: false, reason: 'health_check_failed' };
}

function isSessionError(errMsg) {
  const keywords = ['session', 'profile', 'browser', 'cdp', 'disconnected', 'target closed'];
  return keywords.some(k => errMsg.toLowerCase().includes(k));
}

/**
 * 读取已有输出文件中的已处理 noteId
 */
function loadExistingNoteIds(outputDir) {
  const noteIds = new Set();
  const postsPath = path.join(outputDir, 'posts.jsonl');
  if (fs.existsSync(postsPath)) {
    try {
      const rows = readJsonlRows(postsPath);
      for (const row of rows) {
        const noteId = String(row.noteId || row.id || '').trim();
        if (noteId) noteIds.add(noteId);
      }
    } catch { /* ignore */ }
  }
  return noteIds;
}

/**
 * 搜索并提取帖子链接（通过 camo CLI）
 */
async function searchAndCollectLinks({ profileId, keyword, maxLinks }) {
  const { execSync } = await import('node:child_process');
  const maxPages = Math.max(1, Math.ceil(maxLinks / 20));
  const allLinks = [];

  // 使用 camo CLI 执行搜索
  const script = `
    const searchInput = document.querySelector('#search-input, input.search-input');
    if (!searchInput) return { error: 'search_input_not_found' };
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.value = '${keyword.replace(/'/g, "\\'")}';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new Event('change', { bubbles: true }));
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
    searchInput.dispatchEvent(enterEvent);
    return { ok: true, keyword: '${keyword.replace(/'/g, "\\'")}' };
  `;

  const cmd = `camo eval --profile ${profileId} --js '${script.replace(/'/g, "'\\''")}'`;
  try {
    execSync(cmd, { timeout: 30000, encoding: 'utf-8' });
  } catch { /* may fail, continue */ }

  await sleep(5000);

  // 提取搜索结果
  const extractScript = `
    const items = document.querySelectorAll('.note-item a[href*="/explore/"]');
    const links = [];
    for (const item of items) {
      const href = item.getAttribute('href');
      if (href && !href.includes('source=')) {
        const noteId = href.split('/').pop();
        links.push({ noteId, url: 'https://www.xiaohongshu.com' + href });
      }
    }
    return { links, count: links.length };
  `;

  const extractCmd = `camo eval --profile ${profileId} --js '${extractScript.replace(/'/g, "'\\''")}'`;
  try {
    const output = execSync(extractCmd, { timeout: 30000, encoding: 'utf-8' });
    const result = JSON.parse(output.trim());
    if (result?.links) {
      allLinks.push(...result.links.slice(0, maxLinks));
    }
  } catch { /* ignore */ }

  return allLinks;
}

/**
 * 入队新链接
 */
async function enqueueLinks({ links, keyword, env, maxLinksPerScan }) {
  const outputCtx = {
    keywordDir: path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword),
  };
  
  // 初始化队列
  await initXhsDetailLinkQueue({ keyword, env, profile: 'xhs-qa-1' });

  let added = 0;
  for (const link of links.slice(0, maxLinksPerScan)) {
    try {
      const claim = await claimXhsDetailLink({ keyword, env });
      if (claim.ok && claim.link) {
        // 已存在，跳过
        continue;
      }
      // 新链接，入队逻辑（简化：直接写入 links.jsonl）
      const linksPath = path.join(outputCtx.keywordDir, 'links.jsonl');
      const line = JSON.stringify({ ...link, collectedAt: new Date().toISOString() }) + '\n';
      fs.appendFileSync(linksPath, line);
      added++;
    } catch { /* ignore */ }
  }

  return { added };
}

/**
 * 主入口
 */
export async function runProducerTask(args = {}) {
  const profileId = String(args.profile || 'xhs-qa-1').trim();
  const keyword = String(args.keyword || args.k || '').trim();
  const env = String(args.env || 'debug').trim();
  const maxLinksPerScan = Math.max(1, Number(args['max-links-per-scan'] || PRODUCER_MAX_LINKS_PER_SCAN));
  const minQueueDepth = Number(args['min-queue-depth'] || PRODUCER_MIN_QUEUE_DEPTH);

  if (!keyword) {
    return { ok: false, error: 'keyword is required' };
  }

  console.log(`[producer] keyword=${keyword} env=${env} profile=${profileId}`);
  console.log(`[producer] maxLinksPerScan=${maxLinksPerScan} minQueueDepth=${minQueueDepth}`);
  console.log(`[producer] mode=always-on (scan interval=${PRODUCER_SCAN_INTERVAL_MS}ms)`);
  console.log(`[producer] auto-recovery=enabled (max consecutive errors=${PRODUCER_MAX_CONSECUTIVE_ERRORS})`);

  let totalScanned = 0;
  let totalAdded = 0;
  let consecutiveErrors = 0;
  let lastHealthCheck = Date.now();

  while (true) {
    // Stop signal
    if (process.env.WEBAUTO_JOB_STOPPING === 'true') {
      console.log(`[producer] stop signal received, exiting. scanned=${totalScanned} added=${totalAdded}`);
      return { ok: true, scanned: totalScanned, added: totalAdded };
    }

    // Health check (every 5 min)
    if (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL_MS) {
      const health = await healthCheckAndRecover(profileId);
      if (!health.ok) {
        consecutiveErrors++;
        if (consecutiveErrors >= PRODUCER_MAX_CONSECUTIVE_ERRORS) {
          return { ok: false, reason: 'health_check_exhausted' };
        }
      } else {
        if (health.recovered) consecutiveErrors = 0;
      }
      lastHealthCheck = Date.now();
    }

    try {
      // Step 1: 读取已有 noteIds
      const outputDir = path.join(process.env.HOME || '', '.webauto', 'download', 'xiaohongshu', env, keyword);
      const existingNoteIds = loadExistingNoteIds(outputDir);
      console.log(`[producer] existing noteIds: ${existingNoteIds.size}`);

      // Step 2: 搜索
      const newLinks = await searchAndCollectLinks({ profileId, keyword, maxLinks: maxLinksPerScan * 2 });
      console.log(`[producer] search results: ${newLinks.length}`);

      // Step 3: 去重
      const deduped = newLinks.filter(l => !existingNoteIds.has(l.noteId));
      console.log(`[producer] new links (after dedup): ${deduped.length}`);

      // Step 4: 入队
      const result = await enqueueLinks({ links: deduped, keyword, env, maxLinksPerScan });
      totalAdded += result.added;
      console.log(`[producer] enqueued: ${result.added} (total: ${totalAdded})`);

      totalScanned++;
      consecutiveErrors = 0;

      // Step 5: 低水位检查
      if (result.added > 0 && result.added < minQueueDepth) {
        console.log(`[producer] queue depth ${result.added} < threshold ${minQueueDepth}, scanning again...`);
        await sleep(5000);
        continue;
      }

      // Step 6: 等待下次扫描
      console.log(`[producer] scan complete, waiting ${PRODUCER_SCAN_INTERVAL_MS}ms...`);
      await sleep(PRODUCER_SCAN_INTERVAL_MS);

    } catch (err) {
      console.error(`[producer] ❌ scan error: ${err.message}`);
      consecutiveErrors++;
      
      if (isSessionError(err.message)) {
        if (consecutiveErrors >= PRODUCER_MAX_CONSECUTIVE_ERRORS) {
          const recover = await healthCheckAndRecover(profileId);
          if (!recover.ok) {
            return { ok: false, reason: 'auto_recovery_failed' };
          }
          consecutiveErrors = 0;
        }
      }

      console.log(`[producer] waiting ${PRODUCER_SCAN_INTERVAL_MS}ms after error...`);
      await sleep(PRODUCER_SCAN_INTERVAL_MS);
    }
  }
}

// Main entry
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      parsed[key] = value;
      if (value !== 'true') i++;
    }
  }
  runProducerTask(parsed).then(result => {
    console.log('[producer] exit:', result);
    process.exit(result.ok ? 0 : 1);
  }).catch(err => {
    console.error('[producer] fatal:', err);
    process.exit(1);
  });
}
